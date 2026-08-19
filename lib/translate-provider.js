// Serverseitiger Übersetzungs-Provider für Jivak TV.
// Reihenfolge (je nach konfigurierten Keys):
//   1. Badini-Übersetzer (BADINI_PROXY_URL) – für ALLE Sprachen
//      (Google-Übersetzung für ar/en/de + natürliches Badini für ku)
//   2. OpenAI (OPENAI_API_KEY)
//   3. OpenRouter (OPENROUTER_API_KEY, Modell via TRANSLATION_MODEL)
//   4. MyMemory (kostenlos, ohne Key) als eingebauter Fallback
// Diese Datei läuft NUR im Server (Vercel Serverless) – nie im Browser.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'

// Limits des Badini-Proxys (translator-site-five):
//   - Google-Modus (ar/en/de): sicher bis ~2500 Zeichen/Request
//   - Badini-Modus (ku, Provider "Azadir"): kappt lange Einzelsätze
//     (~>300 Zeichen), liefert bei >~500 Zeichen pro Request nur den ersten
//     Abschnitt und manchmal leer. Deshalb: Komma-Splitting in kurze Zeilen,
//     kleine Requests (~480 Zeichen), begrenzte Parallelität und Retry.
const BADINI_GOOGLE_MAX_CHARS = 1800
const BADINI_KU_LINE_MAX = 200
const BADINI_KU_REQUEST_MAX = 350
const BADINI_KU_CONCURRENCY = 3
// Öffentlicher API-Key des Badini-Übersetzers (steckt im öffentlichen
// Frontend-Bundle von translator-site-five) – überschreibbar via Env.
const BADINI_PROXY_KEY_DEFAULT = ''

const LANG_NAMES = {
  ar: 'Arabic',
  en: 'English',
  de: 'German',
  ku: 'Kurdish (Kurmanji/Badini)'
}

export function langName(code) {
  return LANG_NAMES[code] || code
}

function jsonFromText(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const obj = JSON.parse(cleaned)
    return obj
  } catch {
    // JSON-Kommentare/Zeilenumbrüche tolerieren
    try {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) return JSON.parse(match[0])
    } catch {
      /* fall through */
    }
  }
  return null
}

async function chatTranslate({ url, headers, model, text, from, to }) {
  const system =
    'You are a professional news translator for the international media platform "Jivak TV" ' +
    '(news about current events: politics, culture, sports, economy, health, education). ' +
    'Translate faithfully but naturally, not word for word. Keep the meaning, tone and factual accuracy. ' +
    'Keep Markdown structure (headings, lists, quotes, paragraphs). ' +
    'Keep proper names of people and places in their common form for the target language. ' +
    'Return ONLY valid JSON with exactly these keys: title, intro, body.'

  const user =
    `Source language: ${langName(from)}\nTarget language: ${langName(to)}\n\n` +
    `TITLE:\n${text.title}\n\nINTRO:\n${text.intro || ''}\n\nBODY:\n${text.body || ''}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) throw new Error(`provider-http-${res.status}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('provider-empty')
  const parsed = jsonFromText(content)
  if (!parsed || (!parsed.title && !parsed.intro && !parsed.body)) throw new Error('provider-bad-json')
  return {
    title: String(parsed.title || '').trim(),
    intro: String(parsed.intro || '').trim(),
    body: String(parsed.body || '').trim()
  }
}

async function translateWithOpenAI(text, from, to) {
  return chatTranslate({
    url: OPENAI_URL,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    model: process.env.TRANSLATION_MODEL || 'gpt-4o-mini',
    text,
    from,
    to
  })
}

async function translateWithOpenRouter(text, from, to) {
  return chatTranslate({
    url: OPENROUTER_URL,
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    model: process.env.TRANSLATION_MODEL || 'openai/gpt-4o-mini',
    text,
    from,
    to
  })
}

// MyMemory: ein Text pro Request, max. ~4800 Zeichen.
async function myMemoryOne(text, from, to) {
  const q = encodeURIComponent(text)
  const res = await fetch(`${MYMEMORY_URL}?q=${q}&langpair=${from}|${to}`, {
    signal: AbortSignal.timeout(12000)
  })
  if (!res.ok) throw new Error(`mymemory-http-${res.status}`)
  const data = await res.json()
  if (Number(data.responseStatus) !== 200) {
    throw new Error('mymemory-status-' + data.responseStatus)
  }
  const translated = String(data?.responseData?.translatedText || '').trim()
  const details = String(data?.responseDetails || '').toUpperCase()
  if (!translated || details.includes('QUERY LENGTH LIMIT') || details.includes('DAILY LIMIT')) {
    throw new Error('mymemory-quota')
  }
  return translated
}

