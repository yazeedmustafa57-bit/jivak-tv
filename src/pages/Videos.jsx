import ArticleCard from '../components/ArticleCard.jsx'
import VideoCarousel from '../components/VideoCarousel.jsx'
import { getMediaByType, getCategories } from '../lib/store.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

export default function Videos() {
  useStoreVersion()
  const { t, tCategory } = useI18n()
  const videos = getMediaByType('video')
  const categories = getCategories()

  return (
    <div>
      <Seo title={t('videos.title')} description={t('seo.desc')} path="/videos" />
      <section className="page-head">
        <div className="container">
          <h1>{t('videos.title')}</h1>
          <p>{t('videos.sub')}</p>
        </div>
      </section>
      <div className="container">
        {videos.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <VideoCarousel
              videos={videos}
              title={t('videos.latest')}
              sub={t('videos.sub')}
            />
          </div>
        )}
        {videos.length > 0 ? (
          <>
            <div className="filter-row">
              <span className="filter-btn active">{t('videos.all', { count: videos.length })}</span>
              {categories.map((c) => (
                <span key={c.id} className="filter-btn">
                  {tCategory(c)}
                </span>
              ))}
            </div>
            <div className="grid-3">
              {videos.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>{t('videos.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
