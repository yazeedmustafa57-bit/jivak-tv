import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../lib/i18n.jsx'
import { listR2Files, deleteCloudImage, R2_PUBLIC_URL } from '../../lib/cloud-storage.js'
import { supabase, cloudEnabled } from '../../lib/supabase.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { getStoreVersion } from '../../lib/store.js'

function formatSize(bytes) {
  const mb = Number(bytes) / (1024 * 1024)
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB'
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  return Math.round(Number(bytes) / 1024) + ' KB'
}

function normUrl(url) {
  try {
    return String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '')
  } catch {
    return String(url || '')
  }
}

export default function AdminStorage() {
  const { t } = useI18n()
  const [state, setState] = useState({ loading: true, files: [], usageBytes: 0, maxBytes: 1, error: '' })
  const [usedUrls, setUsedUrls] = useState(() => new Set())
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('alle')

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    const data = await listR2Files()
    if (!data) {
      setState((s) => ({ ...s, loading: false, error: t('storage.loadError') }))
      return
    }
    setState({ loading: false, files: data.files, usageBytes: data.usageBytes, maxBytes: data.maxBytes, error: '' })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getStoreVersion()])

  // Welche Dateien werden noch von Artikeln verwendet?
  useEffect(() => {
    if (!cloudEnabled || !supabase) return undefined
    let active = true
    supabase
      .from('articles')
      .select('id, slug, title, image, media_url, gallery')
      .then(({ data, error }) => {
        if (!active) return
        if (error) throw error
        const set = new Set()
        for (const a of data || []) {
          if (a && a.image) set.add(normUrl(a.image))
          if (a && a.media_url) set.add(normUrl(a.media_url))
          for (const g of Array.isArray(a.gallery) ? a.gallery : []) {
            if (g) set.add(normUrl(g))
          }
        }
        setUsedUrls(set)
      })
      .catch(() => { /* Cloud offline */ })
    return () => { active = false }
  }, [])

  const folders = useMemo(() => {
    const seen = new Set()
    for (const f of state.files) if (f.folder) seen.add(f.folder)
    return ['alle', ...seen]
  }, [state.files])

  const shown = useMemo(() => {
    if (filter === 'alle') return state.files
    return state.files.filter((f) => f.folder === filter)
  }, [state.files, filter])

  const usedPercent = state.maxBytes ? Math.min(100, (state.usageBytes / state.maxBytes) * 100) : 0

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    const res = await deleteCloudImage({ folder: toDelete.folder, name: toDelete.name, provider: 'r2' })
    setDeleting(false)
    setToDelete(null)
    if (res.ok) {
      setToast(t('storage.deleted'))
      load()
    } else {
      setToast(t('storage.deleteError'))
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('storage.title')}</h1>
        <div className="sub">
          {t('storage.used', { used: formatSize(state.usageBytes), total: formatSize(state.maxBytes) })}
        </div>
        <div style={{ maxWidth: 420, marginTop: 10 }}>
          <div style={{ height: 10, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: usedPercent + '%', height: '100%', background: usedPercent > 85 ? 'var(--danger, #c0392b)' : 'var(--accent, #c0392b)', borderRadius: 6 }} />
          </div>
          <div className="sub" style={{ marginTop: 4 }}>{usedPercent.toFixed(1)} %</div>
        </div>
      </div>

      <div className="row-actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={load} disabled={state.loading}>
          <Icon name="refresh" size={15} /> {t('storage.refresh')}
        </button>
        <select className="input" style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          {folders.map((f) => (
            <option key={f} value={f}>{f === 'alle' ? t('storage.all') : f}</option>
          ))}
        </select>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.loading && <div className="sub">{t('storage.loading')}</div>}

      {!state.loading && shown.length === 0 && (
        <div className="sub">{t('storage.empty')}</div>
      )}

      {/* Desktop: Tabelle */}
      <div className="storage-table-wrap" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>{t('storage.file')}</th>
              <th>{t('storage.folder')}</th>
              <th>{t('storage.size')}</th>
              <th>{t('storage.status')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const url = f.key ? `${R2_PUBLIC_URL}/${f.key}` : ''
              const inUse = usedUrls.has(normUrl(url))
              return (
                <tr key={f.key}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      disabled={inUse || deleting}
                      title={inUse ? t('storage.inUseTitle') : ''}
                      onClick={() => setToDelete(f)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                  <td style={{ wordBreak: 'break-all', maxWidth: 200 }}>{f.name}</td>
                  <td>{f.folder || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatSize(f.size)}</td>
                  <td>
                    {inUse ? (
                      <span className="badge" style={{ color: 'var(--accent)' }}>{t('storage.inUse')}</span>
                    ) : (
                      <span className="badge">{t('storage.unused')}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: Karten */}
      <div className="storage-cards">
        {shown.map((f) => {
          const url = f.key ? `${R2_PUBLIC_URL}/${f.key}` : ''
          const inUse = usedUrls.has(normUrl(url))
          return (
            <div className="storage-card" key={f.key}>
              <div className="storage-card-top">
                <span className="storage-card-name">{f.name}</span>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={inUse || deleting}
                  title={inUse ? t('storage.inUseTitle') : ''}
                  onClick={() => setToDelete(f)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <div className="storage-card-meta">
                <span>{formatSize(f.size)}</span>
                <span className="dot">·</span>
                <span>{f.folder || '—'}</span>
                <span className="dot">·</span>
                {inUse ? (
                  <span className="badge" style={{ color: 'var(--accent)' }}>{t('storage.inUse')}</span>
                ) : (
                  <span className="badge">{t('storage.unused')}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        open={Boolean(toDelete)}
        title={t('storage.deleteConfirmTitle')}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel={deleting ? t('storage.deleting') : t('storage.deleteBtn')}
        danger
      >
        <p>{t('storage.deleteConfirm', { name: toDelete?.name || '' })}</p>
        <p className="sub">{t('storage.deleteHint')}</p>
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
