import { useEffect, useState, useCallback } from 'react'
import { useI18n } from '../../lib/i18n.jsx'
import { getLiveTv, saveSettings } from '../../lib/store.js'

const RTMP_URL = 'rtmp://a.rtmp.youtube.com/live2'

/* ═══════════════════════════════════════════════════════════════════
   Admin Live Studio – YouTube Live Streaming
   ═══════════════════════════════════════════════════════════════════ */
export default function AdminMobileLive() {
  const { t } = useI18n()
  const live = getLiveTv()
  const [streamKey, setStreamKey] = useState(live.youtubeStreamKey || '')
  const [hlsUrl, setHlsUrl] = useState(live.youtubeHlsUrl || '')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState('')

  const onSave = useCallback(() => {
    saveSettings({
      liveTv: {
        ...live,
        youtubeStreamKey: streamKey.trim(),
        youtubeHlsUrl: hlsUrl.trim(),
        enabled: true
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [live, streamKey, hlsUrl])

  const copyToClipboard = useCallback((text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(''), 2000)
    })
  }, [])

  const isLive = Boolean(hlsUrl.trim())

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
          {t('admin.liveHandy') || '📱 Live Studio'}
        </div>
        {isLive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#E4432F', color: '#fff', padding: '4px 12px', borderRadius: 4, fontWeight: 700, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4444', animation: 'livePulse 1.5s ease-in-out infinite' }} />
            LIVE
          </div>
        )}
      </div>

      {/* YouTube RTMP Info */}
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h3 style={{ color: '#E4432F', fontSize: 14, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📺</span> YouTube Live Streaming
        </h3>

        {/* RTMP URL */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
            RTMP URL
          </label>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0a0a0a', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}
            onClick={() => copyToClipboard(RTMP_URL, 'rtmp')}
          >
            <span style={{ color: '#E8B84B', fontFamily: 'monospace', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {RTMP_URL}
            </span>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{copied === 'rtmp' ? '✓' : '📋'}</span>
          </div>
        </div>

        {/* Stream Key */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
            Stream Key (aus YouTube Studio)
          </label>
          <input
            type="password"
            value={streamKey}
            onChange={(e) => setStreamKey(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
            style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', color: '#fff', fontFamily: 'monospace', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* HLS URL */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
            YouTube HLS URL (für Zuschauer)
          </label>
          <input
            type="text"
            value={hlsUrl}
            onChange={(e) => setHlsUrl(e.target.value)}
            placeholder="https://manifest.googlevideo.com/api/manifest/hls_playlist/..."
            style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', color: '#fff', fontFamily: 'monospace', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          <p style={{ color: '#666', fontSize: 11, margin: '6px 0 0' }}>
            Findest du in YouTube Studio → Live Stream → Stream URL
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={onSave}
          style={{
            width: '100%', padding: '12px 20px', border: 'none', borderRadius: 8,
            background: saved ? 'linear-gradient(135deg, #4CAF50, #388E3C)' : 'linear-gradient(135deg, #E4432F, #B8432E)',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          {saved ? '✓ Gespeichert' : '💾 Speichern'}
        </button>
      </div>

      {/* Anleitung */}
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h3 style={{ color: '#E8B84B', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
          📋 Anleitung
        </h3>
        <ol style={{ color: '#aaa', fontSize: 13, lineHeight: 2, margin: 0, paddingLeft: 20 }}>
          <li>Öffne <strong style={{ color: '#fff' }}>YouTube Studio</strong> → <strong style={{ color: '#fff' }}>Live</strong></li>
          <li>Kopiere den <strong style={{ color: '#E8B84B' }}>Stream Key</strong> von YouTube</li>
          <li>Füge den Stream Key oben ein und drücke <strong style={{ color: '#fff' }}>Speichern</strong></li>
          <li>Öffne <strong style={{ color: '#fff' }}>Larix Broadcaster</strong> auf deinem Handy</li>
          <li>Gehe zu <strong style={{ color: '#fff' }}>Settings → Connections → RTMP</strong></li>
          <li>Gib die <strong style={{ color: '#E8B84B' }}>RTMP URL</strong> ein (kopiere mit Klick oben)</li>
          <li>Gib deinen <strong style={{ color: '#E8B84B' }}>Stream Key</strong> ein</li>
          <li>Drücke <strong style={{ color: '#E4432F' }}>Start Streaming</strong></li>
          <li>Gehe zurück zu YouTube Studio → kopiere die <strong style={{ color: '#E8B84B' }}>HLS URL</strong></li>
          <li>Füge die HLS URL oben ein und drücke <strong style={{ color: '#fff' }}>Speichern</strong></li>
        </ol>
      </div>

      {/* Status */}
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: 16 }}>
        <h3 style={{ color: '#888', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
          🔴 Status
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isLive ? '#4CAF50' : '#555' }} />
          <span style={{ color: isLive ? '#4CAF50' : '#666', fontSize: 13, fontWeight: 600 }}>
            {isLive ? 'Stream aktiv – Zuschauer können zuschauen' : 'Kein aktiver Stream'}
          </span>
        </div>
        {streamKey && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8B84B' }} />
            <span style={{ color: '#aaa', fontSize: 13 }}>Stream Key konfiguriert</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
