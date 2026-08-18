import { Link, useParams } from 'react-router-dom'
import OptimizedImage from '../components/OptimizedImage.jsx'

import ArticleCard from '../components/ArticleCard.jsx'
import { getAuthorBySlug, getArticlesByAuthorId } from '../lib/store.js'
import { autoCover } from '../lib/cover.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function AuthorProfile() {
  useStoreVersion()
  const { t, tAuthor } = useI18n()
  const { slug } = useParams()
  const author = getAuthorBySlug(slug)
  const articles = author ? getArticlesByAuthorId(author.id) : []

  if (!author) {
    return (
      <div className="container" style={{ padding: '120px 24px', textAlign: 'center' }}>
        <h1>{t('detail.notFound')}</h1>
        <p className="lead" style={{ color: 'var(--ink-soft)' }}>{t('detail.notFoundText')}</p>
        <Link className="btn btn-primary" to="/autoren">{t('authors.title')}</Link>
      </div>
    )
  }

  const local = tAuthor(author)

  return (
    <div>
      <Seo title={author ? tAuthor(author).name : t('authors.title')} description={author ? (tAuthor(author).bio || '') : t('seo.desc')} path={`/autor/${slug || ''}`} image={author?.image} />
      <section className="page-head">
        <div className="container">
          <Link className="back-link" to="/autoren">{t('authors.title')} ←</Link>
          <div className="author-head">
            <div className="author-avatar large">
              {author.image ? (
                <OptimizedImage src={author.image} alt={author.name} widths={[160, 320]} sizes="110px" />
              ) : (
                <OptimizedImage src={autoCover({ id: author.id }, 'gemeinschaft')} alt="" widths={[160, 320]} sizes="110px" />
              )}
            </div>
            <div>
              <h1>{author.name}</h1>
              {local.role && <p className="author-role">{local.role}</p>}
              <p className="lead">{t('authors.articles')}: {articles.length}</p>
            </div>
          </div>
        </div>
      </section>
      <div className="container" style={{ paddingBottom: 72 }}>
        {local.bio && (
          <div className="panel author-bio">
            <h2>{t('authors.bio')}</h2>
            <p>{local.bio}</p>
          </div>
        )}
        {articles.length > 0 ? (
          <div className="grid-3">
            {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('articles.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
