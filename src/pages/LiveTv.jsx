import { useEffect, useState, useRef } from 'react'
import Hls from 'hls.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import { useLiveTvL10n } from '../lib/useLiveTvL10n.jsx'
import { getLiveTv } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

function currentProgram(programs, now) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const list = [...programs].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
  for (const p of list) {
    const [h, m] = String(p.time || '').split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) continue
    const start = h * 60 + m
    if (minutes >= start && minutes < start + 90) return p
  }
  return null
}

export default function LiveTv() {
  useStoreVersion()
  const { t } = useI18n()
  const [now, setNow] = useState(() => new Date())
  const live = getLiveTv()
  const tr = useLiveTvL10n(live)
  const liveTitle = tr('live:title', live.title)
  const channelName = liveTitle || 'ROJ TV'

  const [isLive, setIsLive] = useState(false)
  const [viewerMsg, setViewerMsg] = useState('Warte auf Livestream…')
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const pollRef = useRef(null)

  const hlsUrl = live.youtubeHlsUrl || ''
  const enabled = Boolean(live.enabled && hlsUrl)

  // ─── HLS-Player starten ───
  const startPlayer = () => {
    if (!hlsUrl || !videoRef.current) return
    const video = videoRef.current

    // Alten Player zerstören
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch {}
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveDurationInfinity: true,
        liveBackBufferLength: 0,
        liveMaxLatencyDurationCount: 8,
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 15,
        startFragPrefetch: true,
        backBufferLength: 0,
        maxBufferSize: 10 * 1024 * 1024,
      })
      hlsRef.current = hls

      hls.loadSource(hlsUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLive(true)
        setViewerMsg('')
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setIsLive(false)
          setViewerMsg('Stream vorübergehend nicht verfügbar – wird automatisch wieder verbunden…')
          hls.startLoad()
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
        } else {
          setIsLive(false)
          setViewerMsg('Player-Fehler – Verbindung wird neu aufgebaut…')
          try { hls.destroy() } catch {}
          hlsRef.current = null
          setTimeout(startPlayer, 3000)
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari nativ
      video.src = hlsUrl
      video.addEventListener('loadedmetadata', () => { setIsLive(true); video.play().catch(() => {}) })
      video.addEventListener('error', () => setIsLive(false))
    }
  }

  // ─── Initiales Setup ───
  useEffect(() => {
    if (enabled) {
      setViewerMsg('Verbinde mit Livestream…')
      startPlayer()
      // Polling: HLS-Manifest alle 5s prüfen
      pollRef.current = setInterval(() => {
        if (!hlsRef.current && enabled) startPlayer()
      }, 5000)
    }
    return () => {
      if (hlsRef.current) { try { hlsRef.current.destroy() } catch {} hlsRef.current = null }
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [enabled, hlsUrl])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const programs = [...(live.programs || [])].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
  const current = currentProgram(programs, now)
  const showLive = enabled || isLive
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
      <Seo title={`${t('liveTv.title') || 'ROJ TV'} – ${t('liveTv.live') || 'Live'}`} />

      {/* Live Video Player */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', background: '#000', boxShadow: '0 0 40px rgba(0,0,0,0.8)', marginBottom: 24 }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', aspectRatio: '16/9', objectFit: 'contain', display: 'block', background: '#000' }}
          />

          {/* Logo Overlay */}
          <div className="tv-logo-overlay-wrap">
            <div className="tv-logo-overlay">
              <div className="tv-logo-bars">
                <div className="tv-bar tv-bar-1" />
                <div className="tv-bar tv-bar-2" />
                <div className="tv-bar tv-bar-3" />
                <div className="tv-bar tv-bar-4" />
              </div>
              <div className="tv-logo-text">
                <span className="tv-lt tv-lt-blue">R</span>
                <span className="tv-lt tv-lt-blue">O</span>
                <span className="tv-lt tv-lt-blue">J</span>
                <span className="tv-lt" style={{ width: 6 }} />
                <span className="tv-lt tv-lt-accent">T</span>
                <span className="tv-lt tv-lt-accent">V</span>
              </div>
            </div>
          </div>

          {/* Live Badge */}
          {showLive && (
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(228,67,47,0.9)', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 14, zIndex: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4444', animation: 'livePulse 1.5s ease-in-out infinite' }} />
              LIVE
            </div>
          )}

          {/* Status Message */}
          {!isLive && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📺</div>
              <div style={{ color: '#aaa', fontSize: 16, fontWeight: 600 }}>{viewerMsg || 'Kein Livestream verfügbar'}</div>
              <div style={{ color: '#666', fontSize: 13, marginTop: 8 }}>Der Stream wird automatisch gestartet, wenn der Moderator on-air ist.</div>
            </div>
          )}

          {/* Channel Info Bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.9))', padding: '40px 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{channelName}</div>
                {live.description && <p style={{ color: '#888', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{live.description}</p>}
              </div>
              <div style={{ color: '#888', fontSize: 13, fontFamily: 'monospace' }}>{timeStr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Program Schedule */}
      {programs.length > 0 && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 24px' }}>
          <div style={{ background: '#111', borderRadius: 8, padding: 16, border: '1px solid #222' }}>
            <h3 style={{ color: '#D4622F', fontSize: 14, fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('live:schedule') || 'Sendungsplan'}
            </h3>
            {programs.map((p, i) => {
              const running = current === p
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < programs.length - 1 ? '1px solid #222' : 'none' }}>
                  <span style={{ color: running ? '#D4622F' : '#666', fontWeight: 600, fontSize: 14, minWidth: 50 }}>{p.time}</span>
                  <span style={{ color: running ? '#fff' : '#aaa', fontSize: 14 }}>{tr('live:prog:' + p.time, p.title) || '—'}</span>
                  {running && <span style={{ marginLeft: 'auto', background: '#D4622F', color: '#fff', padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 700 }}>LIVE</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .tv-logo-overlay-wrap { position: absolute; top: 16px; left: 16px; z-index: 20; pointer-events: none; }
        .tv-logo-overlay { display: flex; align-items: center; gap: 8px; opacity: 0.85; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.7)); }
        .tv-logo-bars { display: flex; align-items: flex-end; gap: 2px; height: 22px; direction: ltr; }
        .tv-bar { width: 5px; border-radius: 2px 2px 1px 1px; transform-origin: bottom; animation: tv-growBar 12s cubic-bezier(.4,0,.2,1) infinite; }
        .tv-bar-1 { background: #E8B84B; height: 10px; animation-delay: 0s; }
        .tv-bar-2 { background: #E08A3C; height: 15px; animation-delay: 0.15s; }
        .tv-bar-3 { background: #D4622F; height: 20px; animation-delay: 0.3s; }
        .tv-bar-4 { background: #B8432E; height: 13px; animation-delay: 0.45s; }
        @keyframes tv-growBar { 0% { transform: scaleY(1); } 58% { transform: scaleY(1); } 68% { transform: scaleY(0.15); } 82% { transform: scaleY(0.15); } 100% { transform: scaleY(1); } }
        .tv-logo-text { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; display: flex; direction: ltr; font-family: 'Inter', 'Almarai', system-ui, sans-serif; position: relative; overflow: hidden; }
        .tv-lt { display: inline-block; animation: tv-cascade 12s ease-in-out infinite; }
        .tv-lt:nth-child(1) { animation-delay: 0s; }
        .tv-lt:nth-child(2) { animation-delay: 0.15s; }
        .tv-lt:nth-child(3) { animation-delay: 0.3s; }
        .tv-lt:nth-child(4) { animation-delay: 0.45s; }
        .tv-lt:nth-child(5) { animation-delay: 0.6s; }
        .tv-lt:nth-child(6) { animation-delay: 0.75s; }
        .tv-lt-blue { color: #fff; }
        .tv-lt-accent { color: #D4622F; }
        @keyframes tv-cascade { 0% { opacity: 1; filter: blur(0px); transform: translateY(0) scale(1); } 58% { opacity: 1; filter: blur(0px); transform: translateY(0) scale(1); } 64% { opacity: 0; filter: blur(5px); transform: translateY(4px) scale(0.92); } 78% { opacity: 0; filter: blur(5px); transform: translateY(4px) scale(0.92); } 84% { opacity: 1; filter: blur(0px); transform: translateY(0) scale(1); } 100% { opacity: 1; filter: blur(0px); transform: translateY(0) scale(1); } }
        .tv-logo-text::after { content: ''; position: absolute; top: 0; left: -100%; width: 55%; height: 100%; background: linear-gradient(100deg, transparent, rgba(255,255,255,0.85), transparent); animation: tv-shimmer 12s ease infinite; pointer-events: none; }
        @keyframes tv-shimmer { 0% { left: -100%; } 86% { left: -100%; } 96% { left: 130%; } 100% { left: 130%; } }
        @media (prefers-reduced-motion: reduce) { .tv-bar, .tv-lt, .tv-logo-text::after { animation: none !important; opacity: 1 !important; filter: none !important; transform: none !important; } }
        @media (max-width: 640px) { .tv-logo-overlay-wrap { top: 10px; left: 10px; } .tv-logo-bars { height: 16px; gap: 1.5px; } .tv-bar { width: 4px; } .tv-bar-1 { height: 8px; } .tv-bar-2 { height: 11px; } .tv-bar-3 { height: 15px; } .tv-bar-4 { height: 10px; } .tv-logo-text { font-size: 15px; } }
        @media (min-width: 1024px) { .tv-logo-overlay-wrap { top: 24px; left: 24px; } .tv-logo-bars { height: 30px; gap: 3px; } .tv-bar { width: 7px; } .tv-bar-1 { height: 14px; } .tv-bar-2 { height: 20px; } .tv-bar-3 { height: 28px; } .tv-bar-4 { height: 18px; } .tv-logo-text { font-size: 28px; } }
      `}</style>
    </div>
  )
}
