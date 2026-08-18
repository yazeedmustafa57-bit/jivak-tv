import { useMemo } from 'react'
import OptimizedImage from '../components/OptimizedImage.jsx'

import { Link, useSearchParams } from 'react-router-dom'
import ArticleCard from '../components/ArticleCard.jsx'
import { searchAll } from '../lib/search.js'
import { getCategories } from '../lib/store.js'
import { autoCover } from '../lib/cover.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function SearchPage() {
  useStoreVersion()
  const { t, tArticle, tCategory, tAuthor } = useI18n()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const active = params.get('type') || 'alle'

  const results = useMemo(() => searchAll(q, { tArticle, tCategory, tAuthor }), [q, tArticle, tCategory, tAuthor])

  function setType(type) {
    const next = { q }
    if (type !== 'alle') next.type = type
    setParams(next)
  }

  const groups = {
    alle: results ? [...results.articles, ...results.videos, ...results.photos] : [],
    artikel: results?.articles || [],
    video: results?.videos || [],
    foto: results?.photos || []
  }
  const visible = groups[active] || []

  const total = results ? results.articles.length + results.videos.length + results.photos.length : 0

  return (
    <div>
      <Seo title={t('search.title')} description={t('seo.desc')} path="/suche" />
      <section className="page-head">
        <div className="container">
          <h1>{t('search.title')}</h1>
          <p>
            {q.trim()
              ? t('search.summary', { q, count: total })
              : t('search.placeholder')}
          </p>
        </div>
      </section>
      <div className="container" style={{ paddingBottom: 72 }}>
        <div className="filter-row">
          {['alle', 'artikel', 'video', 'foto'].map((f) => (
            <button
              key={f}
              className={`filter-btn ${active === f ? 'active' : ''}`}
              onClick={() => setType(f)}
            >
              {f === 'alle' ? t('mediaLib.all') : f === 'artikel' ? t('search.articles') : f === 'video' ? t('search.videos') : t('search.photos')}
            </button>
          ))}
        </div>

        {!results ? (
          <div className="empty-state">
            <p>{t('search.placeholder')}</p>
          </div>
        ) : (
          <>
            {visible.length > 0 ? (
              <div className="grid-3">
                {visible.map((a) => <ArticleCard key={a.id} article={a} />)}
              </div>
            ) : (
              <div className="empty-state">
                <p>{t('search.noResults')}</p>
              </div>
            )}

            {active === 'alle' && (
              <>
                {results.authors.length > 0 && (
                  <section className="section" style={{ paddingBottom: 0 }}>
                    <div className="section-head">
                      <div>
                        <h2>{t('search.authors')}</h2>
                      </div>
                    </div>
                    <div className="grid-3">
                      {results.authors.map((a) => (
                        <Link className="author-card" to={`/autor/${a.slug}`} key={a.id}>
                          <div className="author-avatar">
                            {a.image ? (
                              <OptimizedImage src={a.image} alt={a.name} widths={[160, 320]} sizes="84px" />
                            ) : (
                              <OptimizedImage src={autoCover({ id: a.id }, 'gemeinschaft')} alt="" widths={[160, 320]} sizes="84px" />
                            )}
                          </div>
                          <h3>{a.name}</h3>
                          {tAuthor(a).role && <span className="author-role">{tAuthor(a).role}</span>}
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
                {results.categories.length > 0 && (
                  <section className="section" style={{ paddingBottom: 0 }}>
                    <div className="section-head">
                      <div>
                        <h2>{t('search.categories')}</h2>
                      </div>
                    </div>
                    <div className="cat-grid">
                      {results.categories.map((c) => (
                        <Link key={c.id} className="cat-card" to={`/kategorien/${c.slug}`}>
                          <h3>{tCategory(c)}</h3>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {results.categories.length > 0 && active !== 'alle' && (
              <p className="hint" style={{ marginTop: 24 }}>
                <Link to={`/suche?q=${encodeURIComponent(q)}`} style={{ color: 'var(--accent)' }}>
                  {t('search.categories')} ({results.categories.length}) →
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
