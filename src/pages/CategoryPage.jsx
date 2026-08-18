import { useParams, Link } from 'react-router-dom'
import ArticleCard from '../components/ArticleCard.jsx'
import { getCategoryBySlug, getPublishedArticles, getCategories } from '../lib/store.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function CategoryPage() {
  useStoreVersion()
  const { t, tCategory } = useI18n()
  const { slug } = useParams()
  const categories = getCategories()
  const active = slug ? getCategoryBySlug(slug) : null
  const articles = slug
    ? getPublishedArticles().filter((a) => a.categoryId === active?.id)
    : getPublishedArticles()

  return (
    <div>
      <Seo title={active ? tCategory(active) : t('categories.title')} description={t('seo.desc')} path={`/kategorien/${slug || ''}`} />
      <section className="page-head">
        <div className="container">
          <h1>{active ? tCategory(active) : t('categories.title')}</h1>
          <p>
            {active
              ? t('categories.catSub', { name: tCategory(active) })
              : t('categories.allSub')}
          </p>
        </div>
      </section>
      <div className="container">
        {!slug && (
          <div className="cat-grid" style={{ marginBottom: 40 }}>
            {categories.map((c) => (
              <Link key={c.id} className="cat-card" to={`/kategorien/${c.slug}`}>
                <h3>{tCategory(c)}</h3>
              </Link>
            ))}
          </div>
        )}
        {articles.length > 0 ? (
          <div className="grid-3">
            {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('categories.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
