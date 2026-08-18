// News-Ticker (NRT-Stil): zeigt manuelle Schlagzeilen aus den Einstellungen
// (Admin → Newsticker) und füllt mit den neuesten Artikeln auf.
// Richtung passt sich der Sprache an: Arabisch/Kurdisch (RTL) laufen von
// links nach rechts, Englisch/Deutsch (LTR) von rechts nach links.
import { Link } from 'react-router-dom'
import { getPublishedArticles, getTickerItems, getTickerAuto } from '../lib/store.js'
import { useStoreVersion } from '../lib/useStore.js'
import { useArticleL10n } from '../lib/useArticleL10n.jsx'
import { useI18n } from '../lib/i18n.jsx'

function TickerArticleItem({ article }) {
  const local = useArticleL10n(article)
  if (!article?.slug) return null
  return (
    <Link className="ticker-item" to={`/artikel/${article.slug}`}>
      {local.title}
    </Link>
  )
}

function TickerManualItem({ item }) {
  const { lang } = useI18n()
  const title =
    (lang === 'ar' && item.titleAr) ||
    (lang === 'ku' && item.titleKu) ||
    (lang === 'en' && item.titleEn) ||
    (lang === 'de' && item.titleDe) ||
    item.titleAr || item.titleKu || item.titleEn || item.titleDe
  if (!title) return null
  if (item.linkType === 'article' && item.articleId) {
    const article = getPublishedArticles().find((a) => a.id === item.articleId)
    if (article && article.slug) {
      return (
        <Link className="ticker-item" to={`/artikel/${article.slug}`}>
          {title}
        </Link>
      )
    }
  }
  if (item.linkType === 'url' && item.url) {
    return (
      <a className="ticker-item" href={item.url} target="_blank" rel="noopener noreferrer">
        {title}
      </a>
    )
  }
  return <span className="ticker-item">{title}</span>
}

export default function NewsTicker() {
  useStoreVersion()
  const { t, lang } = useI18n()
  const manual = getTickerItems()
  const { autoArticles, excludeArticleIds } = getTickerAuto()
  const excluded = new Set(excludeArticleIds || [])
  const articles = autoArticles
    ? getPublishedArticles()
        .filter((a) => a.slug && a.title && !excluded.has(a.id))
        .slice(0, Math.max(0, 15 - manual.length))
    : []
  const manualItems = manual.map((item, i) => (
    <TickerManualItem key={item.clientId || 'tk-slot-' + i} item={item} />
  ))
  const articleItems = articles.map((a) => <TickerArticleItem key={a.id} article={a} />)
  const items = [...manualItems, ...articleItems].filter(Boolean)
  if (items.length === 0) return null

  const rtl = lang === 'ar' || lang === 'ku'

  return (
    <div className={`news-ticker ${rtl ? 'is-rtl' : 'is-ltr'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <span className="ticker-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="6" />
        </svg>
        {t('ticker.label')}
      </span>
      <div className="ticker-viewport" aria-label={t('ticker.label')}>
        <div className="ticker-track">
          <div className="ticker-group">{items}</div>
          <div className="ticker-group" aria-hidden="true">{items}</div>
        </div>
      </div>
    </div>
  )
}
