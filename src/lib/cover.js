// Automatisch generierte Platzhalter-Titelbilder für Jivak TV.
// Neutraler BBC-/Rudaw-Stil: weißer Hintergrund ohne Farbverläufe – die Bilder liegen direkt auf dem Seitenweiß.
// Sobald ein echtes Bild hochgeladen wird, ersetzt es den Platzhalter.
// Kein externer Bilddienst, kein Stock.

import { parseYouTubeId } from './youtube.js'

const MOTIFS = ['sun', 'mountains', 'orbit', 'rays']

function hashMod(text, mod) {
  let h = 0
  for (let i = 0; i < String(text).length; i += 1) {
    h = (h * 31 + String(text).charCodeAt(i)) % 997
  }
  return Math.abs(h) % mod
}

function motifSvg(kind) {
  switch (kind) {
    case 'sun':
      return `
    <circle cx="1230" cy="230" r="150" fill="rgba(28,26,23,0.05)"/>
    <circle cx="1230" cy="230" r="112" fill="none" stroke="rgba(28,26,23,0.10)" stroke-width="3"/>
    <path d="M0 560 Q420 500 820 560 T1600 545 V900 H0 Z" fill="rgba(28,26,23,0.04)"/>
    <path d="M0 650 Q520 585 940 650 T1600 635 V900 H0 Z" fill="rgba(28,26,23,0.05)"/>`
    case 'mountains':
      return `
    <circle cx="360" cy="280" r="88" fill="rgba(28,26,23,0.05)"/>
    <path d="M0 900 V660 L250 480 L500 660 L800 430 L1120 670 L1400 510 L1600 650 V900 Z" fill="rgba(28,26,23,0.05)"/>
    <path d="M0 900 V730 L320 570 L640 740 L1000 550 L1360 750 L1600 630 V900 Z" fill="rgba(28,26,23,0.06)"/>`
    case 'orbit':
      return `
    <circle cx="1290" cy="190" r="250" fill="none" stroke="rgba(28,26,23,0.08)" stroke-width="2.5"/>
    <circle cx="1290" cy="190" r="178" fill="none" stroke="rgba(28,26,23,0.06)" stroke-width="2.5"/>
    <circle cx="1290" cy="190" r="106" fill="rgba(28,26,23,0.05)"/>
    <circle cx="1290" cy="190" r="34" fill="rgba(28,26,23,0.08)"/>
    <path d="M0 640 Q420 575 840 640 T1600 625 V900 H0 Z" fill="rgba(28,26,23,0.05)"/>`
    case 'rays':
    default:
      return `
    <g stroke="rgba(28,26,23,0.05)" stroke-width="30">
      <line x1="-120" y1="480" x2="1720" y2="120"/>
      <line x1="-120" y1="600" x2="1720" y2="240"/>
      <line x1="-120" y1="720" x2="1720" y2="360"/>
      <line x1="-120" y1="840" x2="1720" y2="480"/>
    </g>
    <circle cx="1210" cy="240" r="128" fill="rgba(28,26,23,0.05)"/>
    <path d="M0 900 V700 Q520 620 900 700 T1600 690 V900 Z" fill="rgba(28,26,23,0.05)"/>`
  }
}

function buildSvg(motif) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  <rect width="1600" height="900" fill="#FFFFFF"/>
  ${motifSvg(motif)}
  <text x="48" y="842" font-family="'Almarai','Inter',sans-serif" font-size="32" font-weight="700" letter-spacing="0.3" fill="#8F897E">Jivak <tspan fill="#C4472C">Media</tspan></text>
</svg>`
}

/**
 * Echtbild-Vorschaubild für Video-Artikel (Rudaw/BBC-Stil):
 * YouTube-Videos bekommen ihr offizielles Thumbnail, eigene MP4/HLS-Videos
 * den Platzhalter, bis der Redakteur ein Poster hochlädt.
 */
export function coverFor(article = {}, categorySlug = '') {
  if (article && article.mediaType === 'video' && article.mediaUrl) {
    const id = parseYouTubeId(article.mediaUrl)
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  }
  return autoCover(article, categorySlug)
}

/** Offizielles YouTube-Thumbnail zu einem Link (oder null). */
export function youtubeThumb(url) {
  const id = parseYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

// Standard-Cover für Artikelkarten und Detailseiten
export function autoCover(article = {}, categorySlug = '') {
  const seed = String(article.id || article.slug || '')
  const motif = MOTIFS[hashMod(seed, MOTIFS.length)]
  const svg = buildSvg(motif)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Cover für die Hero-Fläche (stabil, ohne Hash-Variation)
export function heroCover(categorySlug = 'gemeinschaft') {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildSvg('sun'))}`
}
