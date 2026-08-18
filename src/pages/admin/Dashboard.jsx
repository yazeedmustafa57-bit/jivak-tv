import { Link } from 'react-router-dom'
import {
  getArticles,
  getCategories,
  setArticleStatus,
  getTotalPageViews,
  getVisitorsPerDay,
  getMostViewedArticles,
  getMostViewedVideos,
  getTopPages
} from '../../lib/store.js'
import { currentUser, canPublish, logAudit } from '../../lib/staff.js'
import { Icon } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'
import { getErrorLog, clearErrorLog } from '../../lib/errorLog.js'
import { useState } from 'react'
import { useStoreVersion } from '../../lib/useStore.js'

export default function Dashboard() {
  useStoreVersion()
  const { t, tCategory, tArticle, formatDate, formatDateTime, formatViews, lang } = useI18n()
  const [, setTick] = useState(0)
  const articles = getArticles()
  const categories = getCategories()
  const user = currentUser()
  const role = user?.role || 'author'
  const mayPublish = canPublish(role)
  const published = articles.filter((a) => a.status === 'published').length
  const drafts = articles.filter((a) => a.status === 'draft').length
  const review = articles.filter((a) => a.status === 'review').length
  const archived = articles.filter((a) => a.status === 'archived').length
  const myArticles = role === 'author' ? articles.filter((a) => a.authorId === (user?.authorId || '')) : []
  const reviewQueue = articles.filter((a) => a.status === 'review')
  const recent = [...articles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
  const totalViews = getTotalPageViews()
  const visitorsTotal = getVisitorsPerDay(999).reduce((sum, v) => sum + (v.count || 0), 0)
  const visitorsDay = getVisitorsPerDay(14)
  const mostRead = getMostViewedArticles(5)
  const mostWatched = getMostViewedVideos(5)
  const topPages = getTopPages(5)

  const stats = [
    { label: t('dash.published'), value: published, hint: t('dash.publishedHint') },
    { label: t('dash.drafts'), value: drafts, hint: t('dash.draftsHint') },
    { label: t('dash.review'), value: review, hint: t('dash.reviewHint') },
    { label: t('dash.archived'), value: archived, hint: t('dash.archivedHint') },
    { label: t('dash.pageViews'), value: totalViews, hint: t('dash.views') },
    { label: t('dash.visitors'), value: visitorsTotal, hint: t('dash.visits') }
  ]

  const ERROR_LOG_T = {
    ar: { title: 'سجل الأخطاء', empty: 'لا توجد أخطاء مسجلة.', clear: 'مسح السجل' },
    ku: { title: 'تۆمارا تشتێن چووین', empty: 'چ تشتەک نەهاتیە تۆمارکرن.', clear: 'تۆمار پاقژ کە' },
    en: { title: 'Error Log', empty: 'No errors recorded.', clear: 'Clear log' },
    de: { title: 'Fehlerprotokoll', empty: 'Keine Fehler aufgezeichnet.', clear: 'Protokoll leeren' }
  }[lang] || { title: 'Error Log', empty: '', clear: '' }
  const [errorLog, setErrorLog] = useState(getErrorLog)
  const clearErrors = () => { clearErrorLog(); setErrorLog([]) }

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('dash.title')}</h1>
          <div className="sub">{t('dash.welcome')}</div>
        </div>
        <Link className="btn btn-primary" to="/admin/artikel/neu">
          <Icon name="plus" size={16} /> {t('admin.newArticle')}
        </Link>
      </div>

      <div className="stats-grid top-stats">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="label">{s.label}</div>
            <div className="value">{s.value} <span>{s.hint}</span></div>
          </div>
        ))}
      </div>

      {role === 'author' && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h2>{t('dash.myArticles')}</h2>
          {myArticles.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>{t('dash.noMyArticles')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-dashboard">
                <thead>
                  <tr>
                    <th>{t('dash.colTitle')}</th>
                    <th>{t('dash.colStatus')}</th>
                    <th className="col-updated">{t('dash.colUpdated')}</th>
                    <th style={{ textAlign: 'end' }}>{t('dash.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {myArticles.map((a) => (
                    <tr key={a.id}>
                      <td className="title-cell">{a.title}</td>
                      <td>
                        <span className={`badge ${a.status === 'published' ? 'badge-success' : a.status === 'review' ? 'badge-info' : a.status === 'archived' ? 'badge-muted' : 'badge-warning'}`}>
                          {a.status === 'published' ? t('dash.statusPub') : a.status === 'review' ? t('dash.statusReview') : a.status === 'archived' ? t('dash.statusArchived') : t('dash.statusDraft')}
                        </span>
                      </td>
                      <td className="col-updated">{formatDateTime(a.updatedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="icon-btn" to={`/admin/artikel/${a.id}`}>
                            <Icon name="edit" size={15} /> {t('dash.edit')}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mayPublish && reviewQueue.length > 0 && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h2>{t('dash.reviewQueue')}</h2>
          <p className="hint" style={{ margin: '0 0 14px' }}>{t('dash.reviewQueueHint')}</p>
          <div className="table-wrap">
            <table className="table table-dashboard">
              <thead>
                <tr>
                  <th>{t('dash.colTitle')}</th>
                  <th className="col-updated">{t('dash.colUpdated')}</th>
                  <th style={{ textAlign: 'end' }}>{t('dash.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((a) => (
                  <tr key={a.id}>
                    <td className="title-cell">{a.title}</td>
                    <td className="col-updated">{formatDateTime(a.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          onClick={async () => {
                            try {
                              await setArticleStatus(a.id, 'published')
                              logAudit('article.published', { targetType: 'article', targetId: a.id, targetTitle: a.title })
                              setTick((x) => x + 1)
                            } catch (err) {
                              console.error(err)
                            }
                          }}
                        >
                          <Icon name="eye" size={15} /> {t('aadmin.approve')}
                        </button>
                        <Link className="icon-btn" to={`/admin/artikel/${a.id}`}>
                          <Icon name="edit" size={15} /> {t('dash.edit')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalViews === 0 && visitorsTotal === 0 ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h2>{t('dash.statsTitle')}</h2>
          <p className="hint" style={{ margin: 0 }}>{t('dash.noStats')}</p>
        </div>
      ) : (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h2>{t('dash.statsTitle')}</h2>
          <div className="sub" style={{ marginBottom: 18 }}>{t('dash.statsSub')}</div>

          {visitorsDay.length > 0 && (() => {
            const maxCount = Math.max(1, ...visitorsDay.map((x) => x.count))
            const shortDate = (dayStr) => {
              const d = new Date(dayStr + 'T12:00:00')
              const day = d.getDate()
              const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
              return day + '. ' + months[d.getMonth()]
            }
            return (
              <div className="stats-visits" style={{ marginBottom: 22 }}>
                <h3>{t('dash.visitsDay')}</h3>
                <div className="bar-chart">
                  {visitorsDay.map((v) => {
                    const pct = Math.max(6, Math.round((v.count / maxCount) * 100))
                    return (
                      <div className="bar-col" key={v.day} title={`${v.day}: ${v.count}`}>
                        <span className="bar-value">{v.count}</span>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ height: `${pct}%` }} />
                        </div>
                        <span className="bar-label">{shortDate(v.day)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          <div className="stats-grid" style={{ marginBottom: 18 }}>
            <div className="stat-card">
              <div className="label">{t('dash.pageViews')}</div>
              <div className="value">{formatViews(totalViews)}</div>
            </div>
            <div className="stat-card">
              <div className="label">{t('dash.visitors')}</div>
              <div className="value">{formatViews(visitorsTotal)}</div>
            </div>
          </div>

          <div className="stats-cols">
            {mostRead.length > 0 && (
              <div>
                <h3>{t('dash.mostRead')}</h3>
                <ol className="stats-list">
                  {mostRead.map((a) => (
                    <li key={a.id}>
                      <Link to={`/admin/artikel/${a.id}`}>{tArticle(a).title}</Link>
                      <span>{formatViews(a.views || 0)} {t('dash.views')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {mostWatched.length > 0 && (
              <div>
                <h3>{t('dash.mostWatched')}</h3>
                <ol className="stats-list">
                  {mostWatched.map((a) => (
                    <li key={a.id}>
                      <Link to={`/admin/artikel/${a.id}`}>{tArticle(a).title}</Link>
                      <span>{formatViews(a.views || 0)} {t('dash.views')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {topPages.length > 0 && (
              <div>
                <h3>{t('dash.topPages')}</h3>
                <ol className="stats-list">
                  {topPages.map((p) => (
                    <li key={p.path}>
                      <span dir="ltr">{p.path}</span>
                      <span>{formatViews(p.count || 0)} {t('dash.views')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{ERROR_LOG_T.title}</h2>
          {errorLog.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearErrors}>{ERROR_LOG_T.clear}</button>
          )}
        </div>
        {errorLog.length === 0 ? (
          <p className="hint" style={{ margin: '12px 0 0' }}>{ERROR_LOG_T.empty}</p>
        ) : (
          <div style={{ marginTop: 14 }}>
            {errorLog.slice(0, 8).map((e, i) => (
              <details key={e.t + '-' + i} style={{ marginBottom: 8, border: '1px solid rgba(196,71,44,0.18)', borderRadius: 8, padding: '8px 12px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink-soft)' }}>
                  <span style={{ color: '#C4472C', fontWeight: 600 }}>{e.source}</span>
                  {' · '}{new Date(e.t).toLocaleString()} · <span dir="auto">{String(e.msg).slice(0, 90)}</span>
                </summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.5, margin: '8px 0 0', maxHeight: 160, overflow: 'auto' }}>
                  {e.stack || e.msg}
                  {e.extra ? '\n\n' + e.extra : ''}
                  {'\nURL: '}{e.url}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>{t('dash.recent')}</h2>
        {recent.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('dash.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-dashboard">
              <thead>
                <tr>
                  <th>{t('dash.colTitle')}</th>
                  <th>{t('dash.colStatus')}</th>
                  <th className="col-updated">{t('dash.colUpdated')}</th>
                  <th style={{ textAlign: 'end' }}>{t('dash.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}>
                    <td className="title-cell">
                      {a.title}
                      <small>{categories.find((c) => c.id === a.categoryId) ? tCategory(categories.find((c) => c.id === a.categoryId)) : t('dash.noCat')}</small>
                    </td>
                    <td>
                      <span className={`badge ${a.status === 'published' ? 'badge-success' : a.status === 'review' ? 'badge-info' : a.status === 'archived' ? 'badge-muted' : 'badge-warning'}`}>
                        {a.status === 'published' ? t('dash.statusPub') : a.status === 'review' ? t('dash.statusReview') : a.status === 'archived' ? t('dash.statusArchived') : t('dash.statusDraft')}
                      </span>
                    </td>
                    <td className="col-updated">{formatDateTime(a.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="icon-btn" to={`/admin/artikel/${a.id}`}>
                          <Icon name="edit" size={15} /> {t('dash.edit')}
                        </Link>
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
  )
}
