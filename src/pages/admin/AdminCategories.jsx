import { useState } from 'react'
import { addCategory, deleteCategory, getCategories, countArticlesByCategory, renameCategory, restoreMainCategories } from '../../lib/store.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'
import { useStoreVersion } from '../../lib/useStore.js'

export default function AdminCategories() {
  useStoreVersion()
  const { t, tCategory } = useI18n()
  const [categories, setCategories] = useState(getCategories())
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [editing, setEditing] = useState(null)

  function refresh() {
    setCategories(getCategories())
  }

  function onCreate(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addCategory(trimmed)
    setName('')
    refresh()
    setToast(t('catadmin.toastCreate'))
  }

  function onRestore() {
    const res = restoreMainCategories()
    refresh()
    setToast(res.added > 0 ? t('catadmin.toastRestore', { count: res.added }) : t('catadmin.toastRestoreNone'))
  }

  function onRename() {
    if (editing && editing.name.trim()) {
      renameCategory(editing.id, editing.name)
      refresh()
      setToast(t('catadmin.toastRename'))
    }
    setEditing(null)
  }

  function confirmDelete() {
    const result = deleteCategory(toDelete)
    setToDelete(null)
    if (result.ok) {
      refresh()
      setToast(t('catadmin.toastDelete'))
    } else {
      setError(t(result.errorKey || 'catadmin.inUse'))
      setTimeout(() => setError(''), 4000)
    }
  }

  const displayName = (c) => (editing && editing.id === c.id ? editing.name : tCategory(c))

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('catadmin.title')}</h1>
          <div className="sub">{t('catadmin.sub')}</div>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>{t('catadmin.newTitle')}</h2>
        <form onSubmit={onCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 260px' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('catadmin.placeholder')}
            required
          />
          <button className="btn btn-primary" type="submit">
            <Icon name="plus" size={16} /> {t('catadmin.create')}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onRestore}>
            <Icon name="refresh" size={16} /> {t('catadmin.restore')}
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('catadmin.colName')}</th>
              <th>{t('catadmin.colCount')}</th>
              <th>{t('catadmin.colLink')}</th>
              <th style={{ textAlign: 'end' }}>{t('catadmin.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="title-cell">
                  {editing && editing.id === c.id ? (
                    <input
                      className="input"
                      style={{ maxWidth: 280 }}
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') onRename() }}
                      autoFocus
                    />
                  ) : (
                    displayName(c)
                  )}
                </td>
                <td>{countArticlesByCategory(c.id)}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{c.slug}</td>
                <td>
                  <div className="row-actions">
                    {editing && editing.id === c.id ? (
                      <>
                        <button className="icon-btn primary" onClick={onRename}>
                          <Icon name="check" size={15} /> {t('catadmin.save')}
                        </button>
                        <button className="icon-btn" onClick={() => setEditing(null)}>{t('catadmin.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <button className="icon-btn" onClick={() => setEditing({ id: c.id, name: c.name })}>
                          <Icon name="edit" size={15} /> {t('catadmin.rename')}
                        </button>
                        <button className="icon-btn danger" onClick={() => setToDelete(c.id)}>
                          <Icon name="trash" size={15} /> {t('catadmin.delete')}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(toDelete)}
        title={t('catadmin.deleteTitle')}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel={t('catadmin.deleteBtn')}
        danger
      >
        <p>{t('catadmin.deleteHint')}</p>
      </Modal>
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
