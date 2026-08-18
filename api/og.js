// Social-Preview (OpenGraph) für ROJ TV.
// Liefert eine minimalistische HTML-Seite mit den richtigen Meta-Tags, damit
// WhatsApp, Facebook, Telegram, X usw. beim Teilen eines Artikels Titel,
// Beschreibung und das echte Beitragsbild anzeigen – nicht das Logo.
// Wird über vercel.json nur für Social-Crawler-User-Agents ausgeliefert.
import { createClient } from '@supabase/supabase-js'
import { parseYouTubeId } from '../src/lib/youtube.js'

export const config = { maxDuration: 30 }

const SITE = 'https://jivak-tv.vercel.app'

function makeClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function absoluteImageUrl(image) {
  if (typeof image !== 'string' || !image.trim()) return null
  if (/^https?:\/\//i.test(image)) return image
  if (/^data:/i.test(image)) return null
  if (image.startsWith('/')) return SITE + image
  return null
}

function youtubeThumbUrl(url) {
  const id = parseYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

function resolveOgImage(article = {}) {
  const absolute = absoluteImageUrl(article.image)
  if (absolute) return absolute
  if (article.media_type === 'video' || article.mediaType === 'video') {
    const mediaUrl = article.media_url || article.mediaUrl
    const yt = youtubeThumbUrl(mediaUrl)
    if (yt) return yt
  }
  return `${SITE}/logo.png`
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function ogHtml({ title, description, image, url, type, lang }) {
  const fullTitle = title ? `${title} – ROJ TV` : 'ROJ TV'
  const safeTitle = esc(fullTitle)
  const safeDesc = esc(description || '')
  const safeImage = esc(image || `${SITE}/logo.png`)
  const safeUrl = esc(url || SITE)
  return `<!doctype html>
<html lang="${esc(lang || 'ar')}" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <meta property="og:site_name" content="ROJ TV" />
    <meta property="og:type" content="${type === 'article' ? 'article' : 'website'}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />
    <meta property="og:locale" content="${esc(lang || 'ar')}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />
    <link rel="canonical" href="${safeUrl}" />
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
  </body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end()
  const path = typeof req.query.path === 'string' ? req.query.path : '/'
  const meta = {
    title: '',
    description: '',
    image: `${SITE}/logo.png`,
    url: SITE + path,
    type: 'website',
    lang: 'ar'
  }

  const articleMatch = path.match(/^\/artikel\/(.+)/)
  if (articleMatch) {
    try {
      const slug = decodeURIComponent(articleMatch[1])
      const supabase = makeClient()
      if (supabase) {
        const { data, error } = await supabase
          .from('articles')
          .select('title, intro, image, media_type, media_url, created_at')
          .eq('slug', slug)
          .eq('status', 'published')
          .maybeSingle()
        if (!error && data) {
          meta.title = data.title || ''
          meta.description = String(data.intro || '').slice(0, 200)
          meta.image = resolveOgImage(data)
          meta.type = 'article'
        }
      }
    } catch {
      /* ohne Artikel-Fund: generische Meta-Tags */
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.setHeader('Access-Control-Allow-Origin', '*')
  const body = ogHtml(meta)
  if (req.method === 'HEAD') return res.status(200).end()
  return res.status(200).send(body)
}
