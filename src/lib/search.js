// Gemeinsame Suchlogik für Live-Suche (Header) und Suchseite.
// Durchsucht Artikel (nach lokalisiertem Titel/Einleitung/Inhalt),
// Kategorien und Autoren.

import { getPublishedArticles, getCategories, getAuthors } from './store.js'

export function searchAll(query, { tArticle, tCategory, tAuthor }) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return null
  const articles = getPublishedArticles()
  const categories = getCategories()
  const authors = getAuthors()
  const match = (str) => String(str || '').toLowerCase().includes(q)

  const hits = articles.filter((a) => {
    const local = tArticle(a)
    const cat = categories.find((c) => c.id === a.categoryId)
    const author = authors.find((x) => x.id === a.authorId)
    return (
      match(local.title) ||
      match(local.intro) ||
      match(local.body) ||
      (cat && match(tCategory(cat))) ||
      (author && match(author.name))
    )
  })

  return {
    query: q,
    articles: hits.filter((a) => (a.mediaType || 'article') === 'article'),
    videos: hits.filter((a) => a.mediaType === 'video'),
    photos: hits.filter((a) => a.mediaType === 'photo'),
    categories: categories.filter((c) => match(tCategory(c))),
    authors: authors.filter((a) => match(a.name) || match(tAuthor(a).bio || a.bio || ''))
  }
}
