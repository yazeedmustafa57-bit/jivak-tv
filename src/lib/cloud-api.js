// Cloud-Datenzugriff (Supabase): Laden aller Inhalte + Schreiben von Änderungen.
import { supabase, cloudEnabled } from './supabase.js'

function toLocalArticle(row) {
  return {
    id: row.id,
    title: row.title || '',
    slug: row.slug || '',
    categoryId: row.category_id || '',
    authorId: row.author_id || '',
    author: '',
    mediaType: row.media_type || 'article',
    mediaUrl: row.media_url || '',
    status: row.status || 'draft',
    intro: row.intro || '',
    body: row.body || '',
    image: row.image || null,
    imageCredit: row.image_credit || '',
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    recommended: Boolean(row.recommended),
    views: Number(row.views) || 0,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  }
}

function toLocalCategory(row) {
  return { id: row.id, name: row.name || '', slug: row.slug || '', sortOrder: row.sort_order || 0 }
}

function toLocalAuthor(row) {
  return { id: row.id, name: row.name || '', slug: row.slug || '', role: row.role || '', bio: row.bio || '', image: row.image || null }
}

function toLocalMedia(row) {
  return { id: row.id, type: row.type || 'image', name: row.name || '', url: row.url || '', tag: row.tag || '', createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now() }
}

export async function cloudFetchAll() {
  if (!cloudEnabled) return null
  const [articles, categories, authors, media, settings] = await Promise.all([
    supabase.from('articles').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('authors').select('*'),
    supabase.from('media_items').select('*').order('created_at', { ascending: false }),
    // Nur den öffentlichen 'site'-Key laden (Audit-/Mitarbeiterdaten bleiben serverseitig).
    supabase.from('settings').select('*').eq('key', 'site')
  ])
  if (articles.error) throw new Error(articles.error.message)
  return {
    articles: (articles.data || []).map(toLocalArticle),
    categories: (categories.data || []).map(toLocalCategory),
    authors: (authors.data || []).map(toLocalAuthor),
    media: (media.data || []).map(toLocalMedia),
    settings: settings.data || []
  }
}

// Alle Schreibzugriffe laufen über die Server-API (Service-Role + Rollenprüfung).
// Grund: RLS erlaubt nur den bisherigen Admin-Konten direkte Schreibzugriffe;
// Redakteure/Autoren/Medien-Mitarbeiter brauchen den serverseitigen Weg.
async function adminFetch(action, opts = {}) {
  if (!cloudEnabled || !supabase) throw new Error('Cloud nicht konfiguriert')
  let token = ''
  try {
    const { data } = await supabase.auth.getSession()
    token = (data && data.session && data.session.access_token) || ''
  } catch { /* unten */ }
  if (!token) throw new Error('Keine Sitzung – bitte neu anmelden')
  const res = await fetch(`/api/staff?action=${action}`, {
    method: opts.method || 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body && body.error) || `Server-Fehler (${res.status})`)
  return body
}

export async function cloudPushArticle(article) {
  if (!cloudEnabled) return
  await adminFetch('article', { body: { article } })
}

export async function cloudDeleteArticle(id) {
  if (!cloudEnabled) return
  await adminFetch('article', { method: 'DELETE', body: { id } })
}

export async function cloudPushCategory(cat) {
  if (!cloudEnabled) return
  await adminFetch('category', { body: { category: cat } })
}

export async function cloudDeleteCategory(id) {
  if (!cloudEnabled) return
  await adminFetch('category', { method: 'DELETE', body: { id } })
}

export async function cloudPushAuthor(author) {
  if (!cloudEnabled) return
  await adminFetch('author', { body: { author } })
}

export async function cloudDeleteAuthor(id) {
  if (!cloudEnabled) return
  await adminFetch('author', { method: 'DELETE', body: { id } })
}

export async function cloudPushMedia(item) {
  if (!cloudEnabled) return
  await adminFetch('media', { body: { item } })
}

export async function cloudDeleteMedia(id) {
  if (!cloudEnabled) return
  await adminFetch('media', { method: 'DELETE', body: { id } })
}

export async function cloudPushSettings(settings) {
  if (!cloudEnabled) return
  await adminFetch('settings', { body: { settings } })
}

function toLocalTranslation(row) {
  return {
    articleId: row.article_id || '',
    lang: row.lang || '',
    sourceLang: row.source_lang || '',
    sourceHash: row.source_hash || '',
    title: row.title || '',
    intro: row.intro || '',
    body: row.body || '',
    kind: row.kind || 'auto',
    updatedAt: row.updated_at || null
  }
}

export async function cloudFetchArticleTranslations(articleIds) {
  if (!cloudEnabled) return []
  const ids = Array.isArray(articleIds) ? articleIds.slice(0, 300) : [articleIds]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('article_translations')
    .select('*')
    .in('article_id', ids)
  if (error) throw error
  return (data || []).map(toLocalTranslation)
}

export async function cloudSaveTranslation({ articleId, lang, title, intro, body, kind = 'manual', sourceLang, sourceHash }) {
  if (!cloudEnabled) return
  await adminFetch('translation', {
    body: { translation: { articleId, lang, title, intro, body, kind, sourceLang, sourceHash } }
  })
}

export async function cloudDeleteTranslation(articleId, lang) {
  if (!cloudEnabled) return
  await adminFetch('translation', { method: 'DELETE', body: { articleId, lang } })
}
