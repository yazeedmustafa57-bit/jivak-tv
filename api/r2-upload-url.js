// Cloudflare R2 – Presigned-Upload-URL (Server-seitig).
// Der Browser lädt die Datei direkt per PUT zu R2 hoch (kein Vercel-Größenlimit).
// Aktiv, sobald die R2_*-Umgebungsvariablen auf Vercel gesetzt sind.
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const config = { maxDuration: 30 }

const ALLOWED_FOLDERS = new Set(['images', 'media', 'covers', 'gallery', 'videos', 'tiktok', 'authors'])
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024 // R2: bis 5 GB pro PUT – wir erlauben 4 GB
const EXPIRES = 3600
// Sicherheitsgrenze: nie mehr als 9 GiB speichern (kostenloses R2-Limit: 10 GB).
// Damit kann der Account niemals versehentlich über das Gratis-Limit hinauslaufen.
const R2_MAX_TOTAL_BYTES = 9 * 1024 * 1024 * 1024
const USAGE_CACHE_MS = 30 * 1000
let usageCache = { at: 0, bytes: 0 }

/** Summiert alle Objektgrößen im Bucket (ListObjectsV2, paginiert). */
async function bucketUsage(client, bucket) {
  const now = Date.now()
  if (now - usageCache.at < USAGE_CACHE_MS) return usageCache.bytes
  let total = 0
  let token
  do {
    const { Contents, NextContinuationToken } = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })
    )
    for (const obj of Contents || []) total += obj.Size || 0
    token = NextContinuationToken
  } while (token)
  usageCache = { at: now, bytes: total }
  return total
}
const STAFF_ROLES = new Set(['admin', 'editor', 'author', 'media'])

/** Verlangt eine gültige Mitarbeiter-Session (Bearer-Token). */
async function requireStaff(req) {
  const url = process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !key) return { error: 'not-configured' }
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return { error: 'auth' }
  const token = h.slice(7).trim()
  if (!token) return { error: 'auth' }
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data || !data.user) return { error: 'auth' }
    const md = data.user.user_metadata || {}
    if (!STAFF_ROLES.has(md.role)) return { error: 'forbidden' }
    return { user: data.user, role: md.role }
  } catch {
    return { error: 'auth' }
  }
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })

  const accountId = process.env.R2_ACCOUNT_ID || ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const bucket = process.env.R2_BUCKET || ''
  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    return res.status(501).json({ ok: false, reason: 'not-configured', error: 'R2 nicht konfiguriert' })
  }

  // Nur eingeloggte Mitarbeiter dürfen Upload-URLs anfordern.
  const who = await requireStaff(req)
  if (who.error) {
    return res.status(who.error === 'forbidden' ? 403 : 401).json({ ok: false, error: who.error })
  }

  let body
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid-json' })
  }

  // Aktion "usage": aktuellen Speicherstand liefern (für die Admin-Anzeige).
  if (String(body.action) === 'usage') {
    const usageClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    })
    try {
      const bytes = await bucketUsage(usageClient, bucket)
      return res.status(200).json({ ok: true, usageBytes: bytes, maxBytes: R2_MAX_TOTAL_BYTES, provider: 'r2' })
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'usage-failed', message: String((err && err.message) || err) })
    }
  }

  // Aktion "list": alle Dateien mit Größe auflisten (für die Speicher-Verwaltung).
  if (String(body.action) === 'list') {
    const listClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    })
    try {
      const files = []
      let token
      do {
        const { Contents, NextContinuationToken } = await listClient.send(
          new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })
        )
        for (const obj of Contents || []) {
          const key = obj.Key || ''
          const slash = key.lastIndexOf('/')
          files.push({
            key,
            folder: slash > 0 ? key.slice(0, slash) : '',
            name: slash > 0 ? key.slice(slash + 1) : key,
            size: obj.Size || 0,
            lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null
          })
        }
        token = NextContinuationToken
      } while (token)
      files.sort((a, b) => (b.size || 0) - (a.size || 0))
      const used = files.reduce((s, f) => s + (f.size || 0), 0)
      return res.status(200).json({ ok: true, files, usageBytes: used, maxBytes: R2_MAX_TOTAL_BYTES })
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'list-failed', message: String((err && err.message) || err) })
    }
  }

  // Aktion "delete": Datei aus R2 löschen (gleiche Auth wie Presign).
  if (String(body.action) === 'delete') {
    const path = String(body.path || '').replace(/^\/+|\/+$/g, '')
    if (!/^[A-Za-z0-9._/-]{1,300}$/.test(path) || path.includes('..')) {
      return res.status(400).json({ ok: false, error: 'invalid-path' })
    }
    const delClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    })
    try {
      await delClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }))
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'delete-failed', message: String((err && err.message) || err) })
    }
  }

  const folder = String(body.folder || 'media').replace(/^\/+|\/+$/g, '')
  const name = String(body.name || '').split('?')[0]
  const contentType = String(body.contentType || 'application/octet-stream')
  const size = Number(body.size) || 0

  if (!ALLOWED_FOLDERS.has(folder)) return res.status(400).json({ ok: false, error: 'folder-not-allowed' })
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,160}$/.test(name)) {
    return res.status(400).json({ ok: false, error: 'invalid-name' })
  }
  if (size > MAX_FILE_BYTES) {
    return res.status(413).json({ ok: false, reason: 'too-large', maxBytes: MAX_FILE_BYTES })
  }

  const key = `${folder}/${name}`
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })

  // Speichergrenze prüfen: Hochladen nur, solange das Gratis-Limit sicher bleibt.
  try {
    const used = await bucketUsage(client, bucket)
    if (used + size > R2_MAX_TOTAL_BYTES) {
      return res.status(413).json({ ok: false, reason: 'quota-exceeded', usageBytes: used, maxBytes: R2_MAX_TOTAL_BYTES })
    }
  } catch (err) {
    // Usage-Prüfung darf den Upload nicht blockieren, wenn sie fehlschlägt.
    console.error('r2 usage check failed:', (err && err.message) || err)
  }

  try {
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000'
      }),
      { expiresIn: EXPIRES }
    )
    return res.status(200).json({ ok: true, uploadUrl, publicUrl: `${publicBase}/${key}`, expiresIn: EXPIRES, maxBytes: R2_MAX_TOTAL_BYTES })
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'presign-failed', message: String(err && err.message || err) })
  }
}
