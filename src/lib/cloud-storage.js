// Cloud-Speicher für hochgeladene Medien:
//   1. Cloudflare R2 (falls VITE_R2_PUBLIC_URL gesetzt) – bis 4 GB pro Datei,
//      kostenloser Traffic, empfohlen für lange Videos.
//   2. Supabase Storage (falls VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY gesetzt).
//   3. Lokaler Blob-Speicher (IndexedDB) als letzter Fallback.
import { supabase, cloudEnabled, SUPABASE_URL, SUPABASE_BUCKET, getCloudToken } from './supabase.js'

export const cloudStorageEnabled = cloudEnabled

// Cloudflare R2: aktiv, sobald die öffentliche Bucket-URL gesetzt ist.
export const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL || '').trim().replace(/\/+$/, '')
// R2: aktiv sobald öffentliche URL gesetzt. Bei CORS-Fehlern automatisch Supabase-Fallback.
export const r2Enabled = Boolean(R2_PUBLIC_URL)
export const R2_MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024
export const r2MaxFileBytes = r2Enabled ? R2_MAX_FILE_BYTES : null

// Supabase Free-Plan: max. 50 MB pro Datei, 1 GB Speicher gesamt (Plan-Limit).
export const FREE_TIER_MAX_FILE_BYTES = 50 * 1024 * 1024
export const FREE_TIER_STORAGE_BYTES = 1 * 1024 * 1024 * 1024

// Artikel-Titelbilder / Galeriebilder: max. 25 MB (Full-HD-/Kamera-Fotos).
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024

/** Lädt eine Datei in den öffentlichen Cloud-Speicher hoch und liefert die öffentliche URL. */
export async function uploadToCloud(file, folder = 'media') {
  if (r2Enabled) {
    const r2 = await uploadToR2(file, folder)
    if (r2.ok) return r2
    // R2 fehlgeschlagen (z.B. CORS) → Fallback auf Supabase Storage
    console.warn('[upload] R2 failed, falling back to Supabase:', r2.reason, r2.message)
    if (cloudEnabled) {
      const supa = await uploadToSupabase(file, folder)
      if (supa.ok) return { ...supa, source: 'supabase-fallback' }
      // Beide fehlgeschlagen → R2-Fehlermeldung zeigen (da primärer Provider)
      return r2
    }
    return r2
  }
  return uploadToSupabase(file, folder)
}

