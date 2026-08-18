// Social-Preview-Auflösung (OpenGraph) für Jivak TV.
// Wählt für Artikel/Videos/Fotos das beste absolute Bild für og:image aus:
//   1. hochgeladenes Cover (absolute URL oder /pfad)
//   2. offizielles YouTube-Thumbnail bei Video-Artikeln
//   3. Logo als Fallback
// Reine Logik ohne DOM/Server-Abhängigkeiten – wird sowohl im Browser
// (Seo.jsx) als auch serverseitig (api/og.js) verwendet.
import { parseYouTubeId } from './youtube.js'

export const SITE_URL = 'https://jivak-tv.vercel.app'

/** Macht aus einem Bild-Wert eine absolute URL oder liefert null. */
export function absoluteImageUrl(image) {
  if (typeof image !== 'string' || !image.trim()) return null
  if (/^https?:\/\//i.test(image)) return image
  if (/^data:/i.test(image)) return null
  if (image.startsWith('/')) return SITE_URL + image
  return null
}

/** Offizielles YouTube-Thumbnail zu einem Link (oder null). */
export function youtubeThumbUrl(url) {
  const id = parseYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

/** Bestes og:image für einen Artikel. */
export function resolveOgImage(article = {}) {
  const absolute = absoluteImageUrl(article.image)
  if (absolute) return absolute
  if (article.mediaType === 'video' && article.mediaUrl) {
    const yt = youtubeThumbUrl(article.mediaUrl)
    if (yt) return yt
  }
  return `${SITE_URL}/logo.png`
}
