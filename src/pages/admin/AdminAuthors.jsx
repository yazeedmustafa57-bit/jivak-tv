import { useRef, useState } from 'react'
import OptimizedImage from '../../components/OptimizedImage.jsx'

import { getAuthors, getArticlesByAuthorId, saveAuthor, deleteAuthor } from '../../lib/store.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'
import { useStoreVersion } from '../../lib/useStore.js'
import { saveImageFile } from '../../lib/media-upload.js'
import { MAX_IMAGE_BYTES } from '../../lib/cloud-storage.js'


const EMPTY = { id: '', name: '', role: '', bio: '', image: null }

export default function AdminAuthors() {
  useStoreVersion()
  const { t } = useI18n()
  const [authors, setAuthors] = useState(getAuthors())
  const sortedAuthors = [...authors].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState([])
  const [toast, setToast] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const fileRef = useRef(null)

  function refresh() {
    setAuthors(getAuthors())
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors([t('editor.bigImage')])
      return
    }
    const res = await saveImageFile(file, 'authors')
    if (!res.ok) {
      setErrors([t('editor.bigImage')])
      return
    }
    set('image', res.url)
    setErrors([])
  }

  function startEdit(a) {
    setForm({ id: a.id, name: a.name, role: a.role || '', bio: a.bio || '', image: a.image || null })
    setErrors([])
  }

  function onSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setErrors([t('authors.nameErr')])
      return
    }
    saveAuthor({ ...form, name: form.name.trim(), role: form.role.trim(), bio: form.bio.trim() })
    setForm(EMPTY)
    setErrors([])
    refresh()
    setToast(t('authors.save'))
  }

  function onDelete() {
    const result = deleteAuthor(toDelete)
    setToDelete(null)
    if (!result.ok) {
      setErrors([t(result.errorKey || 'authors.inUse')])
      return
    }
    refresh()
    setToast(t('authors.deleteConfirm'))
  }

  return (
    <div className="admin-authors-page">
      <div className="admin-topbar">
        <div>
          <h1>{t('admin.authors')}</h1>
          <div className="sub">{t('authors.sub')}</div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="form-error">
          {errors.map((er) => <div key={er}>• {er}</div>)}
        </div>
      )}

      <div className="editor-grid">
        <div className="panel">
          <h2>{form.id ? t('authors.save') : t('authors.new')}</h2>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="author-name">{t('mediaLib.name')}</label>
              <input id="author-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="author-role">{t('authors.role')}</label>
              <input id="author-role" className="input" value={form.role} onChange={(e) => set('role', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="author-bio">{t('authors.bio')}</label>
              <textarea id="author-bio" className="textarea" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
            </div>
            <div className="field">
              <label>{t('editor.cover')}</label>
              <div className="cover-upload">
                <input ref={fileRef} id="author-file" type="file" accept="image/*" onChange={onFile} />
                <label className="file-label" htmlFor="author-file" onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}>
                  <Icon name="upload" size={18} />
                  {form.image ? t('editor.replace') : t('editor.upload')}
                </label>
                {form.image && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => set('image', null)}>
                    {t('editor.remove')}
                  </button>
                )}
              </div>
            </div>
            <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn btn-primary" type="submit">
                <Icon name="check" size={16} /> {t('authors.save')}
              </button>
              {form.id && (
                <button className="btn btn-ghost" type="button" onClick={() => setForm(EMPTY)}>
                  {t('catadmin.cancel')}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="panel">
          <h2>{t('authors.title')} ({authors.length})</h2>
          {authors.length === 0 ? (
            <p className="hint">{t('authors.empty')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-authors">
                <thead>
                  <tr>
                    <th>{t('mediaLib.name')}</th>
                    <th>{t('authors.articles')}</th>
                    <th style={{ textAlign: 'end' }}>{t('aadmin.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAuthors.map((a) => (
                    <tr key={a.id}>
                      <td className="title-cell">
                        <div className="author-cell">
                          <span className="author-cell-avatar">
                            {a.image ? <OptimizedImage src={a.image} alt="" widths={[160, 320]} sizes="40px" /> : <Icon name="website" size={16} />}
                          </span>
                          <span>
                            {a.name}
                            {a.role && <small>{a.role}</small>}
                          </span>
                        </div>
                      </td>
                      <td>{getArticlesByAuthorId(a.id).length}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => startEdit(a)}>
                            <Icon name="edit" size={15} /> {t('aadmin.edit')}
                          </button>
                          <button className="icon-btn danger" onClick={() => setToDelete(a.id)}>
                            <Icon name="trash" size={15} /> {t('aadmin.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(toDelete)}
        title={t('authors.deleteTitle')}
        onClose={() => setToDelete(null)}
        onConfirm={onDelete}
        confirmLabel={t('aadmin.deleteBtn')}
        danger
      >
        <p>{t('authors.deleteConfirm')}</p>
      </Modal>
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
