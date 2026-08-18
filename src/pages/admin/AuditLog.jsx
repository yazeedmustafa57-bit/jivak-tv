import { useEffect, useState } from 'react'
import { fetchAudit } from '../../lib/staff.js'
import { useI18n } from '../../lib/i18n.jsx'

const ACTION_T = {
  'article.created': 'audit.article.created',
  'article.updated': 'audit.article.updated',
  'article.published': 'audit.article.published',
  'article.draft': 'audit.article.draft',
  'article.review': 'audit.article.review',
  'article.archived': 'audit.article.archived',
  'article.deleted': 'audit.article.deleted',
  'staff.created': 'audit.staff.created',
  'staff.updated': 'audit.staff.updated',
  'staff.deleted': 'audit.staff.deleted',
  'staff.password': 'audit.staff.password'
}

const RANGES = ['all', '30', '90', '365']

export default function AuditLog() {
  const { t } = useI18n()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('alle')
  const [range, setRange] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await fetchAudit()
    setLoading(false)
    if (!r.ok) {
      setError(r.error || 'load-failed')
      return
    }
    setEntries(r.entries || [])
  }

  const actionLabel = (action) => {
    const key = ACTION_T[action]
    return key ? t(key) : action
  }

  const actions = ['alle', ...Object.keys(ACTION_T)]

  // Filter sind rein für die ANZEIGE – die Einträge bleiben unverändert erhalten.
  const query = q.trim().toLowerCase()
  const since = range === 'all' ? 0 : Date.now() - Number(range) * 24 * 60 * 60 * 1000
  const visible = entries.filter((e) => {
    if (actionFilter !== 'alle' && e.action !== actionFilter) return false
    const ts = Number(e.t || (e.iso ? new Date(e.iso).getTime() : 0))
    if (range !== 'all' && (!ts || ts < since)) return false
    if (query) {
      const hay = [e.actor && e.actor.name, e.actor && e.actor.email, e.action, e.targetTitle, e.targetId, e.detail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(query)) return false
    }
    return true
  })

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('audit.title')}</h1>
          <div className="sub">{t('audit.sub')}</div>
        </div>
        <button className="btn btn-ghost" type="button" onClick={load}>
          {t('audit.refresh')}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* Suchfeld */}
      <div style={{ margin: '0 0 14px' }}>
        <input
          className="input"
          type="search"
          placeholder={t('audit.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 380 }}
        />
      </div>

      {/* Zeitraum-Filter (nur Anzeige, keine Löschung) */}
      <div className="filter-row" style={{ marginTop: 0, marginBottom: 14, flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button
            key={r}
            className={`filter-btn ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === 'all' ? t('audit.all') : r === '30' ? t('audit.range30') : r === '90' ? t('audit.range90') : t('audit.range365')}
          </button>
        ))}
      </div>

      {/* Aktionen-Filter */}
      <div className="filter-row" style={{ marginTop: 0, marginBottom: 20, flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <button
            key={a}
            className={`filter-btn ${actionFilter === a ? 'active' : ''}`}
            onClick={() => setActionFilter(a)}
          >
            {a === 'alle' ? t('audit.all') : actionLabel(a)}
          </button>
        ))}
      </div>

      <p className="hint" style={{ margin: '0 0 12px' }}>
        {t('audit.resultCount', { shown: visible.length, total: entries.length })}
      </p>

      {loading ? (
        <div className="empty-state"><p>{t('audit.loading')}</p></div>
      ) : visible.length === 0 ? (
        <div className="empty-state"><p>{t('audit.empty')}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('audit.colWhen')}</th>
                <th>{t('audit.colWho')}</th>
                <th>{t('audit.colAction')}</th>
                <th>{t('audit.colTarget')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 200).map((e) => (
                <tr key={e.t + '-' + (e.actor?.id || '') + '-' + e.action}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.t || e.iso).toLocaleString()}</td>
                  <td>
                    <strong>{e.actor?.name || e.actor?.email || '—'}</strong>
                    <small style={{ display: 'block' }} dir="ltr">{e.actor?.email || ''}</small>
                  </td>
                  <td><span className="badge badge-info">{actionLabel(e.action)}</span></td>
                  <td>
                    {e.targetTitle || e.targetId || '—'}
                    {e.detail && <small style={{ display: 'block', color: 'var(--ink-soft)' }}>{e.detail}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
