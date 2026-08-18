// Erkennt YouTube-Links in allen gängigen Formaten und wandelt sie in den
// Embed-Link um, der sich in einem <iframe> einbetten lässt.
//
// Unterstützte Formate:
//   https://www.youtube.com/watch?v=ID
//   https://youtube.com/watch?v=ID
//   https://m.youtube.com/watch?v=ID
//   https://music.youtube.com/watch?v=ID
//   https://youtu.be/ID
//   https://youtube.com/shorts/ID
//   https://www.youtube.com/embed/ID
//   https://www.youtube.com/live/ID
//   https://www.youtube.com/v/ID

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/

/** Domain, von der die Seite eingebettet wird (Pflichtparameter für YouTube-Embeds). */
export const YT_EMBED_ORIGIN = 'https://jivak-tv.vercel.app'

function inspectUrl(input) {
  if (typeof input !== 'string') return null
  let raw = input.trim()
  if (!raw) return null
  if (/^data:/i.test(raw)) return null
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) raw = 'https://' + raw
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const isYouTube =
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be'
  return { url, host, isYouTube }
}

/** Liefert true, wenn der Host zu YouTube gehört (auch bei ungültiger ID). */
export function isYouTubeLink(input) {
  const info = inspectUrl(input)
  return Boolean(info && info.isYouTube)
}

/** Extrahiert die 11-stellige Video-ID oder null. */
export function parseYouTubeId(input) {
  const info = inspectUrl(input)
  if (!info || !info.isYouTube) return null
  const { url, host } = info
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').find(Boolean) || ''
    return YT_ID_RE.test(id) ? id : null
  }
  const path = url.pathname
  const watch = path.match(/^\/watch(?:\/|$)/)
  if (watch) {
    const id = url.searchParams.get('v') || ''
    return YT_ID_RE.test(id) ? id : null
  }
  const m = path.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)
  if (m) return YT_ID_RE.test(m[1]) ? m[1] : null
  return null
}

/**
 * Wandelt einen Link in den Embed-Link um.
 * Ergebnis:
 *   { ok: true,  id, url }                       – gültiger YouTube-Link
 *   { ok: false, reason: 'invalid-id' }          – YouTube, aber ungültige ID
 *   { ok: false, reason: 'not-youtube' }         – anderer Link (z. B. .mp4)
 */
export function toYouTubeEmbed(input) {
  const id = parseYouTubeId(input)
  if (id) return { ok: true, id, url: `https://www.youtube.com/embed/${id}` }
  if (isYouTubeLink(input)) return { ok: false, reason: 'invalid-id' }
  return { ok: false, reason: 'not-youtube' }
}

/** Erkennt eingebettete Videodaten (data:video/…, z. B. aus dem Datei-Upload im Admin). */
export function isDataVideoUrl(input) {
  if (typeof input !== 'string') return false
  return /^data:video\/[a-z0-9.+-]+(?:;base64)?,/i.test(input.trim())
}

/** Erkennt direkte Video-Datei-Links (z. B. .mp4, .webm, .ogg, .mov) sowie eingebettete Daten. */
export function isDirectMediaUrl(input) {
  if (isDataVideoUrl(input)) return true
  if (typeof input !== 'string') return false
  const raw = input.trim()
  if (!raw) return false
  let url
  try {
    url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : 'https://' + raw)
  } catch {
    return false
  }
  return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(url.pathname)
}

/** Erkennt HLS-Streams (.m3u8-Playlisten). */
export function isHlsUrl(input) {
  if (typeof input !== 'string') return false
  const raw = input.trim()
  if (!raw) return false
  let url
  try {
    url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : 'https://' + raw)
  } catch {
    return false
  }
  return /\.m3u8(\?.*)?$/i.test(url.pathname)
}

// ---------- TikTok ----------
const TT_ID_RE = /^\d{15,25}$/

function tiktokInfo(input) {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const isTikTok = host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || host.endsWith('.tiktok.com')
  return { url, host, isTikTok }
}

/** Liefert true, wenn der Link zu TikTok gehört. */
export function isTikTokLink(input) {
  const info = tiktokInfo(input)
  return Boolean(info && info.isTikTok)
}

/** Extrahiert die TikTok-Video-ID (15–25 Ziffern) oder null. */
export function parseTikTokId(input) {
  const info = tiktokInfo(input)
  if (!info || !info.isTikTok) return null
  const m = info.url.pathname.match(/^\/@[^/]+\/video\/(\d+)/) || info.url.pathname.match(/^\/embed\/v2\/(\d+)/)
  return m && TT_ID_RE.test(m[1]) ? m[1] : null
}

