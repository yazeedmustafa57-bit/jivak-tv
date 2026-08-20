import { useEffect, useRef, useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n.jsx'
import { supabase } from '../../lib/supabase.js'

const ROTATIONS = [0, 5, 10, 15]
const CHANNEL_NAME = 'roj-live-webrtc'
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

/* ─── Audio Level Meter ─── */
function AudioMeter({ stream }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  useEffect(() => {
    if (!stream) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const audioCtx = new AudioContext()
    const src = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const draw = () => {
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
      const w = canvasRef.current.width, h = canvasRef.current.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h)
      const segs = 50, gap = 2, segW = (w - (segs - 1) * gap) / segs
      for (let i = 0; i < segs; i++) {
        const ratio = i / segs
        ctx.fillStyle = ratio < avg ? (ratio > 0.85 ? '#E4432F' : ratio > 0.6 ? '#E8B84B' : '#4CAF50') : '#1a1a1a'
        ctx.beginPath(); ctx.roundRect(i * (segW + gap), 2, segW, h - 4, 1); ctx.fill()
      }
      const db = avg > 0 ? Math.round(20 * Math.log10(avg)) : -60
      ctx.fillStyle = '#666'; ctx.font = '9px monospace'
      ctx.fillText(`${db} dB`, w - 38, h - 5)
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animRef.current); audioCtx.close() }
  }, [stream])
  return <canvas ref={canvasRef} width={500} height={32} style={{ width: '100%', height: 32, borderRadius: 6 }} />
}

