// Server-Client für die automatische Artikel-Übersetzung (ROJ TV).
// Übersetzt wird serverseitig über /api/translate – der Browser erhält nur
// fertige Texte. Ergebnisse werden zusätzlich in localStorage gecacht, damit
// die Seite bei wiederholten Besuchen sofort in der Zielsprache erscheint.

const CACHE_KEY = 'em.article-translations.v2'
const ALL_LANGS = new Set(['ar', 'ku', 'en', 'de'])
const REQUEST_TIMEOUT = 90000

// AbortSignal.timeout ist in älteren Handy-Browsern nicht verfügbar –
// Fallback, damit die Übersetzungs-Anfrage dort nicht abstürzt.
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

const hasStorage = () => typeof localStorage !== 'undefined'

function safeRead() {
  if (!hasStorage()) return {}
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function safeWrite(map) {
  if (!hasStorage()) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map))
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      /* ignore */
    }
  }
}

export function isArabicScript(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(text || ''))
}

export function detectLang(text) {
  return isArabicScript(text) ? 'ar' : 'en'
}

// Erkennt die Originalsprache eines Artikels genauer (inkl. Kurdisch/Badini).
// Kurdisch (Badini) verwendet eigene Buchstaben (ێ ڕ ۆ ۊ ڤ چ پ ژ گ ڵ ە), die
// im Arabischen nicht vorkommen – damit lassen sich Badini-Titel zuverlässig
// von arabischen unterscheiden, auch ohne die typischen Zeichen ێ/ڕ/ۆ.
export function detectArticleLang(text) {
  const s = String(text || '')
  if (!s.trim()) return 'en'
  if (/[ێڕۆۊڤچپژگڵە]/.test(s)) return 'ku'
  if (isArabicScript(s)) return 'ar'
  if (/[äöüßÄÖÜ]/.test(s)) return 'de'
  // Deutsche Wörter auch ohne Umlaute erkennen (erweiterte Liste)
  if (/\b(der|die|das|den|dem|des|ein|eine|einem|einen|einer|und|ist|sind|war|waren|hat|haben|wird|werden|kann|können|soll|sollen|muss|müssen|nicht|auf|aus|bei|bis|durch|für|gegen|in|mit|nach|ohne|über|unter|von|vor|zu|zum|zur|zwischen|auch|als|noch|wie|oder|aber|sondern|denn|weil|wenn|ob|dass|sich|man|er|sie|es|wir|ihr|ich|du|da|dort|hier|so|sehr|nun|schon|wieder|mehr|alle|alles|kein|keine|diese|dieser|dieses|jene|welcher|welche|nur|gerade|eben|etwa|vielleicht|bestimmt|sicher|wirklich|bereits|immer|nie|oft|manchmal|bald|jetzt|heute|gestern|morgen|gut|schlecht|neu|alt|groß|klein|lang|kurz|hoch|tief|weit|nah|stark|richtig|falsch|wichtig|einfach|möglich|fertig|bereit|frei|offen|politik|nachrichten|nachricht|region|wirtschaft|kultur|sport|bildung|gesundheit|wissenschaft|technik|umwelt|klima|energie|verkehr|justiz|innenpolitik|außenpolitik|gesellschaft|geschichte|religion|tradition|identität|gemeinschaft|familie|kinder|jugend|senioren|frauen|menschen|flüchtlinge|integration|migration|diaspora|heimat)\b/i.test(s)) return 'de'
  return 'en'
}

