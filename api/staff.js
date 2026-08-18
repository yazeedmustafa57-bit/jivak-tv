// Mitarbeiter-Verwaltung + Audit-Protokoll (Service-Role, nur Admin).
// Rollen liegen in den Supabase-Auth-Metadaten (user_metadata):
//   role: 'admin' | 'editor' | 'author' | 'media'
//   name, authorId, active
// Bootstrap: Die ersten bekannten Hauptkonten (bzw. das erste Konto, falls
// noch kein Admin existiert) werden automatisch zu Admins.
//
// Endpunkte:
//   GET  /api/staff?me=1                 → eigenes Profil (jeder Mitarbeiter)
//   GET  /api/staff                      → Mitarbeiterliste (Admin)
//   POST /api/staff                      → Mitarbeiter anlegen (Admin)
//   PATCH /api/staff                     → Mitarbeiter ändern / Passwort (Admin)
//   DELETE /api/staff?id=...             → Mitarbeiter löschen (Admin)
//   GET  /api/staff?action=audit         → Audit-Protokoll (Admin)
//   POST /api/staff?action=audit         → Audit-Eintrag schreiben (Mitarbeiter)
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 30 }

const ROLES = new Set(['admin', 'editor', 'author', 'media'])
const MAX_AUDIT = 400
const BOOTSTRAP_ADMINS = (process.env.STAFF_ADMIN_EMAILS || 'yazeedmustafa57@gmail.com,admin@jivaktv.net,jivaktvnewsroom@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}

function toStaff(u) {
  const md = (u && u.user_metadata) || {}
  return {
    id: u.id,
    email: u.email || '',
    name: md.name || u.email || '',
    role: ROLES.has(md.role) ? md.role : '',
    authorId: md.authorId || '',
    active: md.active !== false,
    createdAt: u.created_at || null,
    lastSignInAt: u.last_sign_in_at || null
  }
}

/** Prüft den Aufrufer; liefert { user, role } oder { error }. */
async function identify(supabase, token) {
  if (!token) return { error: 'auth' }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'auth' }
  const md = data.user.user_metadata || {}
  const role = ROLES.has(md.role) ? md.role : ''
  return { user: data.user, role }
}

/** Admin-Pflicht + Bootstrap für die ersten Konten. */
async function requireAdmin(supabase, token) {
  const who = await identify(supabase, token)
  if (who.error) return who
  if (who.role === 'admin') return who
  const email = String(who.user.email || '').toLowerCase()
  const canBootstrap = BOOTSTRAP_ADMINS.includes(email)
  if (!canBootstrap) {
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const admins = ((users && users.users) || []).filter((u) => (u.user_metadata || {}).role === 'admin')
    if (admins.length === 0) {
      await supabase.auth.admin.updateUserById(who.user.id, {
        user_metadata: { ...(who.user.user_metadata || {}), role: 'admin', name: who.user.email || 'Admin', active: true }
      })
      return { user: who.user, role: 'admin', bootstrapped: true }
    }
    return { error: 'forbidden' }
  }
  await supabase.auth.admin.updateUserById(who.user.id, {
    user_metadata: { ...(who.user.user_metadata || {}), role: 'admin', name: who.user.email || 'Admin', active: true }
  })
  return { user: who.user, role: 'admin', bootstrapped: true }
}

async function readAudit(supabase) {
  const { data } = await supabase.from('settings').select('value').eq('key', 'audit').maybeSingle()
  const value = data && data.value
  return Array.isArray(value) ? value : []
}

async function writeAudit(supabase, entries) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'audit', value: entries, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return error
}

function json(res, status, body) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (status === 204) return res.status(204).end()
  return res.status(status).json(body)
}


// ---------- Inhalts-Schreibzugriffe (Service-Role; RLS erlaubt nur bisherige Admins) ----------

function articleToRow(a) {
  return {
    id: a.id,
    title: a.title || '',
    slug: a.slug || '',
    category_id: a.categoryId || '',
    author_id: a.authorId || '',
    media_type: a.mediaType || 'article',
    media_url: a.mediaUrl || '',
    status: a.status || 'draft',
    intro: a.intro || '',
    body: a.body || '',
    image: a.image || null,
    image_credit: a.imageCredit || '',
    gallery: Array.isArray(a.gallery) ? a.gallery : [],
    recommended: Boolean(a.recommended),
    views: Number(a.views) || 0,
    created_at: a.createdAt ? new Date(a.createdAt).toISOString() : undefined,
    updated_at: a.updatedAt ? new Date(a.updatedAt).toISOString() : undefined
  }
}

