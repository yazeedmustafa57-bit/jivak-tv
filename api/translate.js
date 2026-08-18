// Server-Übersetzungs-API für Jivak TV.
// Übersetzt Artikel serverseitig (OpenAI/OpenRouter/MyMemory), speichert das
// Ergebnis in der Tabelle article_translations und liefert gespeicherte
// Übersetzungen aus dem Cache. Priorität:
//   1. manuelle Übersetzung (kind=manual)
//   2. gespeicherte automatische Übersetzung (kind=auto, wenn Quelltext unverändert)
//   3. neue automatische Übersetzung
//   4. Originalsprache als Fallback
// Übersetzungen laufen serverseitig über den Badini-Übersetzer
// (BADINI_PROXY_URL: Google für ar/en/de, Badini für ku), sonst über
// OpenAI/OpenRouter/MyMemory. Kurdisch (Badini) braucht zwingend den
// Badini-Übersetzer – ohne ihn werden nur manuelle Übersetzungen ausgeliefert.
// Unterstützt Einzel- und Batch-Anfragen (POST { articles: [...] }), damit die
// Startseite mit einer einzigen Anfrage alle sichtbaren Artikel übersetzen kann.
import { createClient } from '@supabase/supabase-js'
import { translateArticleText } from '../lib/translate-provider.js'

export const config = { maxDuration: 60 }

const AUTO_LANGS = new Set(['ar', 'en', 'de'])
const ALL_LANGS = new Set(['ar', 'ku', 'en', 'de'])
const BADINI_READY = Boolean(process.env.BADINI_PROXY_URL)
const MAX_TITLE = 500
const MAX_INTRO = 4000
const MAX_BODY = 60000
const MAX_BATCH = 50
const BATCH_CONCURRENCY = 4

// Einfaches In-Memory-Rate-Limit (Best Effort in Serverless): max. 40
// Übersetzungs-Requests pro Minute und IP – verhindert Quota-/Kosten-Missbrauch.
const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 40
const rateHits = new Map()

function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const rec = rateHits.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS }
  if (now > rec.reset) { rec.count = 0; rec.reset = now + RATE_WINDOW_MS }
  rec.count += 1
  rateHits.set(ip, rec)
  if (rateHits.size > 2000) {
    for (const [k, v] of rateHits) if (v.reset < now) rateHits.delete(k)
  }
  return rec.count > RATE_MAX
}

/** Nur echte, veröffentlichte Artikel dürfen in article_translations gespeichert werden. */
async function resolveArticleSource(supabase, item) {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, title, intro, body, status')
      .eq('id', item.articleId)
      .maybeSingle()
    if (
      !error &&
      data &&
      data.status === 'published' &&
      String(data.title || '').trim() === String(item.title || '').trim()
    ) {
      return {
        title: data.title || '',
        intro: data.intro || '',
        rawBody: data.body || '',
        allowCache: true
      }
    }
  } catch {
    /* Fallback: Client-Text übersetzen, aber nicht in der DB speichern */
  }
  return { allowCache: false }
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

function isArabicScript(text) {
  return ARABIC_RE.test(String(text || ''))
}

function detectSourceLang(title) {
  const s = String(title || '')
  if (/[ێڕۆۊڤچپژگڵە]/.test(s)) return 'ku'
  if (isArabicScript(s)) return 'ar'
  if (/[äöüßÄÖÜ]/.test(s)) return 'de'
  // Deutsche Wörter erkennen auch ohne Umlaute
  if (/\b(der|die|das|und|ist|von|ein|eine|nicht|auf|mit|sich|auch|als|noch|nach|wie|aber|oder|bei|über|unter|vor|zwischen|gegen|wegen|durch|für|haben|werden|können|sollen|müssen|wird|hat|ist|sind|war|haben|einige|mehrere|fordert|forderte|Stellungnahme|Irak|Jesiden|Hassreden|Koalition|Gemeinschaft|Vertreter|fordert|forderte|erklärte|sagte|teilte|bestätigte|wurde|hatte|waren|worden|seit|bei|nach|vor|zwischen|über|unter|gegen)\b/i.test(s)) return 'de'
  return 'en'
}

