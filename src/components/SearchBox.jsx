import { useEffect, useMemo, useRef, useState } from 'react'
import OptimizedImage from './OptimizedImage.jsx'

import { useNavigate } from 'react-router-dom'
import { getCategories } from '../lib/store.js'
import { searchAll } from '../lib/search.js'
import { useI18n } from '../lib/i18n.jsx'
import { coverFor } from '../lib/cover.js'

export default function SearchBox() {
  const { t, tArticle, tCategory, tAuthor } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) close()
    }
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setQ('')
  }

  const query = q.trim().toLowerCase()

  const results = useMemo(() => {
    const all = searchAll(query, { tArticle, tCategory, tAuthor })
    if (!all) return null
    return {
      articles: all.articles.slice(0, 5),
      videos: all.videos.slice(0, 3),
      photos: all.photos.slice(0, 3),
      categories: all.categories.slice(0, 4),
      authors: all.authors.slice(0, 4)
    }
  }, [query, tArticle, tCategory, tAuthor])

  const total = results ? results.articles.length + results.videos.length + results.photos.length : 0

  function onGoAll() {
    if (!query) return
    close()
    navigate(`/suche?q=${encodeURIComponent(query)}`)
  }

  function onPick(fn) {
    close()
    fn()
  }

  function renderGroup(labelKey, items, renderItem) {
    if (!items || items.length === 0) return null
    return (
      <div className="search-group">
        <div className="search-group-title">{t(labelKey)}</div>
        {items.map(renderItem)}
      </div>
    )
  }

  return (
    <div className="search-box" ref={ref}>
      <button
        className="search-toggle"
        type="button"
        aria-label={t('search.open')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </button>

      {open && (
        <div className="search-panel" role="search">
          <div className="search-input-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              className="search-input"
              type="search"
              placeholder={t('search.placeholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (total > 0) {
                    onPick(() => navigate(`/artikel/${results.articles[0]?.slug || results.videos[0]?.slug || results.photos[0]?.slug}`))
                  } else {
                    onGoAll()
                  }
                }
              }}
            />
            {q && (
              <button className="search-clear" type="button" aria-label="clear" onClick={() => setQ('')}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l12 12M16 4L4 16" />
                </svg>
              </button>
            )}
          </div>

          {results && (
            <div className="search-results">
              {renderGroup('search.articles', results.articles, (a) => {
                const local = tArticle(a)
                const cat = getCategories().find((c) => c.id === a.categoryId)
                return (
                  <button type="button" className="search-result" key={a.id} onClick={() => onPick(() => navigate(`/artikel/${a.slug}`))}>
                    <OptimizedImage className="search-thumb" src={a.image || coverFor(a, cat?.slug || '')} alt="" widths={[96, 160, 320]} sizes="64px" />
                    <span className="search-result-text">
                      <strong>{local.title}</strong>
                      <small>{tCategory(cat)}</small>
                    </span>
                  </button>
                )
              })}
              {renderGroup('search.videos', results.videos, (a) => {
                const cat = getCategories().find((c) => c.id === a.categoryId)
                return (
                  <button type="button" className="search-result" key={a.id} onClick={() => onPick(() => navigate(`/artikel/${a.slug}`))}>
                    <OptimizedImage className="search-thumb" src={a.image || coverFor(a, cat?.slug || '')} alt="" widths={[96, 160, 320]} sizes="64px" />
                    <span className="search-result-text">
                      <strong>{tArticle(a).title}</strong>
                      <small>{t('media.video')}</small>
                    </span>
                  </button>
                )
              })}
              {renderGroup('search.photos', results.photos, (a) => {
                const cat = getCategories().find((c) => c.id === a.categoryId)
                return (
                  <button type="button" className="search-result" key={a.id} onClick={() => onPick(() => navigate(`/artikel/${a.slug}`))}>
                    <OptimizedImage className="search-thumb" src={a.image || coverFor(a, cat?.slug || '')} alt="" widths={[96, 160, 320]} sizes="64px" />
                    <span className="search-result-text">
                      <strong>{tArticle(a).title}</strong>
                      <small>{t('media.photo')}</small>
                    </span>
                  </button>
                )
              })}
              {renderGroup('search.categories', results.categories, (c) => (
                <button type="button" className="search-result" key={c.id} onClick={() => onPick(() => navigate(`/kategorien/${c.slug}`))}>
                  <span className="search-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M3 6h6l2 2h10v11H3z" />
                    </svg>
                  </span>
                  <span className="search-result-text">
                    <strong>{tCategory(c)}</strong>
                    <small>{t('search.categories')}</small>
                  </span>
                </button>
              ))}
              {renderGroup('search.authors', results.authors, (a) => (
                <button type="button" className="search-result" key={a.id} onClick={() => onPick(() => navigate(`/autor/${a.slug}`))}>
                  <span className="search-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21a8 8 0 0 1 16 0" />
                    </svg>
                  </span>
                  <span className="search-result-text">
                    <strong>{a.name}</strong>
                    <small>{t('search.author')}</small>
                  </span>
                </button>
              ))}
              {total === 0 && (
                <div className="search-empty">{t('search.empty', { q: q.trim() })}</div>
              )}
              {total > 0 && (
                <button type="button" className="search-go" onClick={onGoAll}>
                  {t('search.allResults')} →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
