import { useEffect, useState } from 'react'
import { useI18n } from './i18n.jsx'
import { shouldAskServer, getCachedArticleTranslation, sourceHash, translateArticle } from './translate.js'

/**
 * Liefert den Artikel in der aktuellen Seitensprache.
 * Priorität:
 *   1. Handgepflegte Übersetzung (i18n/Seed bzw. manuelle DB-Übersetzung)
 *   2. Gespeicherte automatische Übersetzung (Server-Cache)
 *   3. Neue serverseitige Übersetzung
 *   4. Originalsprache als Fallback
 * Kurdisch (Badini) wird NIE maschinell übersetzt – der Server liefert dort
 * nur manuelle Übersetzungen aus.
 */
export function useArticleL10n(article, options = {}) {
  const withBody = Boolean(options.withBody)
  const { lang, tArticle } = useI18n()
  const [auto, setAuto] = useState(null)

  const stored = tArticle(article)
  const hasStored = Boolean(article && stored !== article)
  const id = article?.id
  const cached = id && !hasStored ? getCachedArticleTranslation(id, lang) : null
  const cacheHit = Boolean(cached && article && cached.h === sourceHash(article) && cached.title)
  // Nur den Server fragen, wenn kein gültiger Cache-Eintrag existiert.
  // Bei withBody=true zählt ein Cache-Eintrag OHNE body nicht als Treffer,
  // sonst bliebe der Artikelkörper in der Originalsprache.
  // WICHTIG: Keine article-Objekt-Referenz in den Effekt-Deps – die wechselte
  // bei jedem Render und erzeugte eine Endlos-Render-Schleife (setAuto →
  // Re-Render → neue Referenz → Effekt → setAuto → …).
  const bodyMissing = withBody && !Boolean(cached && cached.body)
  const ask = Boolean(article && !hasStored && shouldAskServer(article, lang) && (!cacheHit || bodyMissing))

  useEffect(() => {
    if (!ask) {
      setAuto(null)
      return undefined
    }
    let alive = true
    translateArticle(article, lang, { withBody }).then((res) => {
      if (!alive || !res) return
      setAuto({
        title: res.title ?? article.title,
        intro: res.intro ?? article.intro,
        body: res.body ?? article.body,
        kind: res.kind
      })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lang, withBody, ask])

  if (!article) return article
  if (hasStored) return stored
  if (cacheHit) {
    return {
      ...article,
      title: cached.title ?? article.title,
      intro: cached.intro ?? article.intro,
      body: cached.body ?? article.body,
      _trKind: cached.kind
    }
  }
  if (auto) {
    return {
      ...article,
      title: auto.title ?? article.title,
      intro: auto.intro ?? article.intro,
      body: auto.body ?? article.body,
      _trKind: auto.kind
    }
  }
  return article
}