/** R2: Presigned-URL vom Server holen und die Datei direkt zu Cloudflare hochladen. */
async function uploadToR2(file, folder = 'media') {
  const size = Number(file?.size) || 0
  if (size > R2_MAX_FILE_BYTES) {
    return { ok: false, reason: 'too-large', size, maxBytes: R2_MAX_FILE_BYTES, message: 'file-too-large' }
  }
  const name = String(file?.name || '')
  const ext = name.includes('.')
    ? name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
    : (file.type || '').includes('image')
      ? 'jpg'
      : 'mp4'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`
  let res
  try {
    const token = await getCloudToken()
    res = await fetch('/api/r2-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ folder, name: fileName, contentType: file.type || 'application/octet-stream', size })
    })
  } catch {
    return { ok: false, reason: 'presign-failed', message: 'R2-Dienst nicht erreichbar' }
  }
  if (!res.ok) {
    if (res.status === 501) return { ok: false, reason: 'not-configured', message: 'R2 nicht konfiguriert' }
    const json = await res.json().catch(() => ({}))
    console.error('[R2 presign] HTTP', res.status, json)
    if (json && json.reason === 'too-large') {
      return { ok: false, reason: 'too-large', size, maxBytes: json.maxBytes || R2_MAX_FILE_BYTES, message: 'file-too-large' }
    }
    if (json && json.reason === 'quota-exceeded') {
      return { ok: false, reason: 'quota-exceeded', usageBytes: json.usageBytes, maxBytes: json.maxBytes }
    }
    return { ok: false, reason: 'presign-failed', message: json && json.message || 'Presigned-URL fehlgeschlagen' }
  }
  const json = await res.json().catch(() => null)
  if (!json || !json.ok || !json.uploadUrl) {
    return { ok: false, reason: 'presign-failed', message: 'Ungültige Antwort vom R2-Dienst' }
  }
  try {
    const up = await fetch(json.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    })
    if (!up.ok) {
      const errBody = await up.text().catch(() => '')
      console.error('[R2 PUT] failed:', up.status, up.statusText, errBody.slice(0, 500))
      return { ok: false, reason: 'upload-failed', message: `R2-Upload fehlgeschlagen (HTTP ${up.status}: ${errBody.slice(0, 200) || up.statusText})` }
    }
  } catch (err) {
    console.error('[R2 PUT] network error:', err)
    return { ok: false, reason: 'upload-failed', message: `R2-Upload fehlgeschlagen: ${String(err && err.message || err)}` }
  }
  return { ok: true, url: json.publicUrl, source: 'r2' }
}

/** Supabase Storage als Standard-Pfad (1 GB gesamt, max. 50 MB pro Datei). */
async function uploadToSupabase(file, folder = 'media') {
  if (!cloudEnabled || !supabase) {
    return { ok: false, reason: 'not-configured' }
  }
  const size = Number(file?.size) || 0
  if (size > FREE_TIER_MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      size,
      maxBytes: FREE_TIER_MAX_FILE_BYTES,
      message: 'file-too-large'
    }
  }
  const name = String(file?.name || '')
  const ext = name.includes('.')
    ? name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
    : (file.type || '').includes('image')
      ? 'jpg'
      : 'mp4'
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`
  // 1) Signierte Upload-URL vom Server holen (Service-Role-Key) und die Datei
  //    direkt zu Supabase hochladen. Umgeht RLS und das 4,5-MB-Request-Body-
  //    Limit der Vercel-Serverless-Funktion (die Datei geht nie durch die API).
  const signed = await requestSignedUpload(folder, path.split('/').pop(), file.type, size)
  if (signed && signed.error) {
    return { ok: false, reason: signed.error, message: signed.message || 'upload-sign-failed' }
  }
  if (signed && signed.signedUrl) {
    try {
      const up = await fetch(signed.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      })
      if (up.ok) {
        const url = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`
        // Kurz verifizieren, dass das Objekt öffentlich lesbar ist. Nie eine
        // URL speichern, die 404 liefert (kaputte Titelbilder auf Startseite/
        // Übersichten, obwohl die Detailseite über den CDN-Cache noch geht).
        if (await isPubliclyReadable(url)) {
          return { ok: true, url, source: 'supabase' }
        }
      }
    } catch {
      /* Fallback unten */
    }
  }
  // 2) Fallback: direkter SDK-Upload (funktioniert, wenn die Storage-Policies es erlauben).
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false
  })
  if (error || !data) {
    return { ok: false, reason: 'upload-failed', message: error?.message || 'Cloud-Upload fehlgeschlagen' }
  }
  const { data: pub } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(data.path)
  return { ok: true, url: pub?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${data.path}` }
}

/** Prüft, ob eine öffentliche Storage-URL tatsächlich ausgeliefert wird (kein 404/502). */
async function isPubliclyReadable(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Range: 'bytes=0-1023' }
    })
    return res.ok
  } catch {
    return false
  }
}

/** Fragt beim Server eine signierte Upload-URL für Supabase Storage an. */
async function requestSignedUpload(folder, name, contentType, size) {
  try {
    const token = await getCloudToken()
    const res = await fetch('/api/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ folder, name, contentType: contentType || 'application/octet-stream', size })
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = res.status === 401 ? 'auth' : res.status === 403 ? 'forbidden' : res.status === 413 ? 'too-large' : 'sign-failed'
      const msg = json && json.error ? json.error : `HTTP ${res.status}`
      console.error('[upload-sign]', reason, msg, 'token present:', !!token)
      return { error: reason, message: msg, httpStatus: res.status }
    }
    if (!json || !json.ok || !json.signedUrl) {
      return { error: 'sign-failed', message: json && json.error || 'missing signedUrl' }
    }
    return json
  } catch (err) {
    console.error('[upload-sign] network error:', err)
    return { error: 'network', message: String(err && err.message || err) }
  }
}

