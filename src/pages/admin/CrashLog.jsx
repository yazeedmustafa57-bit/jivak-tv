import { useState } from 'react'
import { getErrorLog, getLifecycleLog, clearErrorLog, removeErrorEntry, formatCrashLog } from '../../lib/errorLog.js'
import { Icon } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'
import { useStoreVersion } from '../../lib/useStore.js'

function fmtTime(iso, t) {
  try {
    const d = new Date(iso || t || Date.now())
    return Number.isNaN(d.getTime()) ? String(t || '') : d.toLocaleString()
  } catch {
    return String(t || '')
  }
}

/**
 * Admin-Bereich „Crash-Protokoll“:
 * zeigt den letzten Fehler vollständig (Meldung, Stack, Datei/Zeile, URL,
 * Sprache, Browser, Zeitpunkt) sowie die Lifecycle-Historie des Browsers.
 * „Crash-Log kopieren“ erzeugt einen kompakten Text zum Weiterschicken.
 */
export default function CrashLog() {
  useStoreVersion()
  const { t } = useI18n()
  const [errors, setErrors] = useState(getErrorLog)
  const [life, setLife] = useState(getLifecycleLog)
  const [selected, setSelected] = useState(() => getErrorLog()[0] || null)
  const [copied, setCopied] = useState(false)

  const refresh = () => {
    setErrors(getErrorLog())
    setLife(getLifecycleLog())
    setSelected((prev) => {
      if (prev) return prev
      const first = getErrorLog()[0]
      return first || null
    })
  }

  const onClear = () => {
    if (window.confirm(t('crash.clearConfirm'))) {
      clearErrorLog()
      refresh()
    }
  }

  const onDeleteEntry = (e) => {
    if (!window.confirm(t('crash.deleteConfirm'))) return
    removeErrorEntry(e.t)
    refresh()
  }

  const onCopy = async () => {
    const text = formatCrashLog()
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
      } else {
        copyFallback(text)
      }
    } catch {
      copyFallback(text)
    }
    setTimeout(() => setCopied(false), 2500)
  }

  function copyFallback(text) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
    } catch {
      window.prompt('Crash-Log (manuell kopieren):', text)
    }
  }

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('crash.title')}</h1>
          <div className="sub">{t('crash.meta')} · {errors.length} {t('crash.errors')} · {life.length} {t('crash.lifecycle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" type="button" onClick={refresh}>↻</button>
          <button className="btn btn-ghost" type="button" onClick={onClear}>{t('crash.clear')}</button>
          <button className="btn btn-primary" type="button" onClick={onCopy}>
            {copied ? t('crash.copied') : t('crash.copy')}
          </button>
        </div>
      </div>

      {errors.length === 0 ? (
        <div className="panel">
          <p className="hint" style={{ margin: 0 }}>{t('crash.empty')}</p>
          <p className="hint" style={{ margin: '10px 0 0' }}>{t('crash.hintDevice')}</p>
          <p className="hint" style={{ margin: '8px 0 0' }}>{t('crash.hintFreeze')}</p>
        </div>
      ) : (
        <div className="stats-cols" style={{ alignItems: 'flex-start' }}>
          {/* Fehlerliste */}
          <div>
            <h3>{t('crash.errors')} ({errors.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 460 }}>
              {errors.slice(0, 20).map((e, i) => (
                <div key={e.t + '-' + i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setSelected(e)}
                    style={{
                      flex: 1, textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: 8,
                      border: selected === e ? '1px solid #C4472C' : '1px solid rgba(255,255,255,0.12)',
                      background: selected === e ? 'rgba(196,71,44,0.12)' : 'transparent',
                      color: 'inherit', fontSize: 13
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#C4472C' }}>{e.source}</div>
                    <div dir="auto" style={{ opacity: 0.85 }}>{String(e.msg).slice(0, 110)}</div>
                    <div style={{ opacity: 0.55, fontSize: 11 }}>{fmtTime(e.iso, e.t)}</div>
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    title={t('crash.deleteEntry')}
                    onClick={() => onDeleteEntry(e)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Detailansicht */}
          <div style={{ flex: 1, minWidth: 320 }}>
            {selected ? (
              <div className="panel" style={{ margin: 0 }}>
                <h3 style={{ marginTop: 0 }}>{t('crash.details')}</h3>
                <table className="table" style={{ marginBottom: 14 }}>
                  <tbody>
                    <tr><td style={{ width: 140 }}>{t('crash.time')}</td><td dir="ltr">{fmtTime(selected.iso, selected.t)}</td></tr>
                    <tr><td>{t('crash.msg')}</td><td dir="auto">{selected.msg}</td></tr>
                    <tr><td>{t('crash.file')}</td><td dir="ltr">{selected.file || t('crash.none')}{selected.line ? ' : ' + selected.line : ''}{selected.col ? ' : ' + selected.col : ''}</td></tr>
                    <tr><td>{t('crash.url')}</td><td dir="ltr" style={{ wordBreak: 'break-all' }}>{selected.url || t('crash.none')}</td></tr>
                    <tr><td>{t('crash.lang')}</td><td>{selected.lang || t('crash.none')}</td></tr>
                    <tr><td>{t('crash.browser')}</td><td>{selected.browser || t('crash.none')}</td></tr>
                    <tr><td>User-Agent</td><td dir="ltr" style={{ wordBreak: 'break-all', fontSize: 11, opacity: 0.8 }}>{selected.ua || t('crash.none')}</td></tr>
                  </tbody>
                </table>
                {selected.stack && (
                  <>
                    <h4 style={{ margin: '8px 0 6px' }}>Stack</h4>
                    <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.5, background: 'var(--surface-2)', padding: 12, borderRadius: 8, maxHeight: 320, overflow: 'auto' }}>{selected.stack}</pre>
                  </>
                )}
                {selected.componentStack && (
                  <>
                    <h4 style={{ margin: '8px 0 6px' }}>ComponentStack</h4>
                    <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.4, background: 'var(--surface-2)', padding: 12, borderRadius: 8, maxHeight: 240, overflow: 'auto' }}>{selected.componentStack}</pre>
                  </>
                )}
              </div>
            ) : (
              <div className="panel" style={{ margin: 0 }}><p className="hint" style={{ margin: 0 }}>{t('crash.empty')}</p></div>
            )}
          </div>
        </div>
      )}

      {/* Lifecycle-Historie */}
      <div className="panel" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>{t('crash.lifecycle')} ({life.length})</h2>
        {life.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('crash.empty')}</p>
        ) : (
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            {life.slice(0, 60).map((e, i) => (
              <div key={e.t + '-' + i} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
                <span dir="ltr" style={{ opacity: 0.6, minWidth: 150 }}>{fmtTime(e.iso, e.t)}</span>
                <span style={{ color: '#C4472C', minWidth: 170 }}>{e.source}</span>
                <span dir="auto" style={{ opacity: 0.75 }}>
                  {e.detail ? e.detail + ' · ' : ''}visible={e.visible} · hbAge={e.hbAge}s
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="hint" style={{ margin: '10px 0 0', fontSize: 12 }}>hbAge = Sekunden seit dem letzten Heartbeat (großer Wert = Haupt-Thread war eingefroren)</p>
      </div>
    </div>
  )
}
