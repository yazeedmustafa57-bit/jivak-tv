import { useEffect, useRef, useState } from 'react'
import OptimizedImage from './OptimizedImage.jsx'
import useAutoPlayInView from '../lib/useAutoPlayInView.js'
import useBlurBackdrop from '../lib/useBlurBackdrop.js'
import useVideoSourceFallback from '../lib/useVideoSourceFallback.js'
import { useMediaUrl } from '../lib/useMediaUrl.js'
import { isDirectMediaUrl, isHlsUrl } from '../lib/youtube.js'

/**
 * Inline-Video-Vorschau im Stil von Rudaw TV für Karten (Startseite):
 * - Native Dateien (MP4/WebM/HLS): laden erst in der Nähe des Viewports,
 *   spielen stumm in Schleife, sobald sichtbar, und pausieren beim Verlassen
 * - YouTube-Links werden auf der Startseite bewusst NICHT mehr automatisch
 *   abgespielt – die Karte zeigt nur das Poster mit Play-Badge. Abgespielt
 *   wird der YouTube-Link erst auf der Artikelseite im normalen Player.
 * - Alles über die Intersection Observer API
 */
export default function VideoPreview({
  url,
  poster,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  onPlayingChange = null
}) {
  const wrapRef = useRef(null)
  const videoRef = useRef(null)
  const bgRef = useRef(null)
  const [near, setNear] = useState(false)
  const resolvedUrl = useMediaUrl(url)
  const native = Boolean(url) && (isDirectMediaUrl(url) || isHlsUrl(url))
  const { source: playSrc } = useVideoSourceFallback(
    videoRef,
    native && near ? resolvedUrl : null,
    native && near,
    null
  )
  // Weichgezeichneter Hintergrund nur bei Hochformat-Videos in Querformat-Containern
  const needsBg = useBlurBackdrop(videoRef, wrapRef, bgRef, near && native)

  // Lazy-Load: Quelle erst anfordern, wenn die Karte nahe am Viewport ist
  useEffect(() => {
    const el = wrapRef.current
    if (!el || near || typeof IntersectionObserver === 'undefined') return undefined
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true)
        obs.disconnect()
      }
    }, { rootMargin: '600px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [near])

  // Native Videos: Play/Pause direkt am <video>-Element
  useAutoPlayInView(wrapRef, {
    enabled: near && native,
    getVideo: () => videoRef.current,
  })

  return (
    <div ref={wrapRef} className="video-preview-card">
      {poster ? (
        <OptimizedImage src={poster} alt="" widths={[480, 800, 1200]} sizes={sizes} />
      ) : null}
      {native ? (
        <>
          {needsBg ? (
            <video
              ref={bgRef}
              className="video-preview-bg"
              muted
              loop
              playsInline
              preload="none"
              tabIndex={-1}
              aria-hidden="true"
              poster={poster || undefined}
              src={playSrc}
            />
          ) : null}
          <video
            ref={videoRef}
            className="video-preview-el"
            muted
            loop
            playsInline
            preload="none"
            tabIndex={-1}
            aria-hidden="true"
            poster={poster || undefined}
            src={playSrc}
            onPlaying={() => onPlayingChange && onPlayingChange(true)}
            onPause={() => onPlayingChange && onPlayingChange(false)}
          />
        </>
      ) : null}
    </div>
  )
}