/** Ermittelt den aktuell belegten Cloud-Speicher (Summe aller Dateien im Bucket). */
export async function getStorageUsage() {
  if (r2Enabled) {
    try {
      const token = await getCloudToken()
      const res = await fetch('/api/r2-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'usage' })
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json && json.ok) {
        return { bytes: json.usageBytes, maxBytes: json.maxBytes, maxFileBytes: R2_MAX_FILE_BYTES, provider: 'r2' }
      }
    } catch {
      /* R2-Dienst nicht erreichbar */
    }
    return { bytes: null, maxBytes: null, maxFileBytes: R2_MAX_FILE_BYTES, provider: 'r2' }
  }
  if (!cloudEnabled || !supabase) return null
  const PAGE = 100
  async function listPage(path, offset) {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(path || '', {
      limit: PAGE,
      offset
    })
    if (error) throw error
    return data || []
  }
  async function folderBytes(path) {
    let total = 0
    let offset = 0
    for (;;) {
      const entries = await listPage(path, offset)
      for (const entry of entries) {
        if (entry.id) total += (entry.metadata && entry.metadata.size) || 0
      }
      if (entries.length < PAGE) break
      offset += PAGE
    }
    return total
  }
  let bytes = 0
  const root = await listPage('', 0)
  for (const entry of root) {
    if (entry.id) {
      bytes += (entry.metadata && entry.metadata.size) || 0
    } else if (entry.name) {
      bytes += await folderBytes(entry.name)
    }
  }
  return { bytes, maxBytes: FREE_TIER_STORAGE_BYTES, maxFileBytes: FREE_TIER_MAX_FILE_BYTES, provider: 'supabase' }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i

/** Listet bereits hochgeladene Bilder aus dem Cloud-Speicher (öffentliche URLs). */
export async function listCloudImages() {
  if (!cloudEnabled || !supabase) return []
  const folders = ['images', 'media', 'covers']
  const out = []
  const seen = new Set()
  for (const folder of folders) {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(folder, { limit: 300 })
    if (error) continue
    for (const entry of data || []) {
      if (!entry.id || !IMAGE_EXT.test(entry.name || '')) continue
      const { data: pub } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(`${folder}/${entry.name}`)
      const url = pub?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${folder}/${entry.name}`
      if (!url) continue
      if (!seen.has(url)) {
        seen.add(url)
        out.push({ url, name: entry.name, folder })
      }
    }
  }
  return out
}

/** Listet alle Dateien im R2-Speicher mit Größe (für die Speicher-Verwaltung). */
export async function listR2Files() {
  if (!r2Enabled) return null
  try {
    const token = await getCloudToken()
    const res = await fetch('/api/r2-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: 'list' })
    })
    const json = await res.json().catch(() => null)
    if (res.ok && json && json.ok) {
      return { files: json.files || [], usageBytes: json.usageBytes, maxBytes: json.maxBytes }
    }
  } catch {
    /* R2-Dienst nicht erreichbar */
  }
  return null
}

/** Löscht eine hochgeladene Datei aus dem Cloud-Speicher (erfordert Staff-Session). */
export async function deleteCloudImage(item) {
  if (!item) return { ok: false, message: 'invalid-item' }
  const path = `${item.folder}/${item.name}`.replace(/^\/+/, '')
  if (item.provider === 'r2') {
    try {
      const token = await getCloudToken()
      const res = await fetch('/api/r2-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'delete', path })
      })
      if (!res.ok) return { ok: false, message: 'r2-delete-failed' }
      return { ok: true }
    } catch {
      return { ok: false, message: 'r2-delete-failed' }
    }
  }
  if (!cloudEnabled || !supabase) return { ok: false, message: 'not-configured' }
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([path])
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

/** Zerlegt eine öffentliche Storage-URL in { url, folder, name, provider } – oder null. */
export function cloudItemFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const clean = url.split('?')[0]
  // Supabase-Storage
  const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`
  const idx = clean.indexOf(marker)
  if (idx !== -1) {
    const rest = clean.slice(idx + marker.length)
    const slash = rest.lastIndexOf('/')
    if (slash <= 0) return null
    const folder = rest.slice(0, slash)
    const name = rest.slice(slash + 1)
    if (!folder || !name) return null
    return { url, folder, name, provider: 'supabase' }
  }
  // Cloudflare R2 (öffentliche r2.dev-/Custom-Domain-URL)
  if (R2_PUBLIC_URL) {
    const base = R2_PUBLIC_URL + '/'
    if (clean.startsWith(base)) {
      const rest = clean.slice(base.length)
      const slash = rest.lastIndexOf('/')
      if (slash <= 0) return null
      const folder = rest.slice(0, slash)
      const name = rest.slice(slash + 1)
      if (!folder || !name) return null
      return { url, folder, name, provider: 'r2' }
    }
  }
  return null
}
