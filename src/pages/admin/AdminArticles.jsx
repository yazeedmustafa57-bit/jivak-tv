import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getArticles,
  getCategories,
  setArticleStatus,
  deleteArticle
} from '../../lib/store.js'
import { currentUser, canPublish, canDeleteArticles, logAudit } from '../../lib/staff.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { LANGUAGES, useI18n } from '../../lib/i18n.jsx'
import { detectArticleLang } from '../../lib/translate.js'
import { cloudFetchArticleTranslations } from '../../lib/cloud-api.js'
import { cloudEnabled } from '../../lib/supabase.js'
import { useStoreVersion } from '../../lib/useStore.js'

const FILTERS = ['alle', 'draft', 'review', 'published', 'archived']

export default function AdminArticles() {
  useStoreVersion()
  const { t, tCategory, formatDateTime } = useI18n()
  const [articles, setArticles] = useState(getArticles())
  const [filter, setFilter] = useState('alle')
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [trMap, setTrMap] = useState({})
  const navigate = useNavigate()
  const categories = getCategories()
  const user = currentUser()
  const role = user?.role || 'author'
  const mayPublish = canPublish(role)
  const mayDelete = canDeleteArticles(role)

  if (role === 'media') {
    return (
      <div className="container" style={{ padding: '120px 24px', textAlign: 'center' }}>
        <h1>{t('editor.noAccess')}</h1>
        <p className="lead" style={{ color: 'var(--ink-soft)' }}>{t('editor.noAccessText')}</p>
        <Link className="btn btn-primary" to="/admin/medien">{t('admin.media')}</Link>
      </div>
    )
  }

  // Autoren sehen nur ihre eigenen Artikel; Redakteure/Admins alles.
  const scoped = mayPublish
    ? articles
    : articles.filter((a) => a.authorId === (user?.authorId || ''))

  const visible = filter === 'alle' ? scoped : scoped.filter((a) => a.status === filter)
  const visibleIds = visible.map((a) => a.id).join('|')

  // Übersetzungsstatus je Artikel aus der Datenbank laden
  useEffect(() => {
    let alive = true
    if (!cloudEnabled || !visibleIds) {
      setTrMap({})
      return undefined
    }
    cloudFetchArticleTranslations(visible.map((a) => a.id))
      .then((rows) => {
        if (!alive) return
        const map = {}
        rows.forEach((r) => {
          if (!map[r.articleId]) map[r.articleId] = {}
          map[r.articleId][r.lang] = r.kind
        })
        setTrMap(map)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [visibleIds, filter])

  function refresh() {
    setArticles(getArticles())
  }

  function statusLabel(status) {
    if (status === 'published') return t('aadmin.statusPub')
    if (status === 'review') return t('aadmin.statusReview')
    if (status === 'archived') return t('aadmin.statusArchived')
    return t('aadmin.statusDraft')
  }

  function statusClass(status) {
    if (status === 'published') return 'badge-success'
    if (status === 'review') return 'badge-info'
    if (status === 'archived') return 'badge-muted'
    return 'badge-warning'
  }

  // Primäre Status-Aktion je nach aktuellem Status:
  // Entwurf/Prüfung → veröffentlichen · veröffentlicht → Entwurf · archiviert → veröffentlichen
  async function toggleStatus(id) {
    const article = articles.find((a) => a.id === id)
    if (!article) return
    const next = article.status === 'published' ? 'draft' : 'published'
    try {
      await setArticleStatus(id, next)
      refresh()
      setToast(next === 'published' ? t('aadmin.toastPub') : t('aadmin.toastDraft'))
      logAudit(next === 'published' ? 'article.published' : 'article.draft', {
        targetType: 'article',
        targetId: id,
        targetTitle: article.title
      })
    } catch (err) {
      setError(err?.message || t('aadmin.storageErr'))
    }
  }

  async function confirmDelete() {
    const article = articles.find((a) => a.id === toDelete)
    try {
      await deleteArticle(toDelete)
      setToDelete(null)
      refresh()
      setToast(t('aadmin.toastDel'))
      if (article) {
        logAudit('article.deleted', { targetType: 'article', targetId: article.id, targetTitle: article.title })
      }
    } catch (err) {
      setToDelete(null)
      setError(err?.message || t('aadmin.storageErr'))
    }
  }

  const formatLabel = (type) =>
    type === 'video' ? t('aadmin.formatVideo') : type === 'photo' ? t('aadmin.formatPhoto') : t('aadmin.formatArticle')

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('aadmin.title')}</h1>
          <div className="sub">{t('aadmin.sub', { count: scoped.length })}</div>
        </div>
        <Link className="btn btn-primary" to="/admin/artikel/neu">
          <Icon name="plus" size={16} /> {t('admin.newArticle')}
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-row" style={{ marginTop: 0, marginBottom: 20 }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'alle' ? t('aadmin.all') : f === 'published' ? t('aadmin.published') : f === 'review' ? t('aadmin.review') : f === 'archived' ? t('aadmin.archived') : t('aadmin.drafts')}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <p>{t('aadmin.empty')}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('aadmin.colTitle')}</th>
                <th>{t('aadmin.colCat')}</th>
                <th>{t('aadmin.colFormat')}</th>
                <th>{t('aadmin.colStatus')}</th>
                <th>{t('aadmin.colTr')}</th>
                <th>{t('aadmin.colUpdated')}</th>
                <th style={{ textAlign: 'end' }}>{t('aadmin.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td className="title-cell">
                    {a.title}
                    <small>Slug: /artikel/{a.slug}</small>
                  </td>
                  <td>{categories.find((c) => c.id === a.categoryId) ? tCategory(categories.find((c) => c.id === a.categoryId)) : '—'}</td>
                  <td>
                    <span className="badge">{formatLabel(a.mediaType)}</span>
                  </td>
                  <td>
                    <span className={`badge ${statusClass(a.status)}`}>{statusLabel(a.status)}</span>
                  </td>
                  <td>
                    {(() => {
                      const source = detectArticleLang(a.title)
                      const map = trMap[a.id] || {}
                      return LANGUAGES.filter((l) => l.code !== source).map((l) => {
                        const kind = map[l.code]
                        const label =
                          kind === 'manual'
                            ? t('editor.trManual')
                            : kind === 'auto'
                              ? t('editor.trAuto')
                              : t('editor.trMissing')
                        const cls = kind === 'manual' ? 'chip chip-manual' : kind === 'auto' ? 'chip chip-auto' : 'chip chip-missing'
                        return (
                          <span key={l.code} className={cls} title={`${l.label}: ${label}`}>
                            {l.code}
                          </span>
                        )
                      })
                    })()}
                  </td>
                  <td>{formatDateTime(a.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      {mayPublish && (
                        <button className="icon-btn" onClick={() => toggleStatus(a.id)} title={t('aadmin.colStatus')}>
                          <Icon name={a.status === 'published' ? 'eyeOff' : 'eye'} size={15} />
                          {a.status === 'published' ? t('aadmin.toDraft') : a.status === 'review' ? t('aadmin.approve') : t('aadmin.publish')}
                        </button>
                      )}
                      <Link className="icon-btn" to={`/admin/artikel/${a.id}`}>
                        <Icon name="edit" size={15} /> {t('aadmin.edit')}
                      </Link>
                      {mayDelete && (
                        <button className="icon-btn danger" onClick={() => setToDelete(a.id)}>
                          <Icon name="trash" size={15} /> {t('aadmin.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(toDelete)}
        title={t('aadmin.deleteTitle')}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel={t('aadmin.deleteBtn')}
        danger
      >
        <p>{t('aadmin.deleteConfirm', { title: articles.find((a) => a.id === toDelete)?.title || '' })}</p>
      </Modal>
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