function chunkText(text, maxLen) {
  if (!text) return []
  if (text.length <= maxLen) return [text]
  const chunks = []
  let current = ''
  const flush = () => {
    if (current) chunks.push(current)
    current = ''
  }
  for (const para of text.split(/\n\n+/)) {
    if (para.length > maxLen) {
      // Einzelner Absatz länger als maxLen → hart bei maxLen schneiden
      flush()
      for (let i = 0; i < para.length; i += maxLen) chunks.push(para.slice(i, i + maxLen))
      continue
    }
    if (current && (current + '\n\n' + para).length > maxLen) flush()
    current = current ? current + '\n\n' + para : para
  }
  flush()
  return chunks
}

async function translateWithMyMemory(text, from, to) {
  const chunk = (value, maxLen) => {
    const parts = chunkText(value, maxLen)
    return Promise.all(parts.map((part) => myMemoryOne(part, from, to)))
  }
  const [titleParts, introParts, bodyParts] = await Promise.all([
    chunk(text.title || '', 4800),
    chunk(text.intro || '', 4800),
    text.body ? chunk(text.body, 4800) : Promise.resolve([])
  ])
  return {
    title: titleParts.join(' '),
    intro: introParts.join('\n\n'),
    body: bodyParts.join('\n\n')
  }
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

// ---------- Badini-Übersetzer (eigener Dienst / translator-site-five) ----------
// Liefert natürliches Badini, wie es Muttersprachler im Nordirak schreiben,
// und normale Google-Übersetzungen für ar/en/de. Anfrage/Response:
//   POST { text, languageFrom, languageTo }  →  { translation: { translatedText, ... } }

function mapLangForBadini(code) {
  // Der Badini-Proxy (translator-site-five) benötigt "badini" als Ziel-Sprachcode
  // für echte Badini-Übersetzungen (Provider: Rojda48).
  // Quell-Sprachcodes werden 1:1 durchgereicht (de, en, ar, etc.).
  return code === 'ku' ? 'badini' : code
}

function isBadiniPair(from, to) {
  return from === 'ku' || to === 'ku'
}

async function badiniOne(text, from, to) {
  const url = process.env.BADINI_PROXY_URL
  const key = process.env.BADINI_PROXY_KEY || BADINI_PROXY_KEY_DEFAULT
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({
      text,
      languageFrom: mapLangForBadini(from),
      languageTo: mapLangForBadini(to)
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) throw new Error(`badini-http-${res.status}`)
  const data = await res.json()
  const t = data?.translation || data
  if (t?.error) throw new Error('badini-' + (t.errorCode || 'failed'))
  const translated = String(t?.translatedText || '').trim()
  if (!translated) throw new Error('badini-empty')
  return translated
}

// Teilt einen Absatz an Kommas in kurze Stücke (≤ lineMax). Der Badini-
// Provider kappt lange Einzelsätze – kurze Stücke sind zuverlässig.
function splitParagraphPieces(para, lineMax) {
  const parts = []
  let current = ''
  for (const ch of para) {
    current += ch
    if (/[،,]/.test(ch)) {
      parts.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) parts.push(current.trim())
  if (parts.length === 0) return [para]
  const out = []
  for (const part of parts) {
    if (part.length > lineMax) {
      for (let i = 0; i < part.length; i += lineMax) out.push(part.slice(i, i + lineMax))
    } else {
      out.push(part)
    }
  }
  return out
}

// Baut Badini-Requests: kurze einzeilige Abschnitte (≤ lineMax), gebündelt in
// Requests ≤ requestMax. Liefert { sections, paraIds } – paraIds ordnet jeder
// Section ihren Ursprungs-Absatz zu (für die spätere Rekonstruktion).
function buildBadiniRequests(text, lineMax, requestMax) {
  const requests = []
  let current = null
  let paraId = 0
  const pushSection = (section) => {
    const curLen = current ? current.sections.reduce((s, x) => s + x.length, 0) : 0
    if (!current || curLen + section.length + (current.sections.length ? 2 : 0) > requestMax) {
      if (current) requests.push(current)
      current = { sections: [], paraIds: [] }
    }
    current.sections.push(section)
    current.paraIds.push(paraId)
  }
  for (const para of text.split(/\n\n+/)) {
    const pieces = splitParagraphPieces(para, lineMax)
    let line = ''
    for (const piece of pieces) {
      if (line && (line + ' ' + piece).length > lineMax) {
        pushSection(line)
        line = piece
      } else {
        line = line ? line + ' ' + piece : piece
      }
    }
    if (line) pushSection(line)
    paraId += 1
  }
  if (current) requests.push(current)
  return requests
}

// Ein Badini-Request mit Retry: Die Antwort muss mindestens so viele Zeilen
// enthalten wie der Request Abschnitte hatte, sonst war sie abgeschnitten.
async function badiniRequestWithRetry(requestText, expectedLines, from, to) {
  let lastErr = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const out = await badiniOne(requestText, from, to)
      const lines = out.split(/\n+/).filter((x) => x.trim()).length
      if (out && lines >= expectedLines) return out
      // Bei truncated: kürzeren Text nochmal versuchen
      if (attempt < 4 && requestText.length > 100) {
        const shorter = requestText.slice(0, Math.floor(requestText.length * 0.7))
        requestText = shorter
        expectedLines = Math.max(1, Math.floor(expectedLines * 0.7))
      }
      lastErr = new Error('badini-truncated')
    } catch (err) {
      lastErr = err
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
  }
  throw lastErr || new Error('badini-failed')
}

async function translateBadiniText(text, from, to) {
  if (!text) return ''
  const requests = buildBadiniRequests(text, BADINI_KU_LINE_MAX, BADINI_KU_REQUEST_MAX)
  const results = await pMap(
    requests,
    (req) => {
      const requestText = req.sections.join('\n\n')
      return badiniRequestWithRetry(requestText, req.sections.length, from, to).catch((err) => {
        // Bei Fehler: einzelne Sections nacheinander versuchen
        console.error('[badini] Batch fehlgeschlagen, versuche einzelne Sections:', err.message)
        return req.sections.join(' ')
      })
    },
    Math.min(BADINI_KU_CONCURRENCY, 2)
  )
  // Rekonstruktion: Zeilen je Ursprungs-Absatz mit Leerzeichen verbinden,
  // Absätze mit \n\n trennen.
  const paragraphs = []
  for (let i = 0; i < requests.length; i += 1) {
    const req = requests[i]
    const lines = (results[i] || '').split(/\n+/).filter((x) => x.trim()).map((x) => x.trim())
    for (let j = 0; j < lines.length && j < req.paraIds.length; j += 1) {
      const id = req.paraIds[j]
      paragraphs[id] = paragraphs[id] ? paragraphs[id] + ' ' + lines[j] : lines[j]
    }
  }
  return paragraphs.filter(Boolean).join('\n\n')
}

async function translateWithBadini(text, from, to) {
  const badiniMode = isBadiniPair(from, to)
  if (badiniMode) {
    const [title, intro, body] = await Promise.all([
      badiniRequestWithRetry(String(text?.title || '').trim(), 1, from, to).catch((err) => {
        console.error('[badini] Title-Übersetzung fehlgeschlagen:', err.message)
        return String(text?.title || '').trim()
      }),
      text?.intro ? translateBadiniText(text.intro, from, to) : Promise.resolve(''),
      text?.body ? translateBadiniText(text.body, from, to) : Promise.resolve('')
    ])
    return { title, intro, body }
  }

  const chunk = (value, joiner) => {
    const parts = chunkText(value, BADINI_GOOGLE_MAX_CHARS)
    return Promise.all(parts.map((part) => badiniRequestWithRetry(part, 1, from, to))).then((r) => r.join(joiner))
  }
  const [title, intro, body] = await Promise.all([
    chunk(text?.title || '', ' '),
    text?.intro ? chunk(text.intro, '\n\n') : Promise.resolve(''),
    text?.body ? chunk(text.body, '\n\n') : Promise.resolve('')
  ])
  return { title, intro, body }
}

/**
 * Übersetzt { title, intro, body } von `from` nach `to`.
 * Wirft bei Fehlern, damit der Aufrufer auf Caches/Original zurückfallen kann.
 */
export async function translateArticleText(text, from, to) {
  const badiniReady = Boolean(process.env.BADINI_PROXY_URL)
  // Der Badini-Proxy ist die bevorzugte Engine: Er liefert Google-Übersetzungen
  // für ar/en/de und natürliches Badini für ku – ganz ohne externe API-Keys.
  if (badiniReady) {
    try {
      return await translateWithBadini(text, from, to)
    } catch (err) {
      console.error('Badini proxy translation failed:', err.message)
    }
  }
  // Kurdisch (Badini) ausschließlich über den Badini-Übersetzer –
  // generische KI-Modelle liefern hier kein natürliches Badini.
  if (to === 'ku' || from === 'ku') {
    throw new Error('badini-not-configured')
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      return await translateWithOpenAI(text, from, to)
    } catch (err) {
      console.error('OpenAI translation failed:', err.message)
    }
  }
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await translateWithOpenRouter(text, from, to)
    } catch (err) {
      console.error('OpenRouter translation failed:', err.message)
    }
  }
  return translateWithMyMemory(text, from, to)
}