function canWriteArticle(user, role, article) {
  if (role === 'admin' || role === 'editor') return true
  if (role === 'author') {
    const own = String(article.authorId || '') === String((user.user_metadata || {}).authorId || '')
    if (!own) return false
    if (article.status === 'published' || article.status === 'archived') return false
    return true
  }
  return false
}

async function handleContent(req, res, supabase, who, action) {
  const md = who.user.user_metadata || {}
  const role = who.role

  if (action === 'article' && (req.method === 'POST' || req.method === 'PATCH')) {
    const article = (req.body && req.body.article) || {}
    if (!article || !article.id || !article.title) return json(res, 400, { ok: false, error: 'article-invalid' })
    if (!canWriteArticle(who.user, role, article)) return json(res, 403, { ok: false, error: 'forbidden' })
    const { error } = await supabase.from('articles').upsert(articleToRow(article), { onConflict: 'id' })
    if (error) return json(res, 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true })
  }

  if (action === 'article' && req.method === 'DELETE') {
    if (role !== 'admin') return json(res, 403, { ok: false, error: 'forbidden' })
    const id = String((req.body && req.body.id) || req.query.id || '')
    if (!id) return json(res, 400, { ok: false, error: 'id-missing' })
    try {
      const { error } = await supabase.from('articles').delete().eq('id', id)
      if (error) return json(res, 500, { ok: false, error: error.message })
    } catch (err) {
      console.error('[staff] article delete threw:', err)
      return json(res, 500, { ok: false, error: 'article-delete-threw', detail: err && err.message ? err.message : String(err) })
    }
    try {
      await supabase.from('article_translations').delete().eq('article_id', id)
    } catch (err) {
      console.error('[staff] translations delete threw:', err)
    }
    return json(res, 200, { ok: true })
  }

  if (action === 'media' && (req.method === 'POST' || req.method === 'PATCH')) {
    if (role !== 'admin' && role !== 'editor' && role !== 'media') return json(res, 403, { ok: false, error: 'forbidden' })
    const item = (req.body && req.body.item) || {}
    if (!item || !item.id) return json(res, 400, { ok: false, error: 'item-invalid' })
    const { error } = await supabase.from('media_items').upsert({
      id: item.id,
      type: item.type || 'image',
      name: item.name || '',
      url: item.url || '',
      tag: item.tag || '',
      created_at: item.createdAt ? new Date(item.createdAt).toISOString() : undefined
    }, { onConflict: 'id' })
    if (error) return json(res, 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true })
  }

  if (action === 'media' && req.method === 'DELETE') {
    if (role !== 'admin' && role !== 'editor' && role !== 'media') return json(res, 403, { ok: false, error: 'forbidden' })
    const id = String((req.body && req.body.id) || req.query.id || '')
    if (!id) return json(res, 400, { ok: false, error: 'id-missing' })
    const { error } = await supabase.from('media_items').delete().eq('id', id)
    if (error) return json(res, 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true })
  }

  if (action === 'category') {
    if (role !== 'admin') return json(res, 403, { ok: false, error: 'forbidden' })
    if (req.method === 'POST' || req.method === 'PATCH') {
      const cat = (req.body && req.body.category) || {}
      if (!cat || !cat.id) return json(res, 400, { ok: false, error: 'category-invalid' })
      const { error } = await supabase.from('categories').upsert({
        id: cat.id, name: cat.name || '', slug: cat.slug || '', sort_order: Number(cat.sortOrder) || 0
      }, { onConflict: 'id' })
      if (error) return json(res, 500, { ok: false, error: error.message })
      return json(res, 200, { ok: true })
    }
    if (req.method === 'DELETE') {
      const id = String((req.body && req.body.id) || req.query.id || '')
      if (!id) return json(res, 400, { ok: false, error: 'id-missing' })
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) return json(res, 500, { ok: false, error: error.message })
      return json(res, 200, { ok: true })
    }
  }

  if (action === 'author') {
    if (role !== 'admin') return json(res, 403, { ok: false, error: 'forbidden' })
    if (req.method === 'POST' || req.method === 'PATCH') {
      const author = (req.body && req.body.author) || {}
      if (!author || !author.id) return json(res, 400, { ok: false, error: 'author-invalid' })
      const { error } = await supabase.from('authors').upsert({
        id: author.id, name: author.name || '', slug: author.slug || '', role: author.role || '',
        bio: author.bio || '', image: author.image || null
      }, { onConflict: 'id' })
      if (error) return json(res, 500, { ok: false, error: error.message })
      return json(res, 200, { ok: true })
    }
    if (req.method === 'DELETE') {
      const id = String((req.body && req.body.id) || req.query.id || '')
      if (!id) return json(res, 400, { ok: false, error: 'id-missing' })
      const { error } = await supabase.from('authors').delete().eq('id', id)
      if (error) return json(res, 500, { ok: false, error: error.message })
      return json(res, 200, { ok: true })
    }
  }

  if (action === 'settings' && req.method === 'POST') {
    if (role !== 'admin') return json(res, 403, { ok: false, error: 'forbidden' })
    const value = (req.body && req.body.settings) || {}
    const { error } = await supabase.from('settings').upsert({
      key: 'site', value, updated_at: new Date().toISOString()
    }, { onConflict: 'key' })
    if (error) return json(res, 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true })
  }

  if (action === 'translation') {
    if (role !== 'admin' && role !== 'editor') return json(res, 403, { ok: false, error: 'forbidden' })
    if (req.method === 'POST' || req.method === 'PATCH') {
      const tr = (req.body && req.body.translation) || {}
      if (!tr || !tr.articleId || !tr.lang) return json(res, 400, { ok: false, error: 'translation-invalid' })
      const { error } = await supabase.from('article_translations').upsert({
        article_id: tr.articleId,
        lang: tr.lang,
        title: tr.title || '',
        intro: tr.intro || '',
        body: tr.body || '',
        kind: tr.kind || 'manual',
        source_lang: tr.sourceLang || null,
        source_hash: tr.sourceHash || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'article_id,lang' })
      if (error) return json(res, 500, { ok: false, error: error.message })
      return json(res, 200, { ok: true })
    }
    if (req.method === 'DELETE') {
      const { articleId, lang } = req.body || {}
      if (!articleId || !lang) return json(res, 400, { ok: false, error: 'translation-invalid' })
      const { error } = await supabase.from('article_translations').delete().eq('article_id', articleId).eq('lang', lang)
      if (error) return json(res, 500, { ok: false, error: error.message })
      return json(res, 200, { ok: true })
    }
  }

  return json(res, 405, { ok: false, error: 'method' })
}

