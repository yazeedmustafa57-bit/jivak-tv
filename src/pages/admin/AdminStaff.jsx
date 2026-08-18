import { useEffect, useState } from 'react'
import { getAuthors } from '../../lib/store.js'
import {
  fetchStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  sendStaffResetEmail,
  logAudit
} from '../../lib/staff.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'

const EMPTY_FORM = { id: '', name: '', email: '', role: 'author', authorId: '', active: true, password: '' }

export default function AdminStaff() {
  const { t } = useI18n()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [pwTarget, setPwTarget] = useState(null)
  const [newPw, setNewPw] = useState('')
  const authors = getAuthors()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const r = await fetchStaff()
    setLoading(false)
    if (!r.ok) {
      setError(r.error || 'load-failed')
      return
    }
    setStaff(r.staff || [])
  }

  const roleLabel = (role) =>
    ({
      admin: t('staff.roleAdmin'),
      editor: t('staff.roleEditor'),
      author: t('staff.roleAuthor'),
      media: t('staff.roleMedia')
    })[role] || role

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditing(false)
    setError('')
    setModalOpen(true)
  }

  function openEdit(s) {
    setForm({ id: s.id, name: s.name || '', email: s.email || '', role: s.role || 'author', authorId: s.authorId || '', active: s.active !== false, password: '' })
    setEditing(true)
    setError('')
    setModalOpen(true)
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError(t('staff.errName')); return }
    if (!editing && (!form.email.trim() || !String(form.email).includes('@'))) { setError(t('staff.errEmail')); return }
    if (!editing && String(form.password || '').length < 6) { setError(t('staff.errPw')); return }
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      role: form.role,
      authorId: form.authorId,
      active: form.active
    }
    if (editing) {
      payload.id = form.id
      if (form.password) payload.password = form.password
      const r = await updateStaff(payload)
      setBusy(false)
      if (!r.ok) { setError(r.error || t('staff.errSave')); return }
      setToast(t('staff.saved'))
      logAudit('staff.updated', { targetType: 'staff', targetId: r.staff?.id || form.id, targetTitle: r.staff?.name || form.name })
    } else {
      payload.email = form.email.trim()
      payload.password = form.password
      const r = await createStaff(payload)
      setBusy(false)
      if (!r.ok) {
        setError(/already|exist|registered/i.test(r.error || '') ? t('staff.errEmailExists') : (r.error || t('staff.errSave')))
        return
      }
      setToast(t('staff.saved'))
      logAudit('staff.created', { targetType: 'staff', targetId: r.staff?.id, targetTitle: r.staff?.name || form.name })
    }
    setModalOpen(false)
    load()
  }

  async function confirmDelete() {
    if (!toDelete) return
    const target = staff.find((s) => s.id === toDelete)
    if (target && target.role === 'admin' && staff.filter((s) => s.role === 'admin').length <= 1) {
      setError(t('staff.lastAdmin'))
      setToDelete(null)
      return
    }
    const r = await deleteStaff(toDelete)
    if (!r.ok) {
      setError(r.error === 'self-delete' ? t('staff.selfDelete') : r.error === 'last-admin' ? t('staff.lastAdmin') : (r.error || t('staff.errDelete')))
      setToDelete(null)
      return
    }
    setToast(t('staff.deleted'))
    if (target) logAudit('staff.deleted', { targetType: 'staff', targetId: target.id, targetTitle: target.name })
    setToDelete(null)
    load()
  }

  async function submitPassword() {
    if (!pwTarget) return
    if (String(newPw || '').length < 6) { setError(t('staff.errPw')); return }
    setError('')
    setBusy(true)
    const r = await updateStaff({ id: pwTarget.id, password: newPw })
    setBusy(false)
    if (!r.ok) { setError(r.error || t('staff.errSave')); return }
    setToast(t('staff.pwChanged'))
    logAudit('staff.password', { targetType: 'staff', targetId: pwTarget.id, targetTitle: pwTarget.name })
    setPwTarget(null)
    setNewPw('')
  }

  async function sendResetMail(s) {
    setBusy(true)
    const r = await sendStaffResetEmail(s.email)
    setBusy(false)
    if (!r.ok) { setError(r.error || t('staff.errMail')); return }
    setToast(t('staff.mailSent'))
  }

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('staff.title')}</h1>
          <div className="sub">{t('staff.sub')}</div>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>
          <Icon name="plus" size={16} /> {t('staff.add')}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="empty-state"><p>{t('staff.loading')}</p></div>
      ) : staff.length === 0 ? (
        <div className="empty-state"><p>{t('staff.empty')}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('staff.colName')}</th>
                <th>{t('staff.colEmail')}</th>
                <th>{t('staff.colRole')}</th>
                <th>{t('staff.colAuthor')}</th>
                <th>{t('staff.colStatus')}</th>
                <th style={{ textAlign: 'end' }}>{t('staff.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const author = authors.find((a) => a.id === s.authorId)
                return (
                  <tr key={s.id}>
                    <td className="title-cell">{s.name}</td>
                    <td><span dir="ltr">{s.email}</span></td>
                    <td><span className={`badge ${s.role === 'admin' ? 'badge-success' : ''}`}>{roleLabel(s.role) || '—'}</span></td>
                    <td>{author ? author.name : '—'}</td>
                    <td>
                      <span className={`badge ${s.active === false ? 'badge-muted' : 'badge-success'}`}>
                        {s.active === false ? t('staff.inactive') : t('staff.active')}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => openEdit(s)}>
                          <Icon name="edit" size={15} /> {t('aadmin.edit')}
                        </button>
                        <button className="icon-btn" onClick={() => { setPwTarget(s); setNewPw(''); setError('') }}>
                          <Icon name="key" size={15} /> {t('staff.resetPw')}
                        </button>
                        <button className="icon-btn" onClick={() => sendResetMail(s)}>
                          <Icon name="mail" size={15} /> {t('staff.sendResetMail')}
                        </button>
                        <button className="icon-btn danger" onClick={() => setToDelete(s.id)}>
                          <Icon name="trash" size={15} /> {t('aadmin.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title={editing ? t('staff.edit') : t('staff.add')} onClose={() => setModalOpen(false)} onConfirm={submit} confirmLabel={editing ? t('staff.save') : t('staff.create')} >
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <div className="field">
            <label htmlFor="st-name">{t('staff.name')}</label>
            <input id="st-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="st-email">{t('staff.email')}</label>
            <input id="st-email" className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" disabled={editing} required={!editing} />
          </div>
          <div className="field">
            <label htmlFor="st-role">{t('staff.role')}</label>
            <select id="st-role" className="select" value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="admin">{t('staff.roleAdmin')}</option>
              <option value="editor">{t('staff.roleEditor')}</option>
              <option value="author">{t('staff.roleAuthor')}</option>
              <option value="media">{t('staff.roleMedia')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="st-author">{t('staff.author')}</label>
            <select id="st-author" className="select" value={form.authorId} onChange={(e) => set('authorId', e.target.value)}>
              <option value="">{t('staff.authorNone')}</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="st-pw">{editing ? t('staff.pwOptional') : t('staff.password')}</label>
            <input id="st-pw" className="input" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
            <span className="hint">{t('staff.passwordHint')}</span>
          </div>
          <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.active !== false} onChange={(e) => set('active', e.target.checked)} />
            {t('staff.active')}
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(toDelete)}
        title={t('staff.delete')}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel={t('staff.deleteBtn')}
        danger
      >
        <p>{t('staff.deleteConfirm', { name: staff.find((s) => s.id === toDelete)?.name || '' })}</p>
      </Modal>

      <Modal
        open={Boolean(pwTarget)}
        title={t('staff.resetPw')}
        onClose={() => setPwTarget(null)}
        onConfirm={submitPassword}
        confirmLabel={t('staff.save')}
      >
        <p>{t('staff.resetPwFor', { name: pwTarget?.name || '' })}</p>
        <div className="field">
          <label htmlFor="npw">{t('staff.newPw')}</label>
          <input id="npw" className="input" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          <span className="hint">{t('staff.passwordHint')}</span>
        </div>
      </Modal>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
