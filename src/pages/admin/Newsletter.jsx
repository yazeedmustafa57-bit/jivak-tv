import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { LANGUAGES, useI18n } from '../../lib/i18n.jsx'

function langLabel(code) {
  const found = LANGUAGES.find((l) => l.code === code)
  return found ? found.label : code
}

export default function Newsletter() {
  const { t } = useI18n()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [mailConfigured, setMailConfigured] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState('')
  const [digestInfo, setDigestInfo] = useState(null)
  const [digestSending, setDigestSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (!supabase) {
        setError(t('nl.notConfigured'))
        setLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) {
        setError(t('nl.notAdmin'))
        setLoading(false)
        return
      }
      const res = await fetch('/api/newsletter?admin=true', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.ok) throw new Error(payload.code || 'http')
      setRows(payload.subscribers || [])
      setMailConfigured(payload.mailConfigured)
    } catch {
      setError(t('nl.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  async function loadDigest() {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) return
      // We load digest info via a special admin query
      const res = await fetch('/api/newsletter?admin=true', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json().catch(() => ({}))
      if (payload.digestInfo) setDigestInfo(payload.digestInfo)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadDigest() }, [])

  async function sendDigestNow() {
    setDigestSending(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('no-auth')
      const res = await fetch('/api/newsletter?digest=true', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.ok) throw new Error(payload.code || 'digest-failed')
      setDigestInfo({ lastSentAt: payload.lastSentAt, lastCount: payload.sent, newArticles: payload.newArticles, lastFailed: payload.failed, lastErrors: payload.errors || [] })
      setToast(t('nl.digestSent', { count: payload.sent }))
    } catch (err) {
      setToast(t('nl.digestError') + ': ' + (err.message || ''))
    } finally {
      setDigestSending(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch(`/api/newsletter?admin=true&email=${encodeURIComponent(toDelete)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.ok) throw new Error(payload.code || 'http')
      setToDelete(null)
      setRows((prev) => prev.filter((r) => r.email !== toDelete))
      setToast(t('nl.deleted'))
    } catch {
      setToDelete(null)
      setError(t('nl.error'))
    }
  }

  async function exportCsv() {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/newsletter?admin=true&format=csv', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('csv')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'newsletter-subscribers.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(t('nl.error'))
    }
  }

  const filtered = query.trim()
    ? rows.filter((r) => r.email.toLowerCase().includes(query.trim().toLowerCase()))
    : rows

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('nl.title')}</h1>
          <div className="sub">{t('nl.total', { n: rows.length })}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={load} disabled={loading}>
            <Icon name="refresh" size={16} /> {t('nl.refresh')}
          </button>
          <button className="btn btn-primary" onClick={exportCsv} disabled={rows.length === 0}>
            <Icon name="download" size={16} /> {t('nl.export')}
          </button>
        </div>
      </div>

      {mailConfigured === true && (
        <div className="form-success" role="status">{t('nl.mailOn')}</div>
      )}
      {mailConfigured === false && (
        <div className="form-error">
          <strong>{t('nl.mailOff')}</strong>
          <div style={{ marginTop: 4, fontWeight: 400 }}>{t('nl.mailOffHint')}</div>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="filter-row" style={{ marginTop: 0, marginBottom: 20 }}>
        <input
          className="input"
          type="search"
          placeholder={t('nl.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 340 }}
          aria-label={t('nl.search')}
        />
      </div>

      {loading ? (
        <div className="empty-state"><p>{t('nl.loading')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>{t('nl.empty')}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('nl.colEmail')}</th>
                <th>{t('nl.colLang')}</th>
                <th>{t('nl.colDate')}</th>
                <th style={{ textAlign: 'end' }}>{t('nl.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.email}>
                  <td className="title-cell">{r.email}</td>
                  <td><span className="badge">{langLabel(r.lang)}</span></td>
                  <td className="date-cell">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'end' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => setToDelete(r.email)}>
                      <Icon name="trash" size={15} /> {t('nl.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(toDelete)}
        title={t('nl.delete')}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel={t('nl.delete')}
        danger
      >
        <p>{t('nl.deleteConfirm', { email: toDelete })}</p>
      </Modal>

      {/* --- Tägliche Zusammenfassung --- */}
      <div style={{ marginTop: 32, padding: '22px 24px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-m)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('nl.digestTitle')}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>{t('nl.digestDesc')}</p>
          </div>
          <button className="btn btn-primary" onClick={sendDigestNow} disabled={digestSending}>
            <Icon name="mail" size={16} /> {digestSending ? t('nl.digestSending') : t('nl.digestSendNow')}
          </button>
        </div>
        {digestInfo && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, lineHeight: 1.6 }}>
            <div><strong>{t('nl.digestLastSent')}:</strong> {digestInfo.lastSentAt ? new Date(digestInfo.lastSentAt).toLocaleString() : '—'}</div>
            <div><strong>{t('nl.digestLastCount')}:</strong> {digestInfo.lastCount ?? '—'} {t('nl.digestEmails')}</div>
            <div><strong>{t('nl.digestNewArticles')}:</strong> {digestInfo.newArticles ?? '—'}</div>
            {digestInfo.lastFailed > 0 && (
              <div style={{ color: 'var(--danger)' }}><strong>{t('nl.digestFailed')}:</strong> {digestInfo.lastFailed}</div>
            )}
            {digestInfo.lastErrors && digestInfo.lastErrors.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--ink-soft)' }}>{t('nl.digestErrors')}</summary>
                <pre style={{ fontSize: 11, margin: '6px 0 0', maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(digestInfo.lastErrors, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
        {digestInfo && digestInfo.history && digestInfo.history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('nl.digestHistory')}</h3>
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>{t('nl.digestHistoryDate')}</th>
                    <th>{t('nl.digestHistoryArticles')}</th>
                    <th>{t('nl.digestHistorySent')}</th>
                    <th>{t('nl.digestHistoryFailed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {digestInfo.history.map((h, i) => (
                    <tr key={i}>
                      <td>{new Date(h.sentAt).toLocaleString()}</td>
                      <td>{h.newArticles}</td>
                      <td style={{ color: 'var(--success)' }}>{h.sent}</td>
                      <td style={{ color: h.failed > 0 ? 'var(--danger)' : 'var(--ink-soft)' }}>{h.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