export function sourceHash(article) {
  let h = 5381
  const s = String(article?.title || '') + '|' + String(article?.intro || '') + '|' + String(article?.body || '')
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

/**
 * Soll für diesen Artikel/Sprache der Server gefragt werden?
 * - Ja für jede Sprache, die nicht der erkannten Ausgangssprache entspricht.
 * - ku (Badini): wird immer angefragt – der Server liefert dort die
 *   Badini-Übersetzung (oder den Originaltext als Fallback).
 */
export function shouldAskServer(article, lang) {
  if (!article || !lang || !article.id) return false
  if (lang === 'ku') return true
  return needsAutoTranslation(article, lang)
}

export function needsAutoTranslation(article, lang) {
  if (!article || !lang || !ALL_LANGS.has(lang)) return false
  const title = String(article.title || '').trim()
  if (!title) return false
  // Ausgangssprache des Artikels erkennen: AR/DE/EN/KU → alle anderen
  // Sprachen werden automatisch vom Server übersetzt (falls vorhanden).
  return detectArticleLang(title) !== lang
}

export function getCachedArticleTranslation(id, lang) {
  if (!id || !lang) return null
  return safeRead()[`${lang}:${id}`] || null
}

export function cacheArticleTranslation(id, lang, entry) {
  const map = safeRead()
  map[`${lang}:${id}`] = entry
  safeWrite(map)
}

// Synchrone Variante für Such- und Filterlogik: gecachte Übersetzung,
// sofern vorhanden und zum aktuellen Quelltext passend, sonst Original.
export function localizedArticleSync(article, lang) {
  if (!article || !lang) return article
  const cached = getCachedArticleTranslation(article.id, lang)
  if (cached && cached.h === sourceHash(article) && cached.title && cached.kind !== 'missing') {
    return {
      ...article,
      title: cached.title,
      intro: cached.intro ?? article.intro,
      body: cached.body ?? article.body
    }
  }
  return article
}

// ---------- Batch-Queue ----------
// Alle Artikel einer Seite werden in EINER /api/translate-Anfrage gebündelt
// (statt 20+ paralleler Requests). So bleibt die Seite auch auf langsamen
// Verbindungen sofort klickbar und die Vercel-Funktionen werden nicht überlastet.

let batchTimer = null
let batchItems = []
const inflight = new Map()

function flushBatch() {
  batchTimer = null
  const items = batchItems
  batchItems = []
  if (items.length === 0) return
  console.log('[translate] flushBatch:', items.length, 'items, langs:', [...new Set(items.map(i => i.lang))])

  // Nach Zielsprache gruppieren -> 1 Request pro Sprache
  const byLang = {}
  items.forEach((it) => {
    if (!byLang[it.lang]) byLang[it.lang] = []
    byLang[it.lang].push(it)
  })

  Object.values(byLang).forEach(async (group) => {
    const lang = group[0].lang
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          articles: group.map((it) => ({
            articleId: it.articleId,
            title: it.title,
            intro: it.intro,
            body: it.body,
            withBody: it.withBody
          }))
        }),
        signal: timeoutSignal(REQUEST_TIMEOUT)
      })
      const json = res.ok ? await res.json() : null
      console.log('[translate] Response for', lang + ':', json?.ok, 'articles:', json?.data ? Object.keys(json.data).length : 0)
      if (!json?.ok || !json.data) throw new Error('batch-failed: ' + JSON.stringify(json))
      group.forEach((it) => {
        const data = json.data[it.articleId]
        if (data && data.title && data.kind !== 'missing') {
          cacheArticleTranslation(it.articleId, lang, {
            h: sourceHash({ title: it.title, intro: it.intro, body: it.body }),
            title: data.title,
            intro: data.intro,
            body: data.body,
            kind: data.kind
          })
        }
        it.resolve(data || null)
      })
    } catch (err) {
      // Übersetzungsfehler: Originaltext bleibt sichtbar, Seite läuft weiter.
      console.error('[translate] ❌ Batch fehlgeschlagen (' + lang + '):', err?.message || err, err)
      group.forEach((it) => it.resolve(null))
    }
  })
}

/**
 * Ruft die Übersetzung vom Server ab (serverseitig, gebündelt + DB-Cache).
 * Liefert { title, intro, body, kind, cached } oder null bei Fehlern.
 */
export function translateArticle(article, lang, opts = {}) {
  if (!article || !lang || !article.id) return Promise.resolve(null)
  const id = article.id
  const h = sourceHash(article)
  const cached = getCachedArticleTranslation(id, lang)
  const bodyOk = !opts.withBody || Boolean(cached?.body)
  if (cached && cached.h === h && cached.title && cached.kind !== 'missing' && bodyOk) {
    return Promise.resolve({
      title: cached.title,
      intro: cached.intro,
      body: cached.body,
      kind: cached.kind || 'auto',
      cached: true
    })
  }

  const key = `${lang}:${id}:${opts.withBody ? 'b' : 'c'}`
  if (inflight.has(key)) return inflight.get(key)

  const promise = new Promise((resolve) => {
    batchItems.push({
      articleId: id,
      lang,
      title: article.title,
      intro: article.intro,
      body: article.body,
      withBody: Boolean(opts.withBody),
      resolve
    })
    if (!batchTimer) batchTimer = setTimeout(flushBatch, 40)
  })
  inflight.set(key, promise)
  promise.finally(() => inflight.delete(key)).catch(() => {})
  return promise
}

// ---------- Live-TV-Vorwärmung ----------
// Übersetzt Kanaltitel + Programmtitel im Hintergrund in ALLE Sprachen und
// füllt damit den Cache (localStorage + DB). Dadurch wechselt die Live-TV-Seite
// die Sprache sofort, ohne Warten und ohne Seiten-Refresh.

export const ALL_LANGS_LIST = ['ar', 'ku', 'en', 'de']

export function warmLiveTvTranslations(live) {
  if (!live) return
  const items = []
  const push = (key, text) => {
    const s = String(text || '').trim()
    if (!s) return
    items.push({ id: key, title: s, intro: '', body: '' })
  }
  push('live:title', live.title)
  ;(Array.isArray(live.programs) ? live.programs : []).forEach((p) => {
    if (p && p.time) push('live:prog:' + p.time, p.title)
  })
  if (items.length === 0) return
  items.forEach((item) => {
    const source = detectArticleLang(item.title)
    ALL_LANGS_LIST.forEach((target) => {
      if (target === source) return
      translateArticle(item, target).catch(() => {})
    })
  })
}
