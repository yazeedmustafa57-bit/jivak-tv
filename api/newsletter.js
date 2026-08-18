// Kombinierte Newsletter-API: Anmeldung, Admin-Liste, Abmeldung, Digest.
// E-Mail-Versand über Brevo (Sendinblue) — kein Domain-Wechsel nötig.
// Vercel Hobby-Limit: alle Endpunkte in einer Datei (11/12 Functions).
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SITE_URL = process.env.NEWSLETTER_SITE_URL || 'https://jivak-tv.vercel.app'
const ALLOWED_LANGS = ['ar', 'ku', 'en', 'de']
const BREVO_BATCH_LIMIT = 10 // Brevo free: 300/day

function normalizeLang(lang) {
  const code = String(lang || 'ar').slice(0, 2)
  return ALLOWED_LANGS.includes(code) ? code : 'ar'
}

function signEmail(email) {
  const secret = process.env.NEWSLETTER_SECRET || process.env.BREVO_API_KEY || ''
  if (!secret) return ''
  return crypto.createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('hex')
}

function verifySign(email, sig) {
  const secret = process.env.NEWSLETTER_SECRET || process.env.BREVO_API_KEY || ''
  if (!secret) return true
  if (!sig) return false
  return sig === signEmail(email)
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function getDb(key) {
  const url = process.env.VITE_SUPABASE_URL
  const k = key || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !k) return null
  return createClient(url, k, { auth: { persistSession: false } })
}

// --- Brevo: E-Mail senden ---
async function sendBrevoEmail(to, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { ok: false, error: 'brevo-not-configured' }
  const fromEmail = process.env.BREVO_FROM_EMAIL || 'newsletter@jivaktv.net'
  const fromName = process.env.BREVO_FROM_NAME || 'ROJ TV'
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: to }],
        subject,
        htmlContent
      })
    })
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      return { ok: false, error: `brevo http ${resp.status}: ${errBody}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

// --- Newsletter-Anmeldung (POST) ---
async function handleSubscribe(req, res) {
  const body = req.body || {}
  const email = String(body.email || '').trim().toLowerCase()
  const lang = normalizeLang(body.lang)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ ok: false, code: 'invalid-email' })
  }

  const supabase = getDb(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!supabase) return res.status(500).json({ ok: false, code: 'not-configured' })

  try {
    const { error } = await supabase.from('newsletter').insert({ email, lang })
    if (error) {
      if (error.code === '23505') return res.json({ ok: true, duplicate: true, emailSent: false })
      return res.status(500).json({ ok: false, code: 'db-error', detail: error.message })
    }

    // Willkommens-E-Mail senden
    let emailSent = false
    const unsubscribeUrl = `${SITE_URL}/api/newsletter?unsubscribe=true&email=${encodeURIComponent(email)}&sig=${signEmail(email)}&lang=${lang}`
    const mails = {
      ar: { subject: 'مرحباً بك في نشرة إيزيدي ميديا', intro: 'مرحباً بك في نشرة إيزيدي ميديا!', text: 'ستصلك الآن أحدث الأخبار والفيديوهات والصور مباشرة إلى بريدك الإلكتروني. يمكنك إلغاء الاشتراك في أي وقت بنقرة واحدة.', unsub: 'إلغاء الاشتراك من النشرة', dir: 'rtl' },
      ku: { subject: 'بهخێر هاتی بۆ بولتەنا جیڤاک تیڤی', intro: 'بهخێر هاتی بۆ بولتەنا جیڤاک تیڤی!', text: 'ئەڤە ژ ئەڤرێ پاشتر نووچە و ڤیدیۆ و وێنەیێن نوی دێ گەهینە ئیمەیلێ تە. هەر دەمێ کێ بڤێت دکەری ئابۆنە ژێ ببی.', unsub: 'ئابۆنە ژێ ببە', dir: 'rtl' },
      en: { subject: 'Welcome to the ROJ TV newsletter', intro: 'Welcome to the ROJ TV newsletter!', text: 'You will now receive the latest news, videos and photos directly in your inbox. You can unsubscribe at any time with one click.', unsub: 'Unsubscribe from the newsletter', dir: 'ltr' },
      de: { subject: 'Willkommen beim ROJ-TV-Newsletter', intro: 'Willkommen beim ROJ-TV-Newsletter!', text: 'Sie erhalten jetzt aktuelle Nachrichten, Videos und Fotos direkt per E-Mail. Sie können den Newsletter jederzeit mit einem Klick abbestellen.', unsub: 'Vom Newsletter abmelden', dir: 'ltr' }
    }
    const m = mails[lang] || mails.en
    const html = `<!doctype html><html dir="${m.dir}" lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.subject}</title></head><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#C0392B;padding:22px 28px"><span style="color:#fff;font-size:22px;font-weight:700">ROJ <span style="color:#ffd9d2">Media</span></span></td></tr><tr><td style="padding:28px 32px"><h1 style="margin:0 0 14px;font-size:20px;color:#1d1d1f">${m.intro}</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#444">${m.text}</p><a href="${unsubscribeUrl}" style="display:inline-block;background:#f6f1e8;border:1px solid #ddd;color:#777;border-radius:8px;padding:9px 16px;font-size:13px;text-decoration:none">${m.unsub}</a></td></tr></table></td></tr></table></body></html>`
    const result = await sendBrevoEmail(email, m.subject, html)
    emailSent = result.ok
    if (!result.ok) console.error('newsletter welcome mail:', result.error)

    return res.json({ ok: true, duplicate: false, emailSent, mailConfigured: Boolean(process.env.BREVO_API_KEY) })
  } catch (err) {
    return res.status(500).json({ ok: false, code: 'db-error', detail: err.message })
  }
}