/* ─── Status-Label ─── */
function StatusDot({ state }) {
  const colors = { connecting: '#E8B84B', publishing: '#4CAF50', error: '#E4432F', idle: '#555', live: '#4CAF50' }
  const labels = { connecting: 'Verbinde…', publishing: 'LIVE – Sendet', error: 'Fehler', idle: 'Bereit', live: 'LIVE – Sendet' }
  return (
    <div className="s-status">
      <span className="s-status-dot" style={{ background: colors[state] || '#555' }} />
      {labels[state] || state}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Admin Studio – WebRTC Publisher via Supabase Realtime
   ═══════════════════════════════════════════════════════════════════ */
export default function AdminMobileLive() {
  const { t } = useI18n()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const elapsedRef = useRef(null)
  const channelRef = useRef(null)
  const peersRef = useRef(new Map()) // viewerId → RTCPeerConnection
  const viewerCountRef = useRef(0)

  const [cameraReady, setCameraReady] = useState(false)
  const [connState, setConnState] = useState('idle')
  const [micOn, setMicOn] = useState(true)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [stream, setStream] = useState(null)
  const [viewerCount, setViewerCount] = useState(0)

  /* ─── Kamera starten ─── */
  const startCamera = useCallback(async () => {
    try {
      setError('')
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      streamRef.current = s
      setStream(s)
      setCameraReady(true)
      if (videoRef.current) videoRef.current.srcObject = s
      return s
    } catch (e) {
      setError('Kamera: ' + e.message)
      return null
    }
  }, [])

  /* ─── Supabase Channel veröffentlichen ─── */
  const startLive = useCallback(async () => {
    try {
      setError('')
      setConnState('connecting')

      const s = stream || await startCamera()
      if (!s) { setConnState('error'); return }

      // Supabase Channel für WebRTC-Signaling
      const channel = supabase.channel(CHANNEL_NAME, {
        config: { broadcast: { self: false, ack: true } }
      })
      channelRef.current = channel

      // Auf Join-Anfragen von Viewern hören
      channel.on('broadcast', { event: 'viewer-join' }, async ({ payload }) => {
        const viewerId = payload.viewerId
        if (!viewerId) return
        console.log('[Admin] Viewer joined:', viewerId)

        // Neuen PeerConnection für diesen Viewer erstellen
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

        // Audio+Video Tracks vom lokalen Stream hinzufügen
        s.getTracks().forEach(track => pc.addTrack(track, s))

        // ICE Candidates an Viewer senden
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            channel.send({
              type: 'broadcast',
              event: 'admin-ice',
              payload: { viewerId, candidate: e.candidate.toJSON() }
            })
          }
        }

        pc.onconnectionstatechange = () => {
          console.log(`[Admin] Peer ${viewerId} state:`, pc.connectionState)
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            peersRef.current.delete(viewerId)
            setViewerCount(peersRef.current.size)
          }
        }

        peersRef.current.set(viewerId, pc)
        setViewerCount(peersRef.current.size)

        // Offer erstellen
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        // Offer an Viewer senden
        channel.send({
          type: 'broadcast',
          event: 'admin-offer',
          payload: { viewerId, sdp: pc.localDescription.toJSON() }
        })
      })

      // Answer vom Viewer empfangen
      channel.on('broadcast', { event: 'viewer-answer' }, async ({ payload }) => {
        const { viewerId, sdp } = payload
        const pc = peersRef.current.get(viewerId)
        if (!pc) return
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        } catch (e) {
          console.error('[Admin] Failed to set answer:', e)
        }
      })

      // ICE Candidates vom Viewer empfangen
      channel.on('broadcast', { event: 'viewer-ice' }, async ({ payload }) => {
        const { viewerId, candidate } = payload
        const pc = peersRef.current.get(viewerId)
        if (!pc || !candidate) return
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.error('[Admin] Failed to add ICE:', e)
        }
      })

      // Viewer hat sich disconnected
      channel.on('broadcast', { event: 'viewer-leave' }, ({ payload }) => {
        const { viewerId } = payload
        const pc = peersRef.current.get(viewerId)
        if (pc) {
          pc.close()
          peersRef.current.delete(viewerId)
          setViewerCount(peersRef.current.size)
        }
      })

      // Channel subscriben
      const status = await channel.subscribe((status) => {
        console.log('[Admin] Channel status:', status)
        if (status === 'SUBSCRIBED') {
          setConnState('live')
          elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
        } else if (status === 'CHANNEL_ERROR') {
          setConnState('error')
          setError('Supabase Channel Fehler')
        }
      })

      if (status !== 'SUBSCRIBED') {
        throw new Error('Channel konnte nicht verbunden werden: ' + status)
      }
    } catch (e) {
      setConnState('error')
      setError('Live: ' + e.message)
    }
  }, [stream, startCamera])

  /* ─── Stoppen ─── */
  const stopLive = useCallback(async () => {
    // Alle PeerConnections schließen
    peersRef.current.forEach((pc, id) => {
      try { pc.close() } catch {}
    })
    peersRef.current.clear()
    setViewerCount(0)

    // Channel schließen
    if (channelRef.current) {
      try { await supabase.removeChannel(channelRef.current) } catch {}
      channelRef.current = null
    }

    // Stream stoppen
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStream(null)
    setCameraReady(false)
    setConnState('idle')
    setMicOn(true)
    setElapsed(0)
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null }
  }, [])

  /* ─── Mikrofon ─── */
  const toggleMic = useCallback(() => {
    const track = stream?.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled) }
  }, [stream])

  /* ─── Kamera wechseln ─── */
  const switchCamera = useCallback(async () => {
    const wasLive = connState === 'live'
    if (wasLive) await stopLive()
    await startCamera()
    if (wasLive) await startLive()
  }, [connState, stopLive, startCamera, startLive])

  /* ─── Rotation ─── */
  const cycleRotation = useCallback(() => {
    setRotation(r => ROTATIONS[(ROTATIONS.indexOf(r) + 1) % ROTATIONS.length])
  }, [])

  /* Cleanup */
  useEffect(() => () => { stopLive() }, [])

  const isLive = connState === 'live'
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="sr">
      {/* Header */}
      <div className="sr-hdr">
        <div className="sr-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
          {t('admin.liveHandy') || '📱 Live Studio'}
        </div>
        {isLive && <div className="sr-badge"><span className="sr-dot" />LIVE</div>}
      </div>

      {error && <div className="sr-err">{error}</div>}

      {/* Status */}
      <StatusDot state={connState} />

      {/* Video-Vorschau */}
      <div className="sr-vw">
        <div className="sr-vi" style={{ transform: `rotate(${rotation}deg)` }}>
          <video ref={videoRef} autoPlay playsInline muted className="sr-vid" style={{ background: '#000' }} />
          {isLive && (
            <div className="sr-ov">
              <div className="sr-ov-top">
                <div className="sr-ov-live"><span className="sr-dot" /> LIVE</div>
                <div className="sr-ov-time">{fmt(elapsed)}</div>
              </div>
            </div>
          )}
          {!cameraReady && (
            <div className="sr-ph" onClick={startCamera}>
              <div className="sr-ph-i">📷</div>
              <div style={{ color: '#888', fontSize: 14 }}>Kamera starten</div>
            </div>
          )}
        </div>
      </div>

      {/* Audio Meter */}
      {stream && (
        <div className="sr-aud">
          <div className="sr-aud-h">🎤 Audio-Level</div>
          <AudioMeter stream={stream} />
        </div>
      )}

      {/* Zuschauer */}
      {isLive && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#111', borderRadius: 8, border: '1px solid #222', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <span style={{ color: '#aaa', fontSize: 13 }}>{viewerCount} Zuschauer</span>
        </div>
      )}

      {/* Buttons */}
      <div className="sr-ctrl">
        <div className="sr-btn-g">
          {!isLive ? (
            <button className="sr-btn sr-btn-go" onClick={startLive} disabled={!cameraReady && !stream}>
              🔴 LIVE STARTEN
              {!isLive && <div className="sr-pulse" />}
            </button>
          ) : (
            <button className="sr-btn sr-btn-stop" onClick={stopLive}>
              ⏹ LIVE BEENDEN
            </button>
          )}
          <div className="sr-btn-row">
            <button className={`sr-btn sr-btn-s ${!micOn ? 'muted' : ''}`} onClick={toggleMic} disabled={!cameraReady}>
              {micOn ? '🎤' : '🔇'} Mikrofon
            </button>
            <button className="sr-btn sr-btn-s" onClick={switchCamera} disabled={!cameraReady}>
              🔄 Kamera
            </button>
            <button className="sr-btn sr-btn-s" onClick={cycleRotation}>
              🔄 Drehen ({rotation}°)
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lp { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes sp { 0%, 100% { box-shadow: 0 0 0 0 rgba(228,67,47,0.4); } 50% { box-shadow: 0 0 0 12px rgba(228,67,47,0); } }
        .sr { max-width: 600px; margin: 0 auto; padding: 16px; }
        .sr-hdr { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #222; margin-bottom: 12px; }
        .sr-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; }
        .sr-badge { display: flex; align-items: center; gap: 6px; background: #E4432F; color: #fff; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; }
        .sr-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff4444; display: inline-block; animation: lp 1.5s ease-in-out infinite; }
        .sr-err { background: #3a1111; border: 1px solid #E4432F; color: #ff6b6b; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
        .sr-status { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 12px; color: #aaa; }
        .sr-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .sr-vw { position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: #000; box-shadow: 0 0 30px rgba(0,0,0,0.8); }
        .sr-vi { position: relative; width: 100%; aspect-ratio: 16/9; transition: transform 0.3s; }
        .sr-vid { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
        .sr-ov { position: absolute; inset: 0; pointer-events: none; }
        .sr-ov-top { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; align-items: center; justify-content: space-between; }
        .sr-ov-live { display: flex; align-items: center; gap: 5px; color: #ff4444; font-weight: 700; font-size: 12px; }
        .sr-ov-time { background: rgba(0,0,0,0.6); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        .sr-ph { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #111; cursor: pointer; }
        .sr-ph-i { font-size: 48px; margin-bottom: 8px; }
        .sr-aud { margin-top: 8px; }
        .sr-aud-h { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .sr-ctrl { margin-top: 16px; }
        .sr-btn-g { display: flex; flex-direction: column; gap: 10px; }
        .sr-btn-row { display: flex; gap: 8px; }
        .sr-btn { display: flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .sr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sr-btn-go { padding: 16px 24px; font-size: 16px; width: 100%; background: linear-gradient(135deg, #E4432F, #B8432E); color: #fff; position: relative; overflow: hidden; }
        .sr-btn-go:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 0 20px rgba(228,67,47,0.4); }
        .sr-btn-stop { padding: 16px 24px; font-size: 16px; width: 100%; background: linear-gradient(135deg, #333, #222); color: #fff; border: 2px solid #555; }
        .sr-btn-stop:hover { border-color: #E4432F; }
        .sr-btn-s { padding: 10px 16px; font-size: 13px; flex: 1; background: #1a1a1a; color: #ccc; border: 1px solid #333; }
        .sr-btn-s:hover { background: #222; border-color: #555; }
        .sr-btn-s.muted { background: #3a1111; border-color: #E4432F; color: #ff6b6b; }
        .sr-pulse { position: absolute; inset: 0; border-radius: 10px; animation: sp 2s ease-in-out infinite; pointer-events: none; }
      `}</style>
    </div>
  )
}
