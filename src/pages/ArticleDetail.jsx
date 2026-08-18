import { useEffect, useRef, useState } from 'react'
import OptimizedImage from '../components/OptimizedImage.jsx'
import { Icon } from '../components/ui.jsx'

import { Link, useParams } from 'react-router-dom'
import ArticleCard from '../components/ArticleCard.jsx'
import { renderBody, headingId } from '../lib/markdown-lite.jsx'
import {
  getArticleBySlug,
  getPublishedArticles,
  getCategoryById,
  getAuthorById,
  getHeadings,
  getPrevNextArticle,
  readingMinutes,
  recordView,
  isCloudReady
} from '../lib/store.js'
import { coverFor, youtubeThumb, autoCover } from '../lib/cover.js'
import { resolveOgImage } from '../lib/og.js'
import { useI18n } from '../lib/i18n.jsx'
import { useArticleL10n } from '../lib/useArticleL10n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import Seo from '../components/Seo.jsx'
import VideoPlayer from '../components/VideoPlayer.jsx'
import Lightbox from '../components/Lightbox.jsx'

function ShareButtons({ title }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const enc = encodeURIComponent
  const shareLinks = [
    { name: 'Facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { name: 'X', label: 'X', href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}` },
    { name: 'WhatsApp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${title} ${url}`)}` },
    { name: 'Telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}` }
  ]

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* Clipboard nicht verfügbar */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div className="share-row">
      <span className="share-label">{t('detail.share')}</span>
      <div className="share-buttons">
        {shareLinks.map((s) => (
          <a
            key={s.name}
            className="share-btn"
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
          >
            {s.name === 'Facebook' && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            )}
            {s.name === 'X' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.5 3h3l-6.6 7.5L21.5 21h-6l-4.7-6.1L5.4 21h-3l7-8L2.5 3h6.1l4.3 5.6L17.5 3zm-1 16h1.7L7.6 4.7H5.8L16.5 19z" />
              </svg>
            )}
            {s.name === 'WhatsApp' && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
            )}
            {s.name === 'Telegram' && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            )}
          </a>
        ))}
        <button className="share-btn share-copy" type="button" onClick={onCopy} aria-label={t('detail.share')} title={t('detail.share')}>
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
          )}
        </button>
      </div>
      {copied && <span className="share-copied">{t('detail.copied')}</span>}
    </div>
  )
}

function NavTitle({ article }) {
  const local = useArticleL10n(article)
  return local?.title || ''
}

