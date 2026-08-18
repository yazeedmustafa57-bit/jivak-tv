import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.jsx'
import { Icon } from './ui.jsx'
import jivakLogo from '../assets/jivak-logo.png'

const ASPECTS = [
  { id: 'free', ratio: 0, key: 'editor.aspectFree' },
  { id: '16:9', ratio: 16 / 9, key: 'editor.aspect169' },
  { id: '4:3', ratio: 4 / 3, key: 'editor.aspect43' },
  { id: '3:2', ratio: 3 / 2, key: 'editor.aspect32' },
  { id: '1:1', ratio: 1, key: 'editor.aspect11' }
]

const MAX_OUT = 1600

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load-failed'))
    img.src = src
  })
}

export default function ImageEditorModal({ src, title, defaultAspect = '16:9', onApply, onClose }) {
  const { t } = useI18n()
  const [img, setImg] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [aspect, setAspect] = useState(defaultAspect)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [flipX, setFlipX] = useState(false)
  const [flipY, setFlipY] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [watermark, setWatermark] = useState(false)
  const [background, setBackground] = useState('#ffffff')
  const [customColor, setCustomColor] = useState('#1e6fd9')
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [applying, setApplying] = useState(false)
  const dragRef = useRef(null)

  useEffect(() => {
    let alive = true
    setImg(null)
    setLoadError('')
    setPan({ x: 0, y: 0 })
    setZoom(1)
    loadImage(src)
      .then((loaded) => { if (alive) setImg(loaded) })
      .catch(() => { if (alive) setLoadError(t('editor.badImage')) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && !applying) apply()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, aspect, zoom, rotation, flipX, flipY, brightness, contrast, saturation, watermark, pan, applying])

  const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio || 0

  function onPointerDown(e) {
    if (!img || e.button !== 0) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e) {
    const drag = dragRef.current
    if (!drag) return
    setPan({ x: drag.panX + (e.clientX - drag.startX), y: drag.panY + (e.clientY - drag.startY) })
  }
  function onPointerUp() {
    dragRef.current = null
  }

  function computeCrop() {
    if (!img) return null
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const rotated = rotation % 180 !== 0
    const w = rotated ? ih : iw
    const h = rotated ? iw : ih
    const vw = ratio > 0 ? 800 : w
    const vh = ratio > 0 ? 800 / ratio : h
    const base = Math.max(vw / w, vh / h)
    const scale = base * zoom
    const left = (vw - w * scale) / 2 + pan.x
    const top = (vh - h * scale) / 2 + pan.y
    let sx = Math.max(0, -left) / scale
    let sy = Math.max(0, -top) / scale
    let sw = Math.min(w, vw / scale)
    let sh = Math.min(h, vh / scale)
    if (sx + sw > w) sw = w - sx
    if (sy + sh > h) sh = h - sy
    return { sx, sy, sw, sh, rot: rotation, flipX, flipY, scale }
  }

  async function apply() {
    if (!img || applying) return
    setApplying(true)
    try {
      const crop = computeCrop()
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const rotated = rotation % 180 !== 0
      const w = rotated ? ih : iw
      const h = rotated ? iw : ih
      let outW
      let outH
      if (ratio > 0) {
        outW = ratio >= 1 ? MAX_OUT : Math.round(MAX_OUT * ratio)
        outH = ratio >= 1 ? Math.round(MAX_OUT / ratio) : MAX_OUT
      } else {
        outW = w
        outH = h
        const maxDim = Math.max(outW, outH)
        if (maxDim > MAX_OUT) {
          outW = Math.round((outW / maxDim) * MAX_OUT)
          outH = Math.round((outH / maxDim) * MAX_OUT)
        }
      }
      const factor = outW / (ratio > 0 ? 800 : w)
      const drawW = crop.sw * crop.scale * factor
      const drawH = crop.sh * crop.scale * factor
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
      const transparentBg = background === 'transparent'
      if (!transparentBg) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, outW, outH)
      }
      ctx.save()
      ctx.translate(outW / 2, outH / 2)
      if (crop.flipX) ctx.scale(-1, 1)
      if (crop.flipY) ctx.scale(1, -1)
      ctx.rotate((crop.rot * Math.PI) / 180)
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, -drawW / 2, -drawH / 2, drawW, drawH)
      ctx.restore()
      if (watermark) {
        try {
          const logoImg = await loadImage(jivakLogo)
          const logoW = Math.round(outW * 0.1)
          const logoH = Math.round((logoW * logoImg.naturalHeight) / logoImg.naturalWidth)
          const margin = Math.round(outW * 0.02)
          ctx.save()
          ctx.globalAlpha = 0.45
          ctx.drawImage(logoImg, outW - logoW - margin, outH - logoH - margin, logoW, logoH)
          ctx.restore()
        } catch {
          // Wasserzeichen ist optional – Bild trotzdem exportieren
        }
      }
      const mime = transparentBg ? 'image/png' : 'image/jpeg'
      canvas.toBlob((blob) => {
        setApplying(false)
        if (!blob) {
          onApply({ ok: false, message: 'export-failed' })
          return
        }
        onApply({
          ok: true,
          blob,
          dataUrl: canvas.toDataURL(mime, transparentBg ? undefined : 0.9),
          width: outW,
          height: outH,
          mime
        })
      }, mime, transparentBg ? undefined : 0.9)
    } catch {
      setApplying(false)
      onApply({ ok: false, message: 'export-failed' })
    }
  }

  const rotated = rotation % 180 !== 0
  const dispW = img ? (rotated ? img.naturalHeight : img.naturalWidth) : 1
  const dispH = img ? (rotated ? img.naturalWidth : img.naturalHeight) : 1
  const base = img && ratio > 0 ? Math.max(800 / dispW, (800 / ratio) / dispH) : 1
  const scale = (img ? base : 1) * zoom

  return (
    <div className="modal-backdrop image-editor-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal image-editor" role="dialog" aria-modal="true" aria-label={title || t('editor.editorTitle')}>
        <div className="image-editor-head">
          <h3>{title || t('editor.editorTitle')}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('ui.cancel')}><Icon name="close" size={16} /></button>
        </div>

        {loadError ? (
          <p className="form-error">{loadError}</p>
        ) : !img ? (
          <p className="hint">{t('editor.editing')}</p>
        ) : (
          <>
            <div
              className={`image-editor-viewport ${background === 'transparent' ? 'bg-transparent' : ''}`}
              style={{
                aspectRatio: ratio > 0 ? `${ratio}` : 'auto',
                minHeight: ratio > 0 ? 260 : 340,
                background: background === 'transparent' ? undefined : background
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  width: dispW * scale,
                  height: dispH * scale,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1}) rotate(${rotation}deg)`,
                  left: '50%',
                  top: '50%',
                  marginLeft: -(dispW * scale) / 2,
                  marginTop: -(dispH * scale) / 2,
                  position: 'absolute'
                }}
              />
              {ratio > 0 && <div className="image-editor-grid" />}
            </div>
            <p className="hint image-editor-hint">{t('editor.panHint')}</p>

            <div className="image-editor-tools">
              <div className="image-editor-row">
                <span className="image-editor-label">{t('editor.aspect')}</span>
                <div className="aspect-btns">
                  {ASPECTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`btn btn-xs ${aspect === a.id ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => { setAspect(a.id); setPan({ x: 0, y: 0 }) }}
                    >
                      {t(a.key)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="image-editor-row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRotation((r) => (r + 270) % 360); setPan({ x: 0, y: 0 }) }} title={t('editor.rotateLeft')}>
                  <Icon name="refresh" size={15} /> {t('editor.rotateLeft')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRotation((r) => (r + 90) % 360); setPan({ x: 0, y: 0 }) }} title={t('editor.rotateRight')}>
                  <Icon name="refresh" size={15} style={{ transform: 'scaleX(-1)' }} /> {t('editor.rotateRight')}
                </button>
                <button type="button" className={`btn btn-ghost btn-sm ${flipX ? 'btn-primary' : ''}`} onClick={() => setFlipX((v) => !v)}>
                  {t('editor.flipH')}
                </button>
                <button type="button" className={`btn btn-ghost btn-sm ${flipY ? 'btn-primary' : ''}`} onClick={() => setFlipY((v) => !v)}>
                  {t('editor.flipV')}
                </button>
              </div>
              <div className="image-editor-row">
                <label className="image-editor-label" htmlFor="ie-zoom">{t('editor.zoom')}</label>
                <input id="ie-zoom" type="range" min="0.25" max="4" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
                <span className="image-editor-value">{Math.round(zoom * 100)}%</span>
              </div>
              <div className="image-editor-row">
                <label className="image-editor-label" htmlFor="ie-brightness">{t('editor.brightness')}</label>
                <input id="ie-brightness" type="range" min="40" max="160" step="1" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
                <span className="image-editor-value">{brightness}%</span>
              </div>
              <div className="image-editor-row">
                <label className="image-editor-label" htmlFor="ie-contrast">{t('editor.contrast')}</label>
                <input id="ie-contrast" type="range" min="40" max="160" step="1" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
                <span className="image-editor-value">{contrast}%</span>
              </div>
              <div className="image-editor-row">
                <label className="image-editor-label" htmlFor="ie-saturation">{t('editor.saturation')}</label>
                <input id="ie-saturation" type="range" min="0" max="200" step="1" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} />
                <span className="image-editor-value">{saturation}%</span>
              </div>
              <div className="image-editor-row">
                <span className="image-editor-label">{t('editor.watermark')}</span>
                <button
                  type="button"
                  className={`btn btn-xs ${watermark ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setWatermark((v) => !v)}
                  aria-pressed={watermark}
                >
                  <Icon name={watermark ? 'check' : 'plus'} size={14} />
                  {watermark ? t('editor.watermarkOn') : t('editor.watermarkOff')}
                </button>
              </div>
              <div className="image-editor-row">
                <span className="image-editor-label">{t('editor.background')}</span>
                <button
                  type="button"
                  className={`btn btn-xs ${background === 'transparent' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setBackground('transparent')}
                >
                  {t('editor.bgTransparent')}
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${background === '#ffffff' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setBackground('#ffffff')}
                >
                  {t('editor.bgWhite')}
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${background === '#000000' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setBackground('#000000')}
                >
                  {t('editor.bgBlack')}
                </button>
                <label className="image-editor-color" title={t('editor.bgCustom')}>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => { setCustomColor(e.target.value); setBackground(e.target.value) }}
                  />
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>{t('ui.cancel')}</button>
              <button className="btn btn-primary" onClick={apply} disabled={applying}>
                <Icon name="check" size={16} /> {applying ? t('editor.editing') : t('editor.apply')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
