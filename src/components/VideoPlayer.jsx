import { useEffect, useRef, useState } from 'react'
import OptimizedImage from './OptimizedImage.jsx'
import useAutoPlayInView from '../lib/useAutoPlayInView.js'
import useBlurBackdrop from '../lib/useBlurBackdrop.js'
import useVideoSourceFallback from '../lib/useVideoSourceFallback.js'

import { toYouTubeEmbed, YT_EMBED_ORIGIN, isHlsUrl, toTikTokEmbed, toFacebookEmbed, toVimeoEmbed } from '../lib/youtube.js'
import { useI18n } from '../lib/i18n.jsx'
import { useMediaUrl } from '../lib/useMediaUrl.js'

/**
 * Integrierter Medien-Player (eigene Videos + HLS):
 *  - YouTube-Links werden als iframe eingebettet (Embed-URL).
 *  - Eigene Videos (MP4) und HLS-Streams (.m3u8) laufen im nativen
 *    HTML5-Player mit Poster-Vorschau und Play-Overlay – schwarze Bühne.
 *  - Ungültige Links zeigen eine verständliche Fehlermeldung.
 */
export default function VideoPlayer({ url, poster, title, autoStart = false, loop = false, autoPlayOnScroll = true }) {
  const { t } = useI18n()
  const [started, setStarted] = useState(autoStart)
  const [muted, setMuted] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const videoRef = useRef(null)
  const bgRef = useRef(null)
  const wrapRef = useRef(null)
  const resolvedUrl = useMediaUrl(url)
  const embed = url ? toYouTubeEmbed(url) : null
  const tiktok = url ? toTikTokEmbed(url) : null
  const facebook = url ? toFacebookEmbed(url) : null
  const vimeo = url ? toVimeoEmbed(url) : null
  const hls = isHlsUrl(url)
  const { source: playSrc, hasFallback } = useVideoSourceFallback(
    videoRef,
    hls ? null : resolvedUrl,
    started && !hls && !loadError,
    () => setLoadError(true)
  )

  // HLS-Stream über hls.js starten (dynamisch geladen, Safari nutzt nativen HLS-Support)
  useEffect(() => {
    const video = videoRef.current
    if (!video || !started || !hls || !url) return
    let player = null
    let cancelled = false
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !videoRef.current) return
      if (Hls.isSupported()) {
        player = new Hls()
        player.on(Hls.Events.MANIFEST_PARSED, () => {
          const v = videoRef.current
          if (!v) return
          v.play().catch(() => {
            v.muted = true
            v.play().catch(() => {})
          })
        })
        player.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) setLoadError(true)
        })
        player.loadSource(url)
        player.attachMedia(videoRef.current)
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = url
        videoRef.current.play().catch(() => {
          videoRef.current.muted = true
          videoRef.current.play().catch(() => {})
        })
      } else {
        setLoadError(true)
      }
    })
    return () => {
      cancelled = true
      if (player) player.destroy()
    }
  }, [url, started, hls])

  // Weichgezeichneter Hintergrund nur bei Hochformat-Videos in
  // Querformat-Containern (HLS wird ausgenommen – hls.js kann nur ein Element
  // ansteuern).
  const needsBg = useBlurBackdrop(videoRef, wrapRef, bgRef, started && !hls && !loadError)

  // Auto-Play beim Scrollen (Intersection Observer API):
  // Video startet stumm, sobald es in den sichtbaren Bereich kommt,
  // und pausiert, wenn es den Bildschirm verlässt. Live TV bleibt ausgenommen.
  useAutoPlayInView(wrapRef, {
    enabled: autoPlayOnScroll && !loadError,
    autoStart: !started,
    getVideo: () => videoRef.current,
    onAutoStart: () => {
      setStarted(true)
      setMuted(true)
    },
  })

  // React aktualisiert die `muted`-Eigenschaft bei Änderungen nicht zuverlässig.
  useEffect(() => {
    const v = videoRef.current
    if (v) v.muted = muted
  }, [muted])

  const playIcon = (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )

  // Gültiger YouTube-Link → Embed-iframe
  if (embed?.ok) {
    return (
      <iframe
        src={`${embed.url}?origin=${encodeURIComponent(YT_EMBED_ORIGIN)}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  // Gültiger TikTok-Link → offizielles TikTok-Embed-iframe
  if (tiktok?.ok) {
    return (
      <iframe
        src={tiktok.url}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  // Gültiger Facebook-Video-Link → offizielles Facebook-Embed-iframe
  if (facebook?.ok) {
    return (
      <iframe
        src={facebook.url}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  // Vimeo wird bewusst nicht mehr eingebettet (der Vimeo-Player zeigt sonst
  // eigene Fehlermeldungen wie „Fehler 153“) → eigene Meldung anzeigen.
  if (vimeo?.reason === 'unsupported') {
    return (
      <div className="video-error" role="alert">
        <span className="video-play" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 7v6" />
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <p className="video-hint">{t('detail.videoUnsupported')}</p>
      </div>
    )
  }

  // Link mit ungültiger ID (YouTube/TikTok/Facebook) → Fehlermeldung
  if (embed?.reason === 'invalid-id' || tiktok?.reason === 'invalid-id' || facebook?.reason === 'invalid-id' || vimeo?.reason === 'invalid-id') {
    return (
      <div className="video-error" role="alert">
        <span className="video-play" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 7v6" />
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <p className="video-hint">{t('detail.videoError')}</p>
      </div>
    )
  }

  // Kein Link hinterlegt → Hinweis
  if (!url) {
    return (
      <>
        <span className="video-play" aria-hidden="true">{playIcon}</span>
        <p className="video-hint">{t('detail.videoHint')}</p>
      </>
    )
  }

  // Eigene Videodatei / HLS-Stream → Poster + Play-Overlay, dann HTML5-Player.
  // Der Wrap bleibt immer gemountet, damit der Intersection Observer auch
  // vor dem ersten Start das Sichtbarwerden erkennen kann.
  return (
    <div ref={wrapRef} className="video-native-wrap">
      {!started ? (
        <button
          type="button"
          className="video-native-cover"
          onClick={() => setStarted(true)}
          aria-label={t('detail.play')}
        >
          {poster ? (
            <OptimizedImage className="video-native-poster" src={poster} alt="" widths={[640, 1280, 1920]} sizes="100vw" loading="eager" />
          ) : (
            <span className="video-native-placeholder" aria-hidden="true" />
          )}
          <span className="video-play" aria-hidden="true">{playIcon}</span>
          <span className="video-native-label">{t('detail.watch')}</span>
        </button>
      ) : (
        <>
          {needsBg && !hls ? (
            <video
              ref={bgRef}
              className="video-native-bg"
              muted
              loop={loop}
              playsInline
              preload="none"
              tabIndex={-1}
              aria-hidden="true"
              poster={poster || undefined}
              src={playSrc}
            />
          ) : null}
          {poster && !hls ? (
            <img
              className="video-native-poster-layer"
              src={poster}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}
          <video
            ref={videoRef}
            className="video-native"
            controls
            autoPlay
            playsInline
            loop={loop}
            muted={muted}
            poster={poster || undefined}
            src={hls ? undefined : playSrc}
            title={title}
            onError={hasFallback ? undefined : () => setLoadError(true)}
            onCanPlay={(e) => {
              const v = e.currentTarget
              if (!v) return
              v.play().catch(() => {
                v.muted = true
                setMuted(true)
                v.play().catch(() => {})
              })
            }}
          />
          {loadError && (
            <div className="video-load-error" role="alert">
              <p className="video-hint">{t('detail.videoLoadError')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
