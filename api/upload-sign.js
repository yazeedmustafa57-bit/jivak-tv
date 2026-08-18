// Signierte Upload-URL für Supabase Storage (Server-seitig, Service-Role-Key).
// Der Browser lädt die Datei direkt per PUT zu Supabase hoch (kein RLS-Block,
// kein Vercel-4,5-MB-Request-Body-Limit – die Datei geht nie durch die Funktion).
// Aktiv, sobald VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY auf Vercel gesetzt sind.
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 30 }

const ALLOWED_FOLDERS = new Set(['images', 'media', 'covers', 'gallery', 'videos', 'tiktok', 'authors'])
const MAX_FILE_BYTES = 50 * 1024 * 1024 // Supabase Free-Plan: max. 50 MB pro Datei
const STAFF_ROLES = new Set(['admin', 'editor', 'author', 'media'])

/** Verlangt eine gültige Mitarbeiter-Session (Bearer-Token). */
async function requireStaff(supabase, req) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return { error: 'auth' }
  const token = h.slice(7).trim()
  if (!token) return { error: 'auth' }
  try {
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

  const url = process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const bucket = process.env.VITE_SUPABASE_BUCKET || 'jivak-tv'
  if (!url || !key) return res.status(501).json({ ok: false, reason: 'not-configured' })

  let body
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid-json' })
  }

  const folder = String(body.folder || '').replace(/^\/+|\/+$/g, '')
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
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    return res.status(400).json({ ok: false, error: 'invalid-content-type' })
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Nur eingeloggte Mitarbeiter dürfen Upload-URLs anfordern.
  const who = await requireStaff(supabase, req)
  if (who.error) {
    return res.status(who.error === 'forbidden' ? 403 : 401).json({ ok: false, error: who.error })
  }

  const path = `${folder}/${name}`
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) {
      return res.status(500).json({ ok: false, error: (error && error.message) || 'sign-failed' })
    }
    return res.status(200).json({
      ok: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}`
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) })
  }
}
