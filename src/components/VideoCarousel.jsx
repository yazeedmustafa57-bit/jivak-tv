import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import OptimizedImage from './OptimizedImage.jsx'
import PlayIcon from './PlayIcon.jsx'
import { getCategoryById } from '../lib/store.js'
import { coverFor } from '../lib/cover.js'
import { useI18n } from '../lib/i18n.jsx'
import { useArticleL10n } from '../lib/useArticleL10n.jsx'

/**
 * Professioneller 3D-Video-Carousel im Stil internationaler Nachrichtenportale
 * (z. B. Rudaw TV): Coverflow-Look mit Snap-Centering. Die Karte in der Mitte
 * ist hervorgehoben, Seiten-Karten sind perspektivisch gedreht, verkleinert und
 * abgedunkelt. Pfeil- und Drag-Navigation, sanftes Autoplay; RTL (Arabisch/
 * Kurdisch) automatisch.
 */
function VideoCarouselCard({ video }) {
  const { tCategory, formatDate, formatViews } = useI18n()
  const local = useArticleL10n(video)
  const category = getCategoryById(video.categoryId)
  return (
    <Link className="video-carousel-card" to={`/artikel/${video.slug}`}>
      <div className="video-carousel-media">
        <OptimizedImage
          src={video.image || coverFor(video, category?.slug || '')}
          alt=""
          widths={[480, 800, 1200]}
          sizes="(max-width: 640px) 78vw, 340px"
        />
        <span className="video-carousel-shade" aria-hidden="true" />
        <PlayIcon />
      </div>
      <div className="video-carousel-body">
        {category && <span className={`pill cat-${category.slug}`}>{tCategory(category)}</span>}
        <h3>{local.title}</h3>
        <div className="video-carousel-meta">
          <span>{formatDate(video.createdAt)}</span>
          {video.views > 0 && (
            <>
              <span className="dot" />
              <span>{formatViews(video.views)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function VideoCarousel({ videos, title, sub, to, allLabel, kicker }) {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const dragRef = useRef({ down: false, startX: 0, startLeft: 0, moved: false })
  const { t } = useI18n()

  // 3D-Coverflow-Effekt: Karten abseits der Mitte drehen/verkleinern/abdunkeln.
  // Berührt kein Layout, nur transform/opacity.
  useEffect(() => {
    const track = trackRef.current
    if (!track || videos.length === 0) return
    let reduced = false
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reduced = false
    }
    if (reduced) return
    let raf = 0
    const update = () => {
      raf = 0
      const viewport = track.clientWidth || 1
      const trackRect = track.getBoundingClientRect()
      const dirSign = document.documentElement.dir === 'rtl' ? -1 : 1
      for (const card of Array.from(track.children)) {
        const rect = card.getBoundingClientRect()
        const center = rect.left + rect.width / 2 - trackRect.left
        const offset = (center - viewport / 2) / Math.max(1, viewport / 2)
        const s = Math.max(-1, Math.min(1, offset))
        const abs = Math.abs(s)
        const angle = s * dirSign * 24
        const scale = 1 + (1 - abs) * 0.08 - abs * 0.18
        const opacity = 0.35 + (1 - abs) * 0.65
        card.style.transform = `perspective(1100px) rotateY(${angle.toFixed(2)}deg) scale(${scale.toFixed(3)})`
        card.style.opacity = opacity.toFixed(3)
        card.style.zIndex = String(Math.round((1 - abs) * 10))
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    update()
    const onResize = () => { if (!raf) raf = requestAnimationFrame(update) }
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      track.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [videos.length])

  // Autoplay (Rudaw-Stil): blättert sanft weiter, pausiert bei Hover, Drag,
  // Tastatur-Fokus, unsichtbarem Tab und prefers-reduced-motion.
  useEffect(() => {
    const track = trackRef.current
    const container = containerRef.current
    if (!track || !container || videos.length < 2) return
    let reduced = false
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reduced = false
    }
    if (reduced) return
    const paused = { hidden: false, hover: false, drag: false, focus: false }
    const tick = () => {
      if (paused.hidden || paused.hover || paused.drag || paused.focus) return
      const card = track.querySelector('.video-carousel-card')
      if (!card) return
      const step = card.getBoundingClientRect().width + 18
      const max = track.scrollWidth - track.clientWidth
      if (track.scrollLeft >= max - 8) {
        track.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        const sign = document.documentElement.dir === 'rtl' ? -1 : 1
        track.scrollBy({ left: sign * step, behavior: 'smooth' })
      }
    }
    const timer = window.setInterval(tick, 4500)
    const onVisibility = () => { paused.hidden = document.hidden }
    const onEnter = () => { paused.hover = true }
    const onLeave = () => { paused.hover = false }
    const onDown = () => { paused.drag = true }
    const onUp = () => { paused.drag = false }
    const onFocusIn = () => { paused.focus = true }
    const onFocusOut = () => { paused.focus = false }
    document.addEventListener('visibilitychange', onVisibility)
    container.addEventListener('mouseenter', onEnter)
    container.addEventListener('mouseleave', onLeave)
    track.addEventListener('pointerdown', onDown)
    track.addEventListener('pointerup', onUp)
    track.addEventListener('pointercancel', onUp)
    track.addEventListener('pointerleave', onUp)
    track.addEventListener('focusin', onFocusIn)
    track.addEventListener('focusout', onFocusOut)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      container.removeEventListener('mouseenter', onEnter)
      container.removeEventListener('mouseleave', onLeave)
      track.removeEventListener('pointerdown', onDown)
      track.removeEventListener('pointerup', onUp)
      track.removeEventListener('pointercancel', onUp)
      track.removeEventListener('pointerleave', onUp)
      track.removeEventListener('focusin', onFocusIn)
      track.removeEventListener('focusout', onFocusOut)
    }
  }, [videos.length])

  // Drag-Scrollen mit der Maus (wie bei Rudaw TV): greifen, ziehen, loslassen.
  function onPointerDown(e) {
    const track = trackRef.current
    if (!track || e.pointerType !== 'mouse') return
    dragRef.current = {
      down: true,
      startX: e.clientX,
      startLeft: track.scrollLeft,
      moved: false
    }
    try { track.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  function onPointerMove(e) {
    const d = dragRef.current
    const track = trackRef.current
    if (!d.down || !track || e.pointerType !== 'mouse') return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 4) d.moved = true
    track.scrollLeft = d.startLeft - dx
  }

  function endDrag(e) {
    const d = dragRef.current
    if (!d.down) return
    d.down = false
    const track = trackRef.current
    if (track && e && e.pointerId !== undefined) {
      try { track.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    // Nach einem Drag keinen Karten-Klick auslösen.
    if (d.moved) {
      window.setTimeout(() => { d.moved = false }, 0)
    }
  }

  function onClickCapture(e) {
    if (dragRef.current.moved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function onKeyDown(e) {
    const track = trackRef.current
    if (!track) return
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    scrollPage(dir)
  }

  function scrollPage(dir) {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector('.video-carousel-card')
    const w = card ? card.getBoundingClientRect().width + 18 : 340
    const sign = document.documentElement.dir === 'rtl' ? -1 : 1
    track.scrollBy({ left: sign * dir * w * 2, behavior: 'smooth' })
  }

  if (!videos || videos.length === 0) return null

  return (
    <div className="video-carousel" ref={containerRef}>
      <div className="sec-head video-carousel-head">
        <div>
          {kicker && <span className="sec-kicker">{kicker}</span>}
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="video-carousel-nav">
          <button
            type="button"
            className="carousel-btn"
            onClick={() => scrollPage(-1)}
            aria-label={t('carousel.prev')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="carousel-btn"
            onClick={() => scrollPage(1)}
            aria-label={t('carousel.next')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        {to && (
          <Link className="more" to={to}>{allLabel}</Link>
        )}
      </div>
      <div
        className="video-carousel-track"
        ref={trackRef}
        tabIndex={0}
        role="region"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
      >
        {videos.map((v) => <VideoCarouselCard key={v.id} video={v} />)}
      </div>
    </div>
  )
}
