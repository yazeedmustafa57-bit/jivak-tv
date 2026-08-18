// Bild-Optimierung (Frontend-Helfer).
// Wandelt Remote-Bild-URLs in optimierte URLs um (Serverless /api/image →
// skaliert + WebP). Lokale Bilder (data:, idb://, blob:) bleiben unverändert.

const OPT_BASE = '/api/image'

const ALLOWED_HOSTS = ['ylxvowivyyulmrdrtppj.supabase.co', 'i.ytimg.com', 'img.youtube.com']

// Cloudflare-R2-Host (falls VITE_R2_PUBLIC_URL gesetzt) für die Bild-Optimierung.
const R2_HOST = (import.meta.env.VITE_R2_PUBLIC_URL || '').trim().replace(/^https?:\/\//i, '').split('/')[0]
if (R2_HOST) ALLOWED_HOSTS.push(R2_HOST)

export function canOptimizeImage(url) {
  if (!url || typeof url !== 'string') return false
  if (!/^https?:\/\//i.test(url)) return false
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

export function optimizeImageUrl(url, width = 1200, format = 'webp') {
  if (!canOptimizeImage(url)) return url
  return `${OPT_BASE}?src=${encodeURIComponent(url)}&w=${Math.round(width)}&f=${format}&q=80`
}

export function imageSrcSet(url, widths = [480, 800, 1200, 1920]) {
  if (!canOptimizeImage(url)) return ''
  return widths.map((w) => `${optimizeImageUrl(url, w)} ${w}w`).join(', ')
}
