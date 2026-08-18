// Dynamische Sitemap: Hauptseiten + alle Artikel, Kategorien und Autoren.
import { createClient } from '@supabase/supabase-js'

const SITE = 'https://jivak-tv.vercel.app'
const LANGS = ['ar', 'ku', 'en', 'de']

// Sprachspezifische URL: Hauptpfad bekommt je Sprache eine eigene URL (?lang=…)
function langUrls(loc, freq, prio) {
  return LANGS.map((l) => ({ loc: `${loc}?lang=${l}`, freq, prio }))
}

function hreflangLinks(loc) {
  return LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${loc}?lang=${l}"/>`)
    .join('\n')
    .concat(`\n<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${loc}"/>`)
}

export default async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=600')

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  const urls = [
    { loc: '/', freq: 'daily', prio: '1.0' },
    { loc: '/artikel', freq: 'daily', prio: '0.9' },
    { loc: '/videos', freq: 'daily', prio: '0.8' },
    { loc: '/fotos', freq: 'daily', prio: '0.8' },
    { loc: '/live', freq: 'daily', prio: '0.7' },
    { loc: '/kategorien', freq: 'weekly', prio: '0.7' },
    { loc: '/autoren', freq: 'weekly', prio: '0.6' },
    { loc: '/suche', freq: 'monthly', prio: '0.4' },
    { loc: '/info/ueber-uns', freq: 'yearly', prio: '0.3' },
    { loc: '/info/kontakt', freq: 'yearly', prio: '0.3' },
    { loc: '/info/datenschutz', freq: 'yearly', prio: '0.3' },
    { loc: '/info/impressum', freq: 'yearly', prio: '0.3' }
  ].flatMap((u) => langUrls(u.loc, u.freq, u.prio))

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } })
      const [articles, categories, authors] = await Promise.all([
        supabase.from('articles').select('slug, updated_at').eq('status', 'published'),
        supabase.from('categories').select('slug'),
        supabase.from('authors').select('slug')
      ])
      ;(articles.data || []).forEach((a) => {
        if (a.slug) {
          const base = `/artikel/${a.slug}`
          LANGS.forEach((l) => urls.push({ loc: `${base}?lang=${l}`, freq: 'daily', prio: '0.8' }))
        }
      })
      ;(categories.data || []).forEach((c) => {
        if (c.slug) {
          const base = `/kategorien/${c.slug}`
          LANGS.forEach((l) => urls.push({ loc: `${base}?lang=${l}`, freq: 'weekly', prio: '0.6' }))
        }
      })
      ;(authors.data || []).forEach((a) => {
        if (a.slug) {
          const base = `/autor/${a.slug}`
          LANGS.forEach((l) => urls.push({ loc: `${base}?lang=${l}`, freq: 'weekly', prio: '0.5' }))
        }
      })
    } catch {
      /* Sitemap bleibt bei Fehler auf Hauptseiten */
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (u) =>
      `  <url><loc>${SITE}${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.prio}</priority>\n${hreflangLinks(u.loc)}</url>`
  )
  .join('\n')}
</urlset>`

  res.send(xml)
}
