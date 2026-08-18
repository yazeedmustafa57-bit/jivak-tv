import { useEffect, useRef, useState } from 'react'

/**
 * Quell-Fallback für native Videos (MP4 → WebM).
 *
 * Wenn der Browser die primäre Datei (z. B. H.264) nicht abspielen kann –
 * sofortiger Fehler beim Laden/Dekodieren oder keinerlei Daten innerhalb des
 * Watchdog-Zeitfensters – wird automatisch auf die WebM-Schwesterdatei
 * (.mp4 → .webm) umgeschaltet. Das verhindert schwarze Bildschirme auf
 * Geräten, deren Hardware-Dekoder den Codec nicht unterstützt.
 *
 * @param {import('react').RefObject} videoRef Ref auf das <video>-Element
 * @param {string|null} src            Primäre Quell-URL (MP4)
 * @param {boolean} active             Soll der Fallback aktiv sein?
 * @param {Function|null} onFail       Wird aufgerufen, wenn auch WebM fehlschlägt
 * @returns {{ source: string|null, hasFallback: boolean }}
 */
export default function useVideoSourceFallback(videoRef, src, active = true, onFail = null) {
  const [source, setSource] = useState(src || null)
  const onFailRef = useRef(onFail)
  onFailRef.current = onFail
  const fallbackUrl = webmSibling(src)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !active || !src || !fallbackUrl) {
      setSource(src || null)
      return undefined
    }

    setSource(src)
    let attempt = 0
    let watchdog = null
    let cancelled = false

    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog)
        watchdog = null
      }
    }

    const swap = () => {
      if (attempt !== 0) return
      attempt = 1
      clearWatchdog()
      const v = videoRef.current
      if (!v) return
      // Nur den State wechseln – das Laden/Abspielen übernimmt der
      // loadAndPlay-Effekt NACH dem React-Re-Render. Ein direktes Setzen von
      // v.src + load() + play() hier würde durch das anschließende
      // src-Attribut-Update von React abgebrochen (Race): mit preload="none"
      // startet die Ladung danach nie wieder und das Video bleibt schwarz.
      setSource(fallbackUrl)
      armWatchdog(20000)
    }

    const armWatchdog = (delay) => {
      clearWatchdog()
      watchdog = setTimeout(() => {
        watchdog = null
        if (cancelled) return
        const v = videoRef.current
        if (!v || !v.src || v.readyState > 0) return
        if (attempt === 0) {
          swap()
        } else if (onFailRef.current) {
          onFailRef.current()
        }
      }, delay)
    }

    const onError = () => {
      clearWatchdog()
      if (cancelled) return
      if (attempt === 0) {
        swap()
      } else if (onFailRef.current) {
        onFailRef.current()
      }
    }

    const onData = () => clearWatchdog()

    video.addEventListener('error', onError)
    video.addEventListener('loadeddata', onData)
    video.addEventListener('playing', onData)

    // Großzügiger initialer Watchdog: Auf langsamen Mobilverbindungen darf das
    // Primärformat (MP4) länger laden, bevor auf die WebM-Schwesterdatei
    // gewechselt wird (der Wechsel lädt sonst die komplette Datei neu).
    if (video.canPlayType('video/webm')) armWatchdog(20000)

    return () => {
      cancelled = true
      clearWatchdog()
      video.removeEventListener('error', onError)
      video.removeEventListener('loadeddata', onData)
      video.removeEventListener('playing', onData)
    }
  }, [videoRef, src, active, fallbackUrl])

  // Nach jedem Quellwechsel (initialer Start ODER Fallback-Swap) das Video
  // laden und abspielen. Der Effekt läuft erst NACH dem React-Re-Render, in
  // dem das neue src-Attribut gesetzt wurde – dadurch wird die gestartete
  // Ladung nicht mehr abgebrochen und preload="none"-Videos starten zuverlässig.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !active || !source) return undefined
    const start = () => {
      try {
        const p = video.play()
        if (p) p.catch(() => {
          video.muted = true
          const p2 = video.play()
          if (p2) p2.catch(() => {})
        })
      } catch {
        /* Wird beim nächsten Quellwechsel erneut versucht */
      }
    }
    video.load()
    start()
  }, [videoRef, source, active])

  return { source, hasFallback: Boolean(fallbackUrl && active) }
}

/** Leitet aus einer MP4-URL die WebM-Schwesterdatei ab (.mp4 → .webm). */
function webmSibling(src) {
  if (!src || typeof src !== 'string') return null
  if (/^idb:/.test(src)) return null
  const m = src.match(/\.mp4(\?|#|$)/i)
  if (!m) return null
  const idx = m.index
  return src.slice(0, idx) + src.slice(idx, idx + 4).replace(/mp4/i, 'webm') + src.slice(idx + 4)
}
