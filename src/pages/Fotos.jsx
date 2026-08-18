import ArticleCard from '../components/ArticleCard.jsx'
import { getMediaByType } from '../lib/store.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function Fotos() {
  useStoreVersion()
  const { t } = useI18n()
  const photos = getMediaByType('photo')

  return (
    <div>
      <Seo title={t('fotos.title')} description={t('seo.desc')} path="/fotos" />
      <section className="page-head">
        <div className="container">
          <h1>{t('fotos.title')}</h1>
          <p>{t('fotos.sub')}</p>
        </div>
      </section>
      <div className="container">
        {photos.length > 0 ? (
          <div className="grid-foto">
            {photos.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('fotos.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
