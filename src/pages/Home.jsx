import { Link } from 'react-router-dom'
import OptimizedImage from '../components/OptimizedImage.jsx'

import ArticleCard from '../components/ArticleCard.jsx'
import VideoCarousel from '../components/VideoCarousel.jsx'
import PlayIcon from '../components/PlayIcon.jsx'
import VideoPreview from '../components/VideoPreview.jsx'
import { WeatherSection } from '../components/Weather.jsx'
import { CurrencySection } from '../components/Currency.jsx'
import { isDirectMediaUrl, isHlsUrl, isYouTubeLink } from '../lib/youtube.js'
import {
  getPublishedArticles,
  getCategories,
  getAuthorById,
  getArticlesByCategory,
  getMediaByType,
  countArticlesByCategory,
  getPopularArticles,
  getMostReadArticles,
  getMostViewedVideos,
  getRecommendedArticles,
  readingMinutes
} from '../lib/store.js'
import { coverFor, heroCover, autoCover } from '../lib/cover.js'
import { useI18n } from '../lib/i18n.jsx'
import { useArticleL10n } from '../lib/useArticleL10n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'

function LTitle({ article }) {
  const local = useArticleL10n(article)
  return local?.title || ''
}

function ReadTime({ article }) {
  const local = useArticleL10n(article)
  const { tc } = useI18n()
  return <span>{tc('unit.minutes', readingMinutes(local?.body))}</span>
}

