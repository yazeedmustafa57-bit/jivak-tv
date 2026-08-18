// Bild-Optimierung für ROJ TV.
// Skaliert Remote-Bilder serverseitig und liefert WebP (optional AVIF/JPEG),
// damit die Seite schnell lädt und wenig Datenvolumen verbraucht.
// Aufruf: /api/image?src=<encoded-url>&w=<breite>&q=<qualität>&f=<webp|avif|jpeg|png|auto>
import sharp from 'sharp'

export const config = { maxDuration: 30 }

const ALLOWED_HOSTS = new Set([
  'ylxvowivyyulmrdrtppj.supabase.co',
  'i.ytimg.com',
  'img.youtube.com'
])

// Cloudflare-R2-Host (falls R2 konfiguriert) für die Bild-Optimierung erlauben.
try {
  const r2Host = new URL(process.env.R2_PUBLIC_URL || '').hostname
  if (r2Host) ALLOWED_HOSTS.add(r2Host)
} catch {
  /* R2 nicht konfiguriert */
}

const MAX_WIDTH = 2400
const DEFAULT_QUALITY = 80
const TIMEOUT_MS = 8000

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' })

  const src = typeof req.query.src === 'string' ? req.query.src : ''
  const w = Math.min(MAX_WIDTH, Math.max(16, Number(req.query.w) || 1200))
  const q = Math.min(95, Math.max(20, Number(req.query.q) || DEFAULT_QUALITY))
  let fmt = typeof req.query.f === 'string' ? req.query.f.toLowerCase() : 'auto'
  if (!['auto', 'webp', 'avif', 'jpeg', 'png'].includes(fmt)) fmt = 'auto'

  let url
  try {
    url = new URL(src)
    if (!/^https?:$/.test(url.protocol)) throw new Error('protocol')
  } catch {
    return res.status(400).json({ error: 'invalid-src' })
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    return res.status(400).json({ error: 'host-not-allowed' })
  }

  // Keine Weiterleitungen auf fremde Hosts (SSRF-Schutz): Nach einem Redirect
  // wird der Ziel-Host erneut gegen die Allowlist geprüft.
  let effectiveUrl = url
  for (let hop = 0; hop < 3; hop += 1) {
    const probe = await fetch(effectiveUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(4000) }).catch(() => null)
    if (!probe || probe.status < 300 || probe.status >= 400) break
    const location = probe.headers.get('location')
    if (!location) break
    const next = new URL(location, effectiveUrl)
    if (!ALLOWED_HOSTS.has(next.hostname)) {
      return res.status(400).json({ error: 'host-not-allowed' })
    }
    effectiveUrl = next
  }

  if (fmt === 'auto') {
    const accept = String(req.headers['accept'] || '')
    fmt = accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : 'jpeg'
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let upstream
  try {
    upstream = await fetch(effectiveUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ROJTVImageBot/1.0)',
        Accept: 'image/*'
      },
      signal: ctrl.signal,
      redirect: 'manual'
    })
    // Nach maximal 3 selbst geprüften Hops einen finalen Redirect erlauben.
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) throw new Error('redirect-loop')
      const next = new URL(location, effectiveUrl)
      if (!ALLOWED_HOSTS.has(next.hostname)) throw new Error('host-not-allowed')
      upstream = await fetch(next.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ROJTVImageBot/1.0)', Accept: 'image/*' },
        signal: ctrl.signal,
        redirect: 'follow'
      })
    }
  } catch {
    return res.status(502).json({ error: 'fetch-failed' })
  } finally {
    clearTimeout(timer)
  }

  if (!upstream.ok) return res.status(502).json({ error: 'upstream-' + upstream.status })
  const type = upstream.headers.get('content-type') || ''
  if (!type.startsWith('image/')) return res.status(400).json({ error: 'not-image' })

  const body = Buffer.from(await upstream.arrayBuffer())
  try {
    const img = sharp(body, { failOn: 'none' }).rotate()
    const meta = await img.metadata()
    const width = Math.min(w, meta.width || w)
    const pipeline = img.resize({ width, withoutEnlargement: true })
    let out
    if (fmt === 'avif') out = await pipeline.avif({ quality: q, effort: 4 }).toBuffer()
    else if (fmt === 'webp') out = await pipeline.webp({ quality: q }).toBuffer()
    else if (fmt === 'png') out = await pipeline.png({ compressionLevel: 8 }).toBuffer()
    else out = await pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer()

    const mime = fmt === 'avif' ? 'image/avif' : fmt === 'webp' ? 'image/webp' : fmt === 'png' ? 'image/png' : 'image/jpeg'
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400')
    res.setHeader('CDN-Cache-Control', 'public, max-age=604800')
    res.setHeader('Vary', 'Accept')
    return res.status(200).send(out)
  } catch {
    return res.status(502).json({ error: 'convert-failed' })
  }
}
