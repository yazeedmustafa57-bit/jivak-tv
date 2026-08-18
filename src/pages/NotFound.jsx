import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function NotFound() {
  useStoreVersion()
  const { t } = useI18n()
  return (
    <div>
      <Seo title={t('notFound.title')} description={t('seo.desc')} path="/" />
      <section className="page-head">
        <div className="container">
          <h1 className="nf-code">404</h1>
          <h2>{t('notFound.title')}</h2>
          <p>{t('notFound.text')}</p>
          <div className="row-actions" style={{ justifyContent: 'center', marginTop: 24 }}>
            <Link className="btn btn-primary" to="/">{t('notFound.home')}</Link>
            <Link className="btn btn-ghost" to="/artikel">{t('notFound.articles')}</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
