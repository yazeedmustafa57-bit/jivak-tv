import { useCallback, useEffect, useRef, useState } from 'react'
import OptimizedImage from './OptimizedImage.jsx'

import { useI18n } from '../lib/i18n.jsx'

/**
 * Fotogalerie mit Lightbox:
 *  - Klick auf ein Bild öffnet den Vollbild-Viewer
 *  - Pfeiltasten / Wisch-Navigation, Escape zum Schließen
 *  - Diashow (automatisch), Vollbild-Modus und Zoom
 */
export default function Lightbox({ images, title }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const boxRef = useRef(null)

  const count = Array.isArray(images) ? images.length : 0

  const close = useCallback(() => {
    setOpen(false)
    setPlaying(false)
    setZoom(1)
  }, [])

  const step = useCallback(
    (dir) => {
      setIndex((i) => (i + dir + count) % count)
      setZoom(1)
    },
    [count]
  )

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.5))
      if (e.key === '-') setZoom((z) => Math.max(1, z - 0.5))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, step])

  // Diashow
  useEffect(() => {
    if (!open || !playing) return undefined
    const timer = setInterval(() => step(1), 3500)
    return () => clearInterval(timer)
  }, [open, playing, step])

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
    } else {
      await boxRef.current?.requestFullscreen?.().catch(() => {})
    }
  }

  if (count === 0) return null

  return (
    <div className="gallery">
      <div className="gallery-grid">
        {images.map((src, i) => (
          <button
            type="button"
            key={`${src}-${i}`}
            className="gallery-thumb"
            onClick={() => {
              setIndex(i)
              setOpen(true)
            }}
            aria-label={`${t('gallery.open')} ${i + 1}`}
          >
            <OptimizedImage src={src} alt="" widths={[160, 320]} sizes="96px" />
          </button>
        ))}
      </div>

      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={title || t('gallery.open')}>
          <div className="lightbox-toolbar">
            <span className="lightbox-counter">
              {index + 1}/{count}
            </span>
            <div className="lightbox-actions">
              <button type="button" onClick={() => setPlaying((v) => !v)} aria-label={t('gallery.slideshow')} title={t('gallery.slideshow')}>
                {playing ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button type="button" onClick={toggleFullscreen} aria-label={t('gallery.fullscreen')} title={t('gallery.fullscreen')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label={t('gallery.zoomIn')} title={t('gallery.zoomIn')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label={t('gallery.zoomOut')} title={t('gallery.zoomOut')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                  <path d="M8 11h6" />
                </svg>
              </button>
              <button type="button" onClick={close} aria-label={t('gallery.close')} title={t('gallery.close')}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l12 12M16 4L4 16" />
                </svg>
              </button>
            </div>
          </div>

          <div className="lightbox-stage" ref={boxRef} onClick={() => setZoom((z) => (z === 1 ? 1.8 : 1))}>
            {count > 1 && (
              <button
                type="button"
                className="lightbox-nav prev"
                aria-label={t('gallery.prev')}
                onClick={(e) => { e.stopPropagation(); step(-1) }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <OptimizedImage
              className="lightbox-image"
              src={images[index]}
              alt=""
              widths={[960, 1600, 2400]}
              sizes="100vw"
              style={{ transform: `scale(${zoom})` }}
            />
            {count > 1 && (
              <button
                type="button"
                className="lightbox-nav next"
                aria-label={t('gallery.next')}
                onClick={(e) => { e.stopPropagation(); step(1) }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
