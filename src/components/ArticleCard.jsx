import { useState } from 'react'
import { Link } from 'react-router-dom'
import OptimizedImage from './OptimizedImage.jsx'
import VideoPreview from './VideoPreview.jsx'
import PlayIcon from './PlayIcon.jsx'
import { isDirectMediaUrl, isHlsUrl, isYouTubeLink } from '../lib/youtube.js'

import { getCategoryById, getAuthorById, readingMinutes } from '../lib/store.js'
import { coverFor, autoCover } from '../lib/cover.js'
import { useI18n } from '../lib/i18n.jsx'
import { useArticleL10n } from '../lib/useArticleL10n.jsx'

export default function ArticleCard({ article, autoPreview = false }) {
  const { t, tc, tCategory, tAuthor, formatDate, formatViews } = useI18n()
  const local = useArticleL10n(article)
  const category = getCategoryById(article.categoryId)
  const author = article.authorId ? getAuthorById(article.authorId) : null
  const coverClass = category ? `cover cat-${category.slug}` : 'cover'
  const mediaType = article.mediaType || 'article'
  const views = article.views || 0
  const canPreview = autoPreview && mediaType === 'video' && Boolean(article.mediaUrl) && (isDirectMediaUrl(article.mediaUrl) || isHlsUrl(article.mediaUrl) || isYouTubeLink(article.mediaUrl))
  const [previewPlaying, setPreviewPlaying] = useState(false)
  return (
    <Link className="article-card" to={`/artikel/${article.slug}`}>
      <div className={coverClass}>
        {canPreview ? (
          <VideoPreview
            url={article.mediaUrl}
            poster={article.image || coverFor(article, category?.slug || '')}
            onPlayingChange={setPreviewPlaying}
          />
        ) : (
          <OptimizedImage
            src={article.image || coverFor(article, category?.slug || '')}
            alt=""
            widths={[480, 800, 1200]}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            fallback={autoCover(article, category?.slug || '')}
          />
        )}
        {mediaType === 'video' ? (
          <PlayIcon className={previewPlaying ? 'is-playing' : ''} />
        ) : mediaType !== 'article' ? (
          <span className="media-badge media-photo">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <rect x="1.5" y="2.5" width="9" height="7" rx="1" />
              <circle cx="4.2" cy="5" r="0.9" />
              <path d="M1.5 8.5l2.6-2.4 2.4 2 2-1.8 2 2.2" />
            </svg>
            {t('media.photo')}
          </span>
        ) : null}
      </div>
      <div className="article-card-body">
        {category && <span className={`pill cat-${category.slug}`}>{tCategory(category)}</span>}
        <h3>{local.title}</h3>
        <p className="intro">{local.intro}</p>
        <div className="article-meta">
          <span className="author">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
            </svg>
            {author ? tAuthor(author).name : (local.author || '')}
          </span>
          <span className="dot" />
          <span>{formatDate(article.createdAt)}</span>
          <span className="dot" />
          <span>{tc('unit.minutes', readingMinutes(local.body))}</span>
          {views > 0 && (
            <>
              <span className="dot" />
              <span className="views">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {formatViews(views)}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