// --- Admin: Abonnenten auflisten/löschen (GET/DELETE) ---
async function isAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const authClient = getDb(process.env.VITE_SUPABASE_ANON_KEY)
  if (!authClient) return false
  try {
    const { data, error } = await authClient.auth.getUser(token)
    return Boolean(!error && data?.user)
  } catch { return false }
}

async function handleAdmin(req, res) {
  const authed = await isAdmin(req)
  if (!authed) return res.status(401).json({ ok: false, code: 'unauthorized' })

  const client = getDb(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!client) return res.status(500).json({ ok: false, code: 'not-configured' })

  if (req.method === 'DELETE') {
    const email = String(req.query.email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ ok: false, code: 'invalid-email' })
    }
    const { error } = await client.from('newsletter').delete().eq('email', email)
    if (error) return res.status(500).json({ ok: false, code: 'db-error', detail: error.message })
    return res.json({ ok: true })
  }

  const { data, error } = await client
    .from('newsletter')
    .select('email, lang, created_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ ok: false, code: 'db-error', detail: error.message })

  const rows = (data || []).map((r) => ({ email: r.email, lang: r.lang || '', createdAt: r.created_at || null }))
  const mailConfigured = Boolean(process.env.BREVO_API_KEY)

  if (req.query.format === 'csv') {
    const esc = (v) => String(v == null ? '' : v).replace(/"/g, '""')
    const csv = '\uFEFFemail,lang,created_at\n' + rows.map((r) => `"${esc(r.email)}","${esc(r.lang)}","${esc(r.createdAt)}"`).join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"')
    return res.send(csv)
  }

  // Digest-Info laden
  let digestInfo = null
  try {
    const { data: digestSetting } = await client.from('settings').select('value').eq('key', 'newsletter_digest').maybeSingle()
    if (digestSetting?.value) {
      digestInfo = typeof digestSetting.value === 'string' ? JSON.parse(digestSetting.value) : digestSetting.value
    }
  } catch { /* ignore */ }

  return res.json({ ok: true, subscribers: rows, mailConfigured, digestInfo })
}

// --- Abmeldung (GET mit unsubscribe=true) ---
async function handleUnsubscribe(req, res) {
  const email = String(req.query.email || '').trim().toLowerCase()
  const sig = String(req.query.sig || '')
  const lang = normalizeLang(req.query.lang)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)

  const pages = {
    ar: { ok: 'تم إلغاء اشتراكك بنجاح.', bad: 'رابط إلغاء الاشتراك غير صالح.', dir: 'rtl' },
    ku: { ok: 'ئابۆنەیا تە ب سەرکەفتی هاتە ژێبرن.', bad: 'لینکا ژێبرنا ئابۆنەیێ نەدروستە.', dir: 'rtl' },
    en: { ok: 'You have been unsubscribed successfully.', bad: 'The unsubscribe link is invalid.', dir: 'ltr' },
    de: { ok: 'Sie wurden erfolgreich vom Newsletter abgemeldet.', bad: 'Der Abmelde-Link ist ungültig.', dir: 'ltr' }
  }
  const page = (ok) => {
    const m = pages[lang] || pages.en
    const text = ok ? m.ok : m.bad
    return `<!doctype html><html dir="${m.dir}" lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ROJ TV</title></head><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:60px auto;background:#fff;border-radius:12px;padding:32px;text-align:center"><span style="color:#C0392B;font-size:20px;font-weight:700">ROJ <span style="color:#a32c1f">Media</span></span><p style="margin:20px 0 0;font-size:16px;color:#333">${text}</p></div></body></html>`
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (!validEmail || !verifySign(email, sig)) {
    return res.status(400).send(page(false))
  }
  const client = getDb(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (client) await client.from('newsletter').delete().eq('email', email)
  return res.send(page(true))
}

// --- Tägliche Newsletter-Zusammenfassung (Cron + manueller Trigger) ---
async function handleDigest(req, res) {
  const isVercelCron = Boolean(req.headers['x-vercel-cron'])
  const isManual = req.query.digest === 'true'

  if (!isVercelCron && !isManual) {
    return res.status(405).json({ ok: false, code: 'method' })
  }

  if (isManual) {
    const authed = await isAdmin(req)
    if (!authed) return res.status(401).json({ ok: false, code: 'unauthorized' })
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    return res.status(500).json({ ok: false, code: 'brevo-not-configured' })
  }

  const db = getDb(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!db) return res.status(500).json({ ok: false, code: 'db-not-configured' })

  // Letzten Sendezeitpunkt laden
  let lastSentAt = null
  try {
    const { data: settings } = await db.from('settings').select('value').eq('key', 'newsletter_digest').maybeSingle()
    if (settings?.value) {
      const parsed = typeof settings.value === 'string' ? JSON.parse(settings.value) : settings.value
      lastSentAt = parsed.lastSentAt || null
    }
  } catch { /* ignore */ }

  // Artikel laden
  let articles = []
  try {
    const { data, error } = await db.from('articles').select('id, title, slug, body, image, updated_at, created_at, status')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    articles = data || []
  } catch (err) {
    return res.status(500).json({ ok: false, code: 'articles-fetch-error', detail: err.message })
  }

  // Nur neue Artikel seit letztem Versand
  const since = lastSentAt ? new Date(lastSentAt).getTime() : Date.now() - 24 * 60 * 60 * 1000
  const newArticles = articles.filter((a) => {
    const t = new Date(a.created_at || a.updated_at).getTime()
    return t > since
  })

  if (newArticles.length === 0) {
    return res.json({ ok: true, sent: 0, reason: 'no-new-articles', lastSentAt })
  }

  // Abonnenten laden
  let subscribers = []
  try {
    const { data, error } = await db.from('newsletter').select('email, lang')
    if (error) throw error
    subscribers = (data || []).map((r) => ({ email: r.email, lang: r.lang || 'de' }))
  } catch (err) {
    return res.status(500).json({ ok: false, code: 'subscribers-fetch-error', detail: err.message })
  }

  if (subscribers.length === 0) {
    return res.json({ ok: true, sent: 0, reason: 'no-subscribers', newArticles: newArticles.length })
  }

  // Templates pro Sprache
  const TEMPLATES = {
    ar: { subject: 'ايزيدي ميديا – {count} مقالات جديدة اليوم', header: 'ايزيدي ميديا', intro: 'ملخص اليوم: {count} مقالات جديدة', readMore: 'اقرأ المزيد', unsub: 'إلغاء الاشتراك من النشرة', dir: 'rtl' },
    ku: { subject: 'جیڤاک تیڤی – {count} دۆستنەی نوی ئەمڕۆ', header: 'جیڤاک تیڤی', intro: 'پۆلێنا ئەمڕۆ: {count} نووچەی نوی', readMore: 'بیشتر بخوانید', unsub: 'ئابۆنە ژێ ببە', dir: 'rtl' },
    en: { subject: 'ROJ TV - {count} new articles today', header: 'ROJ TV', intro: 'Todays digest: {count} new articles', readMore: 'Read more', unsub: 'Unsubscribe from the newsletter', dir: 'ltr' },
    de: { subject: 'ROJ TV – {count} neue Artikel heute', header: 'ROJ TV', intro: 'Tagesübersicht: {count} neue Artikel', readMore: 'Weiterlesen', unsub: 'Vom Newsletter abmelden', dir: 'ltr' }
  }

  // Nach Sprache gruppieren
  const byLang = {}
  for (const sub of subscribers) {
    const lang = ALLOWED_LANGS.includes(sub.lang) ? sub.lang : 'de'
    if (!byLang[lang]) byLang[lang] = []
    byLang[lang].push(sub)
  }

  let totalSent = 0
  let totalFailed = 0
  const errors = []

  for (const [lang, subs] of Object.entries(byLang)) {
    const tmpl = TEMPLATES[lang] || TEMPLATES.en
    const subject = tmpl.subject.replace('{count}', newArticles.length)
    const unsubBase = `${SITE_URL}/api/newsletter?unsubscribe=true&sig=`

    // Artikel-HTML
    const articlesHtml = newArticles.map((a) => {
      const title = a.title || 'Untitled'
      const slug = a.slug || ''
      const link = `${SITE_URL}/artikel/${encodeURIComponent(slug)}`
      const img = a.image ? `<img src="${a.image}" alt="" style="width:100%;max-width:560px;height:auto;border-radius:8px;margin-bottom:14px" />` : ''
      const bodyPreview = (a.body || '').replace(/<[^>]+>/g, '').slice(0, 200)
      return `<tr><td style="padding:0 0 28px">${img}<h2 style="margin:0 0 8px;font-size:18px;color:#1d1d1f;line-height:1.3">${title}</h2><p style="margin:0 0 10px;font-size:14px;color:#555;line-height:1.6">${bodyPreview}${bodyPreview.length >= 200 ? '…' : ''}</p><a href="${link}" style="display:inline-block;color:#C0392B;font-weight:700;font-size:14px;text-decoration:none">${tmpl.readMore} →</a></td></tr>`
    }).join('')

    const htmlTemplate = `<!doctype html><html dir="${tmpl.dir}" lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#C0392B;padding:22px 28px"><span style="color:#fff;font-size:22px;font-weight:700">${tmpl.header}</span></td></tr><tr><td style="padding:28px 32px"><h1 style="margin:0 0 22px;font-size:20px;color:#1d1d1f">${tmpl.intro.replace('{count}', newArticles.length)}</h1>${articlesHtml}<hr style="border:none;border-top:1px solid #eee;margin:20px 0" /><p style="margin:0;font-size:12px;color:#999;text-align:center"><a href="${SITE_URL}" style="color:#999">${tmpl.header}</a></p></td></tr></table></td></tr></table></body></html>`

    // Versand mit Batching
    for (let i = 0; i < subs.length; i += BREVO_BATCH_LIMIT) {
      const batch = subs.slice(i, i + BREVO_BATCH_LIMIT)
      const promises = batch.map(async (sub) => {
        const unsubUrl = `${unsubBase}${signEmail(sub.email)}&email=${encodeURIComponent(sub.email)}&lang=${lang}`
        const personalizedHtml = htmlTemplate.replace(
          '<hr style="border:none;border-top:1px solid #eee;margin:20px 0" />',
          `<hr style="border:none;border-top:1px solid #eee;margin:20px 0" /><p style="margin:14px 0 0;font-size:11px;color:#bbb;text-align:center"><a href="${unsubUrl}" style="color:#bbb">${tmpl.unsub}</a></p>`
        )
        const result = await sendBrevoEmail(sub.email, subject, personalizedHtml)
        if (result.ok) {
          totalSent++
        } else {
          errors.push({ email: sub.email, error: result.error })
          totalFailed++
        }
      })
      await Promise.allSettled(promises)
      if (i + BREVO_BATCH_LIMIT < subs.length) {
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  }

  // Historie speichern
  const now = new Date().toISOString()
  try {
    const { data: existingSetting } = await db.from('settings').select('value').eq('key', 'newsletter_digest').maybeSingle()
    const existing = existingSetting?.value ? (typeof existingSetting.value === 'string' ? JSON.parse(existingSetting.value) : existingSetting.value) : {}
    const history = Array.isArray(existing.history) ? existing.history : []
    history.unshift({ sentAt: now, sent: totalSent, failed: totalFailed, newArticles: newArticles.length, errors: errors.slice(0, 5) })
    const trimmedHistory = history.slice(0, 30)
    await db.from('settings').upsert(
      { key: 'newsletter_digest', value: { lastSentAt: now, lastCount: totalSent, lastFailed: totalFailed, lastErrors: errors.slice(0, 10), newArticles: newArticles.length, history: trimmedHistory } },
      { onConflict: 'key' }
    )
  } catch { /* ignore */ }

  return res.json({ ok: true, sent: totalSent, failed: totalFailed, newArticles: newArticles.length, errors: errors.slice(0, 5), lastSentAt: now })
}

// --- Router ---
export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET' && req.query.unsubscribe === 'true') {
    return handleUnsubscribe(req, res)
  }

  if (req.method === 'GET' && (req.query.cron === 'true' || req.query.digest === 'true')) {
    return handleDigest(req, res)
  }

  const authHeader = String(req.headers.authorization || '')
  if (authHeader.startsWith('Bearer ') || req.query.admin === 'true') {
    return handleAdmin(req, res)
  }

  if (req.method === 'POST') {
    return handleSubscribe(req, res)
  }

  return res.status(405).json({ ok: false, code: 'method' })
}
