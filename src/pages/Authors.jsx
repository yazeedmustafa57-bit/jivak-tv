import { Link } from 'react-router-dom'
import OptimizedImage from '../components/OptimizedImage.jsx'

import { getAuthors, getArticlesByAuthorId } from '../lib/store.js'
import { autoCover } from '../lib/cover.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'

export default function Authors() {
  useStoreVersion()
  const { t, tc, tAuthor } = useI18n()
  const authors = getAuthors().filter((a) => getArticlesByAuthorId(a.id).length > 0 || a.id === 'author-redaktion')
  const all = getAuthors()

  return (
    <div>
      <section className="page-head">
        <div className="container">
          <h1>{t('authors.title')}</h1>
          <p>{t('authors.sub')}</p>
        </div>
      </section>
      <div className="container" style={{ paddingBottom: 72 }}>
        {all.length > 0 ? (
          <div className="grid-3">
            {all.map((a) => {
              const local = tAuthor(a)
              const count = getArticlesByAuthorId(a.id).length
              return (
                <Link className="author-card" to={`/autor/${a.slug}`} key={a.id}>
                  <div className="author-avatar">
                    {a.image ? (
                      <OptimizedImage src={a.image} alt={a.name} widths={[160, 320]} sizes="84px" />
                    ) : (
                      <OptimizedImage src={autoCover({ id: a.id }, 'gemeinschaft')} alt="" widths={[160, 320]} sizes="84px" />
                    )}
                  </div>
                  <h3>{a.name}</h3>
                  {local.role && <span className="author-role">{local.role}</span>}
                  <span className="author-count">{tc('unit.article', count)}</span>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('authors.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