export default function ArticleDetail() {
  useStoreVersion()
  const { t, tc, tCategory, tAuthor, formatDate, lang } = useI18n()
  const { slug } = useParams()
  const article = getArticleBySlug(slug)
  const local = useArticleL10n(article, { withBody: true })
  const category = article ? getCategoryById(article.categoryId) : null
  const mediaType = article?.mediaType || 'article'
  const recorded = useRef(false)

  useEffect(() => {
    if (article && !recorded.current) {
      recordView(article.id)
      recorded.current = true
    }
  }, [article])

  if (!article) {
    if (!isCloudReady()) {
      return (
        <div className="container" style={{ padding: '120px 24px', textAlign: 'center' }}>
          <div className="skeleton-line" style={{ width: '60%', height: 28, margin: '0 auto 16px' }} />
          <div className="skeleton-line" style={{ width: '40%', height: 18, margin: '0 auto' }} />
          <p className="lead" style={{ color: 'var(--ink-soft)' }}>{t('detail.loading')}</p>
        </div>
      )
    }
    return (
      <div className="container" style={{ padding: '120px 24px', textAlign: 'center' }}>
        <h1>{t('detail.notFound')}</h1>
        <p className="lead" style={{ color: 'var(--ink-soft)' }}>{t('detail.notFoundText')}</p>
        <Link className="btn btn-primary" to="/artikel">{t('detail.back')}</Link>
      </div>
    )
  }

  const related = (() => {
    const all = getPublishedArticles().filter((a) => a.id !== article.id)
    const sameCategory = all.filter((a) => a.categoryId === article.categoryId)
    return (sameCategory.length > 0 ? sameCategory : all).slice(0, 3)
  })()

  const coverClass = category ? `cover cat-${category.slug}` : 'cover'
  const headings = getHeadings(local.body)
  const { prev, next } = getPrevNextArticle(article.slug)
  const author = article.authorId ? getAuthorById(article.authorId) : null
  const gallery = mediaType === 'photo' && Array.isArray(article.gallery) ? article.gallery : []
  const ogImage = resolveOgImage(article)
  const tHeadings = headings.map((h, i) => ({ id: headingId(h), text: h, key: `${h}-${i}` }))

  return (
    <div className="article-page">
      <Seo
        title={local.title}
        description={(local.intro || '').slice(0, 200)}
        path={`/artikel/${article.slug}`}
        image={ogImage}
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: local.title || article.title || 'Jivak TV',
          description: (local.intro || article.intro || '').slice(0, 200),
          image: ogImage || undefined,
          datePublished: new Date(article.createdAt || Date.now()).toISOString(),
          dateModified: new Date(article.updatedAt || article.createdAt || Date.now()).toISOString(),
          inLanguage: lang,
          author: { '@type': 'Organization', name: local.author || 'Jivak TV' },
          publisher: { '@type': 'Organization', name: 'Jivak TV', url: 'https://jivak-tv.vercel.app', logo: { '@type': 'ImageObject', url: 'https://jivak-tv.vercel.app/logo.png' } },
          mainEntityOfPage: `https://jivak-tv.vercel.app/artikel/${article.slug}`,
          articleSection: category ? tCategory(category) : undefined
        }}
      />
      <div className="container">
        <section className="article-hero">
          <Link className="back-link" to="/artikel"><Icon name="arrow" size={15} />{t('detail.back')}</Link>
          {category && <span className={`pill cat-${category.slug}`}>{tCategory(category)}</span>}
          <h1>{local.title}</h1>
          <p className="lead">{local.intro}</p>
          <div className="byline">
            {(author || local.author) && (
              <span className="byline-author">
                {author && (author.image ? (
                  <OptimizedImage className="byline-avatar" src={author.image} alt="" widths={[96, 160]} sizes="36px" />
                ) : (
                  <span className="byline-avatar">{tAuthor(author).name.charAt(0)}</span>
                ))}
                {author ? (
                  <Link to={`/autor/${author.slug}`}>{t('detail.author', { name: tAuthor(author).name })}</Link>
                ) : (
                  <span>{t('detail.author', { name: local.author })}</span>
                )}
              </span>
            )}
            <span className="byline-meta">
              <span>{formatDate(article.createdAt)}</span>
              {article.updatedAt !== article.createdAt && (
                <>
                  <span className="dot" />
                  <span>{t('detail.updated', { date: formatDate(article.updatedAt) })}</span>
                </>
              )}
            </span>
            <span className="byline-read">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {tc('unit.minutes', readingMinutes(local.body))}
            </span>
          </div>
          <ShareButtons title={local.title} />
        </section>
        {mediaType === 'video' ? (
          <div className="video-stage">
            <VideoPlayer url={article.mediaUrl} poster={article.image || youtubeThumb(article.mediaUrl)} title={local.title} />
          </div>
        ) : (
          <>
            <div className={`article-cover ${mediaType === 'photo' ? 'photo-cover' : ''}`}>
              <div className={coverClass}>
                <OptimizedImage
                  src={article.image || coverFor(article, category?.slug || '')}
                  alt=""
                  widths={[640, 960, 1600, 1920]}
                  sizes="100vw"
                  fallback={autoCover(article, category?.slug || '')}
                />
              </div>
            </div>
            {(local.imageCredit || article.imageCredit) && (
              <p className="photo-credit">{local.imageCredit || article.imageCredit}</p>
            )}
          </>
        )}
        {gallery.length > 0 && (
          <div className="article-gallery">
            <Lightbox images={gallery} title={local.title} />
          </div>
        )}

        {tHeadings.length >= 2 && (
          <nav className="toc" aria-label={t('detail.toc')}>
            <strong className="toc-title">{t('detail.toc')}</strong>
            <ul>
              {tHeadings.map((h) => (
                <li key={h.key}>
                  <a
                    href={`#${h.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="prose">
          {renderBody(local.body, { withIds: tHeadings.length >= 2 })}
        </div>

        {(prev || next) && (
          <nav className="prev-next" aria-label="navigation">
            {prev ? (
              <Link className="prev-next-item" to={`/artikel/${prev.slug}`}>
                <small>{t('detail.prev')}</small>
                <strong><NavTitle article={prev} /></strong>
              </Link>
            ) : <span className="prev-next-item empty" />}
            {next ? (
              <Link className="prev-next-item next" to={`/artikel/${next.slug}`}>
                <small>{t('detail.next')}</small>
                <strong><NavTitle article={next} /></strong>
              </Link>
            ) : <span className="prev-next-item empty" />}
          </nav>
        )}
      </div>

      {related.length > 0 && (
        <div className="container">
          <section className="related">
            <div className="section-head">
              <div>
                <h2>{t('detail.related')}</h2>
                <p>{category ? t('detail.relatedSub', { cat: tCategory(category) }) : t('detail.relatedSubFallback')}</p>
              </div>
            </div>
            <div className="grid-3">
              {related.map((a) => <ArticleCard key={a.id} article={a} />)}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
