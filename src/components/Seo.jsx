import { useEffect } from 'react'
import { useI18n, LANGUAGES } from '../lib/i18n.jsx'
import { absoluteImageUrl } from '../lib/og.js'

const SITE = 'https://jivak-tv.vercel.app'

function upsertMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * SEO-Helfer: setzt Titel, Meta- und OpenGraph-Tags, Canonical-Link,
 * hreflang-Alternates für alle Sprachen und optionale strukturierte Daten
 * (JSON-LD) je Seite. Jede Sprache erhält eine eigene URL (?lang=…).
 */
export default function Seo({ title, description, path = '/', image = '/logo.png', type = 'website', jsonLd }) {
  const { lang } = useI18n()

  useEffect(() => {
    const fullTitle = title ? `${title} – Jivak TV` : 'Jivak TV'
    const ogImage = absoluteImageUrl(image)
    const langSuffix = lang ? `?lang=${lang}` : ''
    const pageUrl = SITE + path

    document.title = fullTitle
    upsertMeta('name', 'description', description || 'Jivak TV – Nachrichten, Videos, Fotos und Live-TV aus der Jivak-Gemeinschaft.')
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description || '')
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:url', pageUrl + langSuffix)
    if (ogImage) {
      upsertMeta('property', 'og:image', ogImage)
      upsertMeta('name', 'twitter:image', ogImage)
    }
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description || '')
    upsertMeta('name', 'twitter:url', pageUrl + langSuffix)

    let canonical = document.head.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', pageUrl + langSuffix)

    // hreflang-Alternates für alle 4 Sprachen + x-default
    document.head.querySelectorAll('link[data-seo-hreflang]').forEach((n) => n.remove())
    LANGUAGES.forEach((l) => {
      const link = document.createElement('link')
      link.setAttribute('rel', 'alternate')
      link.setAttribute('hreflang', l.code)
      link.setAttribute('data-seo-hreflang', '1')
      link.setAttribute('href', pageUrl + `?lang=${l.code}`)
      document.head.appendChild(link)
    })
    const xDefault = document.createElement('link')
    xDefault.setAttribute('rel', 'alternate')
    xDefault.setAttribute('hreflang', 'x-default')
    xDefault.setAttribute('data-seo-hreflang', '1')
    xDefault.setAttribute('href', pageUrl)
    document.head.appendChild(xDefault)

    document.head.querySelectorAll('script[data-seo-jsonld]').forEach((n) => n.remove())
    if (jsonLd) {
      const finalLd = { ...jsonLd }
      if (!finalLd.inLanguage) finalLd.inLanguage = lang
      if (!finalLd.url) finalLd.url = pageUrl + langSuffix
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute('data-seo-jsonld', '1')
      script.textContent = JSON.stringify(finalLd)
      document.head.appendChild(script)
    }
    // jsonLd wird als Inhalt verglichen, nicht als Objekt-Referenz:
    // Objekt-Literale pro Render hätten den Effekt bei jedem Render neu
    // ausgelöst (unnötige DOM-Arbeit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, image, type, lang, jsonLd ? JSON.stringify(jsonLd) : ''])

  return null
}