export default async function handler(req, res) {
  try {
    return await handlerInner(req, res)
  } catch (err) {
    console.error('[staff] unhandled:', err && err.stack ? err.stack : err)
    return json(res, 500, { ok: false, error: 'unhandled', detail: err && err.message ? err.message : String(err) })
  }
}

async function handlerInner(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204)
  const supabase = adminClient()
  if (!supabase) return json(res, 501, { ok: false, error: 'not-configured' })
  const token = bearer(req)
  const who = await identify(supabase, token)
  if (who.error) return json(res, 401, { ok: false, error: who.error })

  // ---------- Audit: Eintrag schreiben (jeder Mitarbeiter) ----------
  if (req.method === 'POST' && String(req.query.action) === 'audit') {
    if (!who.role) return json(res, 403, { ok: false, error: 'forbidden' })
    const { action, targetType, targetId, targetTitle, detail } = req.body || {}
    if (!action || typeof action !== 'string' || action.length > 80) {
      return json(res, 400, { ok: false, error: 'action-invalid' })
    }
    const md = who.user.user_metadata || {}
    const entries = await readAudit(supabase)
    entries.push({
      t: Date.now(),
      iso: new Date().toISOString(),
      actor: {
        id: who.user.id,
        email: who.user.email || '',
        name: md.name || who.user.email || '',
        role: who.role
      },
      action: action.slice(0, 80),
      targetType: String(targetType || '').slice(0, 40),
      targetId: String(targetId || '').slice(0, 120),
      targetTitle: String(targetTitle || '').slice(0, 240),
      detail: String(detail || '').slice(0, 300)
    })
    while (entries.length > MAX_AUDIT) entries.shift()
    const err = await writeAudit(supabase, entries)
    if (err) return json(res, 500, { ok: false, error: err.message })
    return json(res, 200, { ok: true })
  }

  // ---------- Audit: lesen (nur Admin) ----------
  if (req.method === 'GET' && String(req.query.action) === 'audit') {
    if (who.role !== 'admin') return json(res, 403, { ok: false, error: 'forbidden' })
    const entries = await readAudit(supabase)
    return json(res, 200, { ok: true, entries: entries.slice().reverse() })
  }

  // ---------- Eigenes Profil (Bootstrap für die ersten Konten) ----------
  if (req.method === 'GET' && String(req.query.me) === '1') {
    const md = who.user.user_metadata || {}
    let role = who.role
    let name = md.name || who.user.email || ''
    if (!role) {
      const boot = await requireAdmin(supabase, token)
      if (!boot.error) {
        role = 'admin'
        name = name || 'Admin'
      }
    }
    return json(res, 200, { ok: true, user: { id: who.user.id, email: who.user.email || '', name, role, authorId: md.authorId || '', active: md.active !== false } })
  }

  // ---------- Inhalts-Schreibzugriffe (Artikel, Medien, Kategorien, Autoren, Einstellungen, Übersetzungen) ----------
  const contentAction = String(req.query.action || '')
  if (['article', 'media', 'category', 'author', 'settings', 'translation'].includes(contentAction)) {
    return handleContent(req, res, supabase, who, contentAction)
  }

  const admin = await requireAdmin(supabase, token)
  if (admin.error) return json(res, 403, { ok: false, error: admin.error })

  if (req.method === 'GET') {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (error) return json(res, 500, { ok: false, error: error.message })
    const staff = ((data && data.users) || []).map(toStaff).sort((a, b) => (a.email || '').localeCompare(b.email || ''))
    return json(res, 200, { ok: true, staff })
  }

  if (req.method === 'POST') {
    const { email, password, name, role, authorId, active } = req.body || {}
    if (!email || !String(email).includes('@')) return json(res, 400, { ok: false, error: 'email-invalid' })
    if (!password || String(password).length < 6) return json(res, 400, { ok: false, error: 'password-short' })
    if (!ROLES.has(role)) return json(res, 400, { ok: false, error: 'role-invalid' })
    const { data, error } = await supabase.auth.admin.createUser({
      email: String(email).trim(),
      password: String(password),
      email_confirm: true,
      user_metadata: {
        name: String(name || '').trim() || String(email).trim(),
        role,
        authorId: String(authorId || ''),
        active: active !== false
      }
    })
    if (error) return json(res, error.message && /already|exist|registered/i.test(error.message) ? 409 : 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true, staff: toStaff(data.user) })
  }

  if (req.method === 'PATCH') {
    const { id, name, role, authorId, active, password } = req.body || {}
    if (!id) return json(res, 400, { ok: false, error: 'id-missing' })
    if (role && !ROLES.has(role)) return json(res, 400, { ok: false, error: 'role-invalid' })
    if (password && String(password).length < 6) return json(res, 400, { ok: false, error: 'password-short' })

    const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(id)
    if (getErr || !existing || !existing.user) return json(res, 404, { ok: false, error: 'not-found' })
    const old = existing.user.user_metadata || {}
    const oldRole = ROLES.has(old.role) ? old.role : ''
    const newRole = role || oldRole

    if (oldRole === 'admin' && newRole !== 'admin') {
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const admins = ((users && users.users) || []).filter((u) => (u.user_metadata || {}).role === 'admin')
      if (admins.length <= 1) return json(res, 409, { ok: false, error: 'last-admin' })
    }

    const metadata = {
      name: name !== undefined ? String(name).trim() : old.name,
      role: newRole,
      authorId: authorId !== undefined ? String(authorId || '') : (old.authorId || ''),
      active: active !== undefined ? Boolean(active) : old.active !== false
    }
    const payload = { user_metadata: metadata }
    if (password) payload.password = String(password)
    const { data, error } = await supabase.auth.admin.updateUserById(id, payload)
    if (error) return json(res, 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true, staff: toStaff(data.user) })
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || (req.body && req.body.id) || '')
    if (!id) return json(res, 400, { ok: false, error: 'id-missing' })
    if (id === admin.user.id) return json(res, 409, { ok: false, error: 'self-delete' })
    const { data: existing } = await supabase.auth.admin.getUserById(id)
    if (existing && existing.user && (existing.user.user_metadata || {}).role === 'admin') {
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const admins = ((users && users.users) || []).filter((u) => (u.user_metadata || {}).role === 'admin')
      if (admins.length <= 1) return json(res, 409, { ok: false, error: 'last-admin' })
    }
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return json(res, 500, { ok: false, error: error.message })
    return json(res, 200, { ok: true })
  }

  return json(res, 405, { ok: false, error: 'method' })
}