/**
 * Wandelt einen TikTok-Link in den Embed-Link um (offizielles iframe-Embed).
 * Ergebnis:
 *   { ok: true,  id, url }                       – gültiger TikTok-Link
 *   { ok: false, reason: 'invalid-id' }          – TikTok, aber ungültige ID
 *   { ok: false, reason: 'not-tiktok' }          – anderer Link
 */
export function toTikTokEmbed(input) {
  const id = parseTikTokId(input)
  if (id) return { ok: true, id, url: `https://www.tiktok.com/embed/v2/${id}` }
  if (isTikTokLink(input)) return { ok: false, reason: 'invalid-id' }
  return { ok: false, reason: 'not-tiktok' }
}

// ---------- Facebook ----------
const FB_ID_RE = /^\d{10,25}$/

function facebookInfo(input) {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const isFacebook = host === 'facebook.com' || host === 'fb.watch' || host.endsWith('.facebook.com')
  return { url, host, isFacebook }
}

/** Liefert true, wenn der Link zu Facebook gehört. */
export function isFacebookLink(input) {
  const info = facebookInfo(input)
  return Boolean(info && info.isFacebook)
}

/** Extrahiert die Facebook-Video-ID oder null. */
export function parseFacebookVideoId(input) {
  const info = facebookInfo(input)
  if (!info || !info.isFacebook) return null
  const path = info.url.pathname
  const m = path.match(/\/videos\/(\d+)/)
  if (m && FB_ID_RE.test(m[1])) return m[1]
  if (/^\/video\.php/.test(path) || /^\/watch/.test(path)) {
    const v = info.url.searchParams.get('v')
    if (v && FB_ID_RE.test(v)) return v
  }
  return null
}

/**
 * Wandelt einen Facebook-Video-Link in den offiziellen Embed-Link um.
 * Ergebnis:
 *   { ok: true,  id, url }                       – gültiger Facebook-Link
 *   { ok: false, reason: 'invalid-id' }          – Facebook, aber ungültige ID
 *   { ok: false, reason: 'not-facebook' }        – anderer Link
 */
export function toFacebookEmbed(input) {
  const id = parseFacebookVideoId(input)
  if (id) {
    const canonical = 'https://www.facebook.com/watch?v=' + id
    const url = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(canonical) + '&show_text=false&width=560'
    return { ok: true, id, url }
  }
  if (isFacebookLink(input)) return { ok: false, reason: 'invalid-id' }
  return { ok: false, reason: 'not-facebook' }
}

// ---------- Vimeo ----------
const VIMEO_ID_RE = /^\d{6,12}$/

function vimeoInfo(input) {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const isVimeo = host === 'vimeo.com' || host === 'player.vimeo.com' || host.endsWith('.vimeo.com')
  return { url, host, isVimeo }
}

/** Liefert true, wenn der Link zu Vimeo gehört. */
export function isVimeoLink(input) {
  const info = vimeoInfo(input)
  return Boolean(info && info.isVimeo)
}

/** Extrahiert die numerische Vimeo-Video-ID oder null. */
export function parseVimeoId(input) {
  const info = vimeoInfo(input)
  if (!info || !info.isVimeo) return null
  const path = info.url.pathname.replace(/\/+$/, '')
  const candidates = []
  const mVideo = path.match(/\/video\/([^/?#]+)/)
  if (mVideo) candidates.push(mVideo[1])
  const mPlayer = path.match(/\/player\/v2\/([^/?#]+)/)
  if (mPlayer) candidates.push(mPlayer[1])
  // Vimeo-Channel-/Hub-Links wie /channels/xyz/<id> und reine /<id>-Links
  const parts = path.split('/').filter(Boolean)
  const last = parts[parts.length - 1] || ''
  if (last && last !== 'video') candidates.push(last)
  const queryId = info.url.searchParams.get('video')
  if (queryId) candidates.push(queryId)
  for (const c of candidates) {
    if (VIMEO_ID_RE.test(c)) return c
  }
  return null
}

/**
 * Vimeo wird bewusst NICHT mehr eingebettet: Der Vimeo-Player zeigt im iframe
 * eigene Fehlermeldungen (z. B. „Fehler 153 – Fehler bei der Konfiguration des
 * Videoplayers“). Stattdessen liefern wir ein „unsupported“, damit die Website
 * eine eigene, verständliche Meldung anzeigen kann.
 * Ergebnis:
 *   { ok: false, reason: 'unsupported' }          – Vimeo-Link (nicht unterstützt)
 *   { ok: false, reason: 'not-vimeo' }            – anderer Link
 */
export function toVimeoEmbed(input) {
  if (isVimeoLink(input)) return { ok: false, reason: 'unsupported' }
  return { ok: false, reason: 'not-vimeo' }
}