function sourceHash(title, intro, body) {
  let h = 5381
  const s = String(title || '') + '|' + String(intro || '') + '|' + String(body || '')
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

function makeClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// Kleine Promise-Pool-Helferin: maximal `limit` Aufgaben parallel.
async function pMap(items, fn, limit) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Übersetzt genau einen Artikel (Einzel- oder Batch-Element).
 * Liefert { ok: true, data } oder { ok: false, code, message }.
 */
async function translateOne(supabase, { articleId, lang, title, intro, rawBody, withBody, allowCache = true }) {
  const sourceLang = detectSourceLang(title)
  const hash = sourceHash(title, intro, rawBody)

  // 1) Gespeicherte Übersetzung suchen (manuell oder automatisch)
  let row = null
  try {
    const { data } = await supabase
      .from('article_translations')
      .select('*')
      .eq('article_id', articleId)
      .eq('lang', lang)
      .maybeSingle()
    row = data || null
  } catch (err) {
    return { ok: false, code: 'db-error', message: err.message }
  }

  // Manuelle Übersetzung hat Vorrang – solange der Quelltext unverändert ist.
  // (source_hash fehlt bei alten Zeilen → als gültig behandeln.)
  if (row && row.kind === 'manual' && (!row.source_hash || row.source_hash === hash)) {
    return {
      ok: true,
      data: {
        title: row.title || title,
        intro: row.intro || intro,
        body: withBody ? row.body || rawBody : null,
        kind: 'manual',
        cached: true,
        sourceLang: row.source_lang || sourceLang
      }
    }
  }

  // Automatische Übersetzung wiederverwenden, solange der Quelltext unverändert ist.
  // Bei withBody muss auch der Fließtext bereits übersetzt vorliegen.
  if (row && row.kind === 'auto' && row.source_hash === hash && row.title && (!withBody || row.body)) {
    return {
      ok: true,
      data: {
        title: row.title,
        intro: row.intro || '',
        body: withBody ? row.body || '' : null,
        kind: 'auto',
        cached: true,
        sourceLang: row.source_lang || sourceLang
      }
    }
  }

  // Gleiche Sprache → Original (kein Übersetzen nötig).
  if (sourceLang === lang) {
    return {
      ok: true,
      data: { title, intro, body: withBody ? rawBody : null, kind: 'missing', cached: true, sourceLang }
    }
  }

  // Der Badini-Übersetzer (BADINI_PROXY_URL) kann alle 4 Sprachen übersetzen
  // (Google für ar/en/de, Badini für ku). Ohne ihn sind nur ar/en/de möglich
  // und ku ausschließlich aus manuellen Übersetzungen.
  const canTranslateTarget = BADINI_READY ? ALL_LANGS.has(lang) : AUTO_LANGS.has(lang)
  const canTranslateSource = BADINI_READY || sourceLang !== 'ku'
  if (!canTranslateTarget || !canTranslateSource) {
    return {
      ok: true,
      data: { title, intro, body: withBody ? rawBody : null, kind: 'missing', cached: true, sourceLang }
    }
  }

  // 2) Neu übersetzen (serverseitig)
  let result = null
  try {
    result = await translateArticleText({ title, intro, body: rawBody || null }, sourceLang, lang)
  } catch (err) {
    console.error('translate failed:', err.message)
  }

  if (!result) {
    // Fallback: veraltete Auto-Übersetzung, sonst Original.
    if (row && row.kind === 'auto') {
      return {
        ok: true,
        data: {
          title: row.title || title,
          intro: row.intro || intro,
          body: withBody ? row.body || rawBody : null,
          kind: 'auto',
          cached: true,
          sourceLang: row.source_lang || sourceLang
        }
      }
    }
    return { ok: true, data: { title, intro, body: withBody ? rawBody : null, kind: 'missing', cached: false, sourceLang } }
  }

  const finalTitle = result.title || title
  const finalIntro = result.intro || ''
  const finalBody = withBody ? result.body || '' : (row?.body || '')

  // 3) Ergebnis in der Datenbank zwischenspeichern (kind=auto) –
  // nur wenn der Artikel als echter, veröffentlichter Artikel verifiziert wurde.
  if (allowCache) {
    const stored = {
      article_id: articleId,
      lang,
      source_lang: sourceLang,
      source_hash: hash,
      title: finalTitle,
      intro: finalIntro,
      body: finalBody,
      kind: 'auto',
      error: null,
      updated_at: new Date().toISOString()
    }
    try {
      await supabase.from('article_translations').upsert(stored, { onConflict: 'article_id,lang' })
    } catch (err) {
      console.error('translate store failed:', err.message)
    }
  }

  return {
    ok: true,
    data: {
      title: finalTitle,
      intro: finalIntro,
      body: withBody ? finalBody : null,
      kind: 'auto',
      cached: false,
      sourceLang
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, code: 'method' })
  if (rateLimited(req)) return res.status(429).json({ ok: false, code: 'rate-limited' })

  const supabase = makeClient()
  if (!supabase) return res.status(500).json({ ok: false, code: 'not-configured' })

  const body = req.body || {}
  const lang = String(body.lang || '').slice(0, 2)
  if (!ALL_LANGS.has(lang)) return res.status(400).json({ ok: false, code: 'invalid-request' })

  // Batch-Modus: { lang, articles: [{ articleId, title, intro, body, withBody }] }
  if (Array.isArray(body.articles)) {
    const items = body.articles.slice(0, MAX_BATCH).map((a) => ({
      articleId: String(a?.articleId || '').slice(0, 120),
      title: String(a?.title || '').slice(0, MAX_TITLE).trim(),
      intro: String(a?.intro || '').slice(0, MAX_INTRO).trim(),
      rawBody: String(a?.body || '').slice(0, MAX_BODY),
      withBody: Boolean(a?.withBody)
    }))
    if (items.length === 0) return res.status(400).json({ ok: false, code: 'invalid-request' })

    const out = {}
    await pMap(items, async (item) => {
      if (!item.articleId || !item.title) {
        out[item.articleId] = {
          title: item.title,
          intro: item.intro,
          body: item.withBody ? item.rawBody : null,
          kind: 'missing',
          cached: true,
          sourceLang: detectSourceLang(item.title)
        }
        return
      }
      const resolved = await resolveArticleSource(supabase, item)
      const result = await translateOne(supabase, { ...item, lang, ...resolved })
      out[item.articleId] = result.ok ? result.data : { error: result.code, kind: 'missing' }
    }, BATCH_CONCURRENCY)

    return res.json({ ok: true, data: out })
  }

  // Einzel-Modus (weiterhin unterstützt, z. B. Artikelseite)
  const articleId = String(body.articleId || '').slice(0, 120)
  const title = String(body.title || '').slice(0, MAX_TITLE).trim()
  if (!articleId || !title) return res.status(400).json({ ok: false, code: 'invalid-request' })

  const resolved = await resolveArticleSource(supabase, { articleId, title })
  const result = await translateOne(supabase, {
    articleId,
    lang,
    title,
    intro: String(body.intro || '').slice(0, MAX_INTRO).trim(),
    rawBody: String(body.body || '').slice(0, MAX_BODY),
    withBody: Boolean(body.withBody),
    ...resolved
  })
  if (!result.ok) return res.status(500).json({ ok: false, code: result.code, message: result.message })
  return res.json({ ok: true, data: result.data })
}