export default function Home() {
  const { t, tc, tCategory, tAuthor, formatDate } = useI18n()
  useStoreVersion()
  const articles = getPublishedArticles()
  const featured = articles[0] || null
  const featuredLocal = useArticleL10n(featured)
  const topNews = articles.slice(1, 6)
  const latest = articles.slice(0, 8)
  const categories = getCategories()
  const videos = getMediaByType('video')
  const photos = getMediaByType('photo')
  const popular = getPopularArticles(5)
  const mostRead = getMostReadArticles(3)
  const topVideos = getMostViewedVideos(8)
  const recommended = getRecommendedArticles(3)

  const categorySlugOf = (id) => categories.find((c) => c.id === id)?.slug || ''
  const isPreviewVideo = (a) => a.mediaType === 'video' && Boolean(a.mediaUrl) && (isDirectMediaUrl(a.mediaUrl) || isHlsUrl(a.mediaUrl) || isYouTubeLink(a.mediaUrl))
  const authorNameOf = (a) => {
    const au = a.authorId ? getAuthorById(a.authorId) : null
    return au ? tAuthor(au).name : (a.author || '')
  }

  // Startseite baut sich automatisch nach Hauptkategorien auf (neueste zuerst)
const HOME_CATEGORY_ORDER = [
    'cat-region',
    'cat-kurdistan',
    'cat-irak',
    'cat-welt',
    'cat-sport',
    'cat-kultur',
    'cat-religion',
    'cat-diaspora'
  ]
  const homeSections = HOME_CATEGORY_ORDER
    .map((id) => categories.find((c) => c.id === id))
    .filter(Boolean)
    .map((cat) => ({ cat, items: getArticlesByCategory(cat.id, 3) }))
    .filter((sec) => sec.items.length > 0)

  const KICKER_KEYS = {
    latest: 'home.kicker.latest',
    popular: 'home.kicker.popular',
    mostRead: 'home.kicker.mostRead',
    videoTop: 'home.kicker.video',
    gallery: 'home.kicker.gallery',
    topics: 'home.kicker.topics',
    recommended: 'home.kicker.editors',
    media: 'home.kicker.media'
  }
  const secKicker = (key) => (t(KICKER_KEYS[key]) || '')

  function SecHead({ kickerKey, title, sub, to, allLabel }) {
    return (
      <div className="sec-head">
        <div>
          {kickerKey && <span className="sec-kicker">{secKicker(kickerKey)}</span>}
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {to && <Link className="more" to={to}>{allLabel}</Link>}
      </div>
    )
  }

  return (
    <div>
      <Seo title="Jivak TV" description={t('seo.desc')} path="/" />
      {featured && (
        <section className="section hero-section">
          <div className="container">
            <div className="top-news">
              <Link
                className="hero-topstory-link"
                to={`/artikel/${featured.slug}`}
              >
                <div className="hero-topstory-media">
                  {isPreviewVideo(featured) ? (
                    <VideoPreview
                      url={featured.mediaUrl}
                      poster={featured.image || heroCover(categorySlugOf(featured.categoryId))}
                      sizes="100vw"
                    />
                  ) : (
                    <img
                      className="hero-topstory-img"
                      src={featured.image || coverFor(featured, categorySlugOf(featured.categoryId))}
                      alt=""
                      loading="eager"
                      decoding="async"
                      onError={(e) => {
                        const fb = autoCover(featured, categorySlugOf(featured.categoryId))
                        if (e.currentTarget.src !== fb) e.currentTarget.src = fb
                      }}
                    />
                  )}
                </div>
                <span className="hero-topstory-shade" aria-hidden="true" />
                <span className="hero-topstory-inner">
                  <span className="hero-topstory-kicker">
                    {featured.categoryId && tCategory(categories.find((c) => c.id === featured.categoryId))}
                    {featured.mediaType === 'video' && <span className="hero-topstory-live">{t('media.video')}</span>}
                  </span>
                  <span className="hero-topstory-title">{featuredLocal?.title}</span>
                  <span className="hero-topstory-intro">{featuredLocal?.intro}</span>
                  <span className="hero-topstory-meta">
                    {authorNameOf(featured) && (
                      <span className="hero-topstory-author">{authorNameOf(featured)}</span>
                    )}
                    <span>{formatDate(featured.createdAt)}</span>
                    <span>{tc('unit.minutes', readingMinutes(featuredLocal?.body))}</span>
                  </span>
                </span>
              </Link>

              {topNews.length > 0 && (
                <div className="top-news-list">
                  {topNews.map((a) => {
                    const cat = categories.find((c) => c.id === a.categoryId)
                    return (
                      <Link key={a.id} className="top-news-item" to={`/artikel/${a.slug}`}>
                        <div className="cover">
                          {isPreviewVideo(a) ? (
                            <VideoPreview url={a.mediaUrl} poster={a.image || coverFor(a, categorySlugOf(a.categoryId))} sizes="(max-width: 640px) 50vw, 280px" />
                          ) : (
                            <OptimizedImage src={a.image || coverFor(a, categorySlugOf(a.categoryId))} alt="" widths={[320, 480, 800]} sizes="(max-width: 640px) 50vw, 280px" fallback={autoCover(a, categorySlugOf(a.categoryId))} />
                          )}
                          {a.mediaType === 'video' ? (
                            <PlayIcon />
                          ) : a.mediaType !== 'article' ? (
                            <span className="media-badge media-photo">{t('media.photo')}</span>
                          ) : null}
                        </div>
                        <div className="top-news-body">
                          {cat && <span className={`pill pill-sm cat-${cat.slug}`}>{tCategory(cat)}</span>}
                          <h3><LTitle article={a} /></h3>
                          <span className="article-meta">
                            {authorNameOf(a) && (
                              <>
                                <span className="author">{authorNameOf(a)}</span>
                                <span className="dot" />
                              </>
                            )}
                            <span>{formatDate(a.createdAt)}</span>
                            <span className="dot" />
                            <span><ReadTime article={a} /></span>
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {featured && (
        <section className="section" style={{ paddingTop: 28 }}>
          <div className="container">
            <SecHead kickerKey="latest" title={t('home.latest')} sub={t('home.latestSub')} to="/artikel" allLabel={t('home.allArticles')} />
            <div className="grid-3">
              {latest.map((a) => <ArticleCard key={a.id} article={a} autoPreview />)}
            </div>
            <div className="more-articles-row">
              <Link className="btn btn-soft" to="/artikel">
                {t('home.allArticles')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="section">
          <div className="container">
            <SecHead kickerKey="popular" title={t('home.popular')} sub={t('home.popularSub')} to="/artikel" allLabel={t('home.viewAll')} />
            <div className="ranked-list">
              {popular.map((a, i) => (
                <Link key={a.id} className="ranked-item" to={`/artikel/${a.slug}`}>
                  <span className="rank">{i + 1}</span>
                  <div className="ranked-cover">
                    <OptimizedImage src={a.image || coverFor(a, categorySlugOf(a.categoryId))} alt="" widths={[160, 320]} sizes="72px" fallback={autoCover(a, categorySlugOf(a.categoryId))} />
                  </div>
                  <div className="ranked-body">
                    {a.categoryId && (
                      <span className={`pill pill-sm cat-${categorySlugOf(a.categoryId)}`}>
                        {tCategory(categories.find((c) => c.id === a.categoryId))}
                      </span>
                    )}
                    <h3><LTitle article={a} /></h3>
                    <span className="article-meta">
                      {authorNameOf(a) && (
                        <>
                          <span className="author">{authorNameOf(a)}</span>
                          <span className="dot" />
                        </>
                      )}
                      <span>{formatDate(a.createdAt)}</span>
                      <span className="dot" />
                      <span><ReadTime article={a} /></span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}



      {homeSections.map(({ cat, items }) => (
        <section className="section" key={cat.id}>
          <div className="container">
            <SecHead kickerKey="latest" title={tCategory(cat)} sub={t('home.catSub', { name: tCategory(cat) })} to={`/kategorien/${cat.slug}`} allLabel={t('home.viewAll')} />
            <div className="grid-3">
              {items.map((a) => <ArticleCard key={a.id} article={a} autoPreview />)}
            </div>
          </div>
        </section>
      ))}

      {mostRead.length > 0 && (
        <section className="section">
          <div className="container">
            <SecHead kickerKey="mostRead" title={t('home.mostRead')} sub={t('home.mostReadSub')} to="/artikel" allLabel={t('home.viewAll')} />
            <div className="grid-3">
              {mostRead.map((a) => <ArticleCard key={a.id} article={a} autoPreview />)}
            </div>
          </div>
        </section>
      )}

      {topVideos.length > 0 && (
        <section className="section">
          <div className="container">
            <VideoCarousel
              videos={topVideos}
              title={t('home.videoTop')}
              sub={t('home.videoTopSub')}
              to="/videos"
              allLabel={t('home.viewAll')}
              kicker={secKicker('videoTop')}
            />
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="section">
          <div className="container">
            <SecHead kickerKey="gallery" title={t('home.gallery')} sub={t('home.gallerySub')} to="/fotos" allLabel={t('home.viewAll')} />
            <div className="grid-foto">
              {photos.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <SecHead kickerKey="topics" title={t('home.topics')} sub={t('home.topicsSub')} />
          <div className="cat-grid">
            {categories.map((c) => (
              <Link key={c.id} className="cat-card" to={`/kategorien/${c.slug}`}>
                <h3>{tCategory(c)}</h3>
                <span className="count">{tc('unit.article', countArticlesByCategory(c.id))}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {recommended.length > 0 && (
        <section className="section">
          <div className="container">
            <SecHead kickerKey="recommended" title={t('home.recommended')} sub={t('home.recommendedSub')} />
            <div className="grid-3">
              {recommended.map((a) => <ArticleCard key={a.id} article={a} autoPreview />)}
            </div>
          </div>
        </section>
      )}

      <WeatherSection />

      <CurrencySection />

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <SecHead kickerKey="media" title={t('home.media')} sub={t('home.mediaSub')} to="/videos" allLabel={t('home.allMedia')} />
          <div className="cat-grid">
            <Link className="cat-card media-tile" to="/videos">
              <span className="media-tile-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <h3>{t('home.videoTitle')}</h3>
              <span className="count">{tc('unit.video', videos.length)}</span>
            </Link>
            <Link className="cat-card media-tile" to="/fotos">
              <span className="media-tile-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10" r="1.6" />
                  <path d="M3 16.5l5.2-4.6 4.6 3.8 3.8-3.4 4.4 4.7" />
                </svg>
              </span>
              <h3>{t('home.photoTitle')}</h3>
              <span className="count">{tc('unit.photo', photos.length)}</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="mission">
            <div>
              <h2>{t('home.mission')}</h2>
              <p>{t('home.missionText')}</p>
            </div>
            <ul className="mission-list">
              <li>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                {t('home.mission1')}
              </li>
              <li>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                {t('home.mission2')}
              </li>
              <li>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                {t('home.mission3')}
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
