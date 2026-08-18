import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import ArticleCard from '../components/ArticleCard.jsx'
import { getPublishedArticles, getCategories } from '../lib/store.js'
import { useI18n } from '../lib/i18n.jsx'
import { localizedArticleSync } from '../lib/translate.js'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function Articles() {
  useStoreVersion()
  const { t, tCategory, tArticle, lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const active = params.get('kategorie') || 'alle'
  const q = (params.get('q') || '').trim().toLowerCase()
  const categories = getCategories()

  const articles = useMemo(() => {
    const all = getPublishedArticles()
    const byCat = active === 'alle'
      ? all
      : all.filter((a) => {
          const cat = categories.find((c) => c.slug === active)
          return cat ? a.categoryId === cat.id : true
        })
    if (!q) return byCat
    const match = (str) => String(str || '').toLowerCase().includes(q)
    return byCat.filter((a) => {
      const synced = localizedArticleSync(a, lang)
      const local = synced !== a ? synced : tArticle(a)
      return match(local.title) || match(local.intro) || match(local.body)
    })
  }, [active, q, categories, tArticle, lang])

  function setFilter(slug) {
    const next = {}
    if (slug !== 'alle') next.kategorie = slug
    if (q) next.q = params.get('q')
    setParams(next)
  }

  return (
    <div>
      <Seo title={t('articles.title')} description={t('seo.desc')} path="/artikel" />
      <section className="page-head">
        <div className="container">
          <h1>{t('articles.title')}</h1>
          <p>{t('articles.sub')}</p>
        </div>
      </section>
      <div className="container">
        <div className="filter-row">
          <button
            className={`filter-btn ${active === 'alle' ? 'active' : ''}`}
            onClick={() => setFilter('alle')}
          >
            {t('articles.all')}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`filter-btn ${active === c.slug ? 'active' : ''}`}
              onClick={() => setFilter(c.slug)}
            >
              {tCategory(c)}
            </button>
          ))}
        </div>
        {q && (
          <p className="search-summary">{t('search.summary', { q, count: articles.length })}</p>
        )}
        {articles.length > 0 ? (
          <div className="grid-3">
            {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        ) : (
          <div className="empty-state">
            <p>{q ? t('search.empty', { q }) : t('articles.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
