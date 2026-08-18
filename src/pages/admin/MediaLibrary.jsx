import { useEffect, useMemo, useRef, useState } from 'react'
import OptimizedImage from '../../components/OptimizedImage.jsx'

import { getMediaItems, addMediaItem, deleteMediaItem, ensureExampleMedia, getArticles, getStoreVersion } from '../../lib/store.js'
import { Icon, Modal, Toast } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'
import { useStoreVersion } from '../../lib/useStore.js'
import VideoPlayer from '../../components/VideoPlayer.jsx'
import { isYouTubeLink } from '../../lib/youtube.js'
import { isIdbUrl } from '../../lib/blobstore.js'
import { saveMediaFile, saveImageFile } from '../../lib/media-upload.js'
import ImageEditorModal from '../../components/ImageEditorModal.jsx'
import { getStorageUsage, MAX_IMAGE_BYTES } from '../../lib/cloud-storage.js'
import { useMediaUrl } from '../../lib/useMediaUrl.js'
import { supabase, cloudEnabled } from '../../lib/supabase.js'


function formatMb(bytes) {
  const mb = Number(bytes) / (1024 * 1024)
  return mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10
}

function normUrl(url) {
  try {
    return String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '')
  } catch {
    return String(url || '')
  }
}

function VideoThumb({ url, name }) {
  const resolved = useMediaUrl(url)
  return <video src={resolved || undefined} muted playsInline preload="metadata" aria-label={name} />
}

export default function MediaLibrary() {
  useStoreVersion()
  const { t } = useI18n()
  const [items, setItems] = useState(getMediaItems())
  const [form, setForm] = useState({ type: 'image', name: '', url: '', tag: '' })
  const [filter, setFilter] = useState('alle')
  const [coverTab, setCoverTab] = useState('unused')
  const [cloudUsedUrls, setCloudUsedUrls] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [errors, setErrors] = useState([])
  const [toast, setToast] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [previewItem, setPreviewItem] = useState(null)
  const [videoFileMeta, setVideoFileMeta] = useState(null)
  const [storage, setStorage] = useState(null)
  const fileRef = useRef(null)
  const [editImage, setEditImage] = useState(null)

  useEffect(() => {
    let active = true
    getStorageUsage()
      .then((u) => { if (active) setStorage(u) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Cloud-Wahrheit: welche Bilder werden in Artikeln als Titelbild/Galerie
  // verwendet? Grundlage für "Nur unbenutzte" – nicht der lokale Cache.
  useEffect(() => {
    if (!cloudEnabled || !supabase) return undefined
    let active = true
    supabase
      .from('articles')
      .select('image, gallery')
      .then(({ data, error }) => {
        if (!active) return
        if (error) throw error
        const set = new Set()
        for (const a of data || []) {
          if (a && a.image) set.add(normUrl(a.image))
          for (const g of Array.isArray(a.gallery) ? a.gallery : []) {
            if (g) set.add(normUrl(g))
          }
        }
        setCloudUsedUrls(set)
      })
      .catch(() => { /* Cloud offline – lokaler Cache bleibt Fallback */ })
    return () => { active = false }
  }, [getStoreVersion(), items])

  function refresh() {
    setItems(getMediaItems())
  }

  function onAddExample() {
    const res = ensureExampleMedia()
    refresh()
    setToast(res.added ? t('mediaLib.exampleAdded') : t('mediaLib.exampleExists'))
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (form.type === 'video') {
      setErrors([])
      setVideoFileMeta({ name: file.name, size: file.size })
      try {
        const res = await saveMediaFile(file, 'media')
        if (!res.ok) {
          if (res.reason === 'too-large') {
            setErrors([t('editor.videoTooBig', { size: formatMb(res.size) })])
          } else if (res.reason === 'quota-exceeded') {
            setErrors([t('editor.storageQuota')])
          } else {
            setErrors([res.message && res.message !== 'file-too-large' ? res.message : t('editor.videoUploadFail')])
          }
          return
        }
        set('url', res.url)
        setToast(res.source === 'local' ? t('editor.videoLocalHint') : t('editor.videoCloudOk'))
      } catch (err) {
        setErrors([t('editor.videoUploadFail')])
      }
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors([t('editor.bigImage')])
      return
    }
    const reader = new FileReader()
    reader.onload = () => setEditImage({ src: reader.result })
    reader.onerror = () => setErrors([t('editor.badImage')])
    reader.readAsDataURL(file)
  }

  async function applyEditedImage(result) {
    if (!result || !result.ok) {
      setErrors([t('editor.badImage')])
      setEditImage(null)
      return
    }
    try {
      const mime = result.mime || 'image/jpeg'
      const ext = mime === 'image/png' ? 'png' : 'jpg'
      const file = new File([result.blob], `bearbeitet.${ext}`, { type: mime })
      const res = await saveImageFile(file, 'images')
      if (!res.ok) {
        setErrors([t('editor.bigImage')])
        setEditImage(null)
        return
      }
      set('url', res.url)
      setErrors([])
      setEditImage(null)
    } catch {
      setErrors([t('editor.bigImage')])
      setEditImage(null)
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!form.name.trim()) errs.push(t('mediaLib.nameErr'))
    const url = form.url.trim()
    if (!url) errs.push(t('mediaLib.urlErr'))
    else if (!/^(https?:\/\/|data:image\/|idb:\/\/)/i.test(url) && !(form.type === 'video' && /^(https?:\/\/|data:video\/|idb:\/\/)/i.test(url))) {
      errs.push(t('mediaLib.urlErr'))
    }
    setErrors(errs)
    if (errs.length > 0) return
    try {
      addMediaItem({ ...form, tag: form.tag.trim() })
    } catch (err) {
      setErrors([t('editor.storageErr')])
      return
    }
    setForm({ type: 'image', name: '', url: '', tag: '' })
    refresh()
    setToast(t('mediaLib.add'))
  }

  function confirmDelete() {
    deleteMediaItem(toDelete)
    setToDelete(null)
    refresh()
    setToast(t('mediaLib.delete'))
  }

  const usedUrls = useMemo(() => {
    // Cloud-Wahrheit zuerst; lokaler Cache nur als Fallback (z. B. offline).
    const set = new Set(cloudUsedUrls)
    for (const a of getArticles()) {
      if (a && a.image) set.add(normUrl(a.image))
      for (const g of Array.isArray(a.gallery) ? a.gallery : []) {
        if (g) set.add(normUrl(g))
      }
    }
    return set
  }, [cloudUsedUrls, items, getStoreVersion()])

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items.filter((m) => {
      if (filter !== 'alle' && m.type !== filter) return false
      if (m.type === 'image' && coverTab === 'unused' && usedUrls.has(normUrl(m.url))) return false
      if (!query) return true
      return (
        String(m.name || '').toLowerCase().includes(query) ||
        String(m.tag || '').toLowerCase().includes(query)
      )
    })
  }, [items, filter, q, coverTab, usedUrls])

  const hiddenUsed = coverTab === 'unused' && items.some((m) => m.type === 'image' && usedUrls.has(normUrl(m.url)))

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('mediaLib.title')}</h1>
          <div className="sub">{t('mediaLib.sub')}</div>
          {storage && (
            <div className="sub" style={{ marginTop: 4 }}>
              {storage.provider === 'r2'
                ? t('mediaLib.storageR2')
                : t('mediaLib.storageUsed', { used: formatMb(storage.bytes), total: Math.round(storage.maxBytes / (1024 * 1024 * 1024)) })}
            </div>
          )}
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost btn-sm" id="add-example" type="button" onClick={onAddExample}>
            <Icon name="plus" size={15} /> {t('mediaLib.addExample')}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="form-error">
          {errors.map((er) => <div key={er}>• {er}</div>)}
        </div>
      )}

      <div className="editor-grid">
        <div className="panel">
          <h2>{t('mediaLib.add')}</h2>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="media-type">{t('mediaLib.type')}</label>
              <select id="media-type" className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="image">{t('mediaLib.typeImage')}</option>
                <option value="video">{t('mediaLib.typeVideo')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="media-name">{t('mediaLib.name')}</label>
              <input id="media-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="media-url">{t('mediaLib.url')}</label>
              <input id="media-url" className="input" dir="ltr" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
              {(form.type === 'image' || form.type === 'video') && (
                <div className="cover-upload">
                  <input
                    ref={fileRef}
                    id="media-file"
                    type="file"
                    accept={form.type === 'image' ? 'image/*' : 'video/*'}
                    onChange={onFile}
                  />
                  <label className="file-label" htmlFor="media-file" onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}>
                    <Icon name="upload" size={18} />
                    {form.type === 'image' ? t('editor.upload') : t('editor.videoUpload')}
                  </label>
                </div>
              )}
              {form.type === 'video' && (
                <>
                  {videoFileMeta && (
                    <span className="hint" style={{ display: 'block' }}>{t('editor.videoSize', { size: formatMb(videoFileMeta.size) })}</span>
                  )}
                  <span className="hint">{t('editor.videoUploadHint')}</span>
                </>
              )}
            </div>
            <div className="field">
              <label htmlFor="media-tag">{t('mediaLib.tag')}</label>
              <input id="media-tag" className="input" value={form.tag} onChange={(e) => set('tag', e.target.value)} placeholder={t('mediaLib.tagsHint')} />
            </div>
            <button className="btn btn-primary btn-block" type="submit">
              <Icon name="plus" size={16} /> {t('mediaLib.add')}
            </button>
          </form>
        </div>

        <div>
          <div className="panel" style={{ marginBottom: 20 }}>
            <h2>{t('mediaLib.search')}</h2>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('mediaLib.search')}
            />
            <div className="filter-row" style={{ marginTop: 14, marginBottom: 0 }}>
              {['alle', 'image', 'video'].map((f) => (
                <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'alle' ? t('mediaLib.all') : f === 'image' ? t('mediaLib.images') : t('mediaLib.videos')}
                </button>
              ))}
            </div>
            {filter !== 'video' && (
              <div className="filter-row" style={{ marginTop: 10, marginBottom: 0 }}>
                <button
                  className={`filter-btn ${coverTab === 'unused' ? 'active' : ''}`}
                  onClick={() => setCoverTab('unused')}
                >
                  {t('mediaLib.onlyUnused')}
                </button>
                <button
                  className={`filter-btn ${coverTab === 'all' ? 'active' : ''}`}
                  onClick={() => setCoverTab('all')}
                >
                  {t('mediaLib.allUsed')}
                </button>
              </div>
            )}
            {filter !== 'video' && coverTab === 'unused' && (
              <div className="hint" style={{ marginTop: 8 }}>{t('mediaLib.unusedHint')}</div>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="empty-state">
              <p>{t('mediaLib.empty')}</p>
              {hiddenUsed && <p className="hint">{t('mediaLib.unusedHint')}</p>}
            </div>
          ) : (
            <div className="media-grid">
              {visible.map((m) => (
                <div className="media-item" key={m.id}>
                  {m.type === 'image' ? (
                    <div className="media-thumb">
                      <OptimizedImage src={m.url} alt={m.name} widths={[240, 480, 800]} sizes="180px" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`media-thumb media-thumb-video ${isYouTubeLink(m.url) ? 'is-link' : ''}`}
                      onClick={() => setPreviewItem(m)}
                      title={t('mediaLib.preview')}
                    >
                      {isYouTubeLink(m.url) ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <>
                          <VideoThumb url={m.url} name={m.name} />
                          <span className="media-thumb-play" aria-hidden="true">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </span>
                        </>
                      )}
                    </button>
                  )}
                  <div className="media-item-body">
                    <strong>{m.name}</strong>
                    {m.tag && (
                      <span className="media-tags">
                        {String(m.tag).split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                          <span className="media-tag" key={tag}>{tag}</span>
                        ))}
                      </span>
                    )}
                    <span className="badge">{m.type === 'image' ? t('mediaLib.typeImage') : t('mediaLib.typeVideo')}</span>
                  </div>
                  <button className="icon-btn danger" onClick={() => setToDelete(m.id)} title={t('mediaLib.delete')}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(toDelete)}
        title={t('mediaLib.delete')}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel={t('mediaLib.delete')}
        danger
      >
        <p>{t('mediaLib.deleteConfirm')}</p>
      </Modal>
      <Modal
        open={Boolean(previewItem)}
        title={previewItem?.name || ''}
        onClose={() => setPreviewItem(null)}
        onConfirm={() => setPreviewItem(null)}
        confirmLabel={t('ui.close')}
      >
        {previewItem && (
          <div className="video-preview">
            <VideoPlayer url={previewItem.url} autoStart />
          </div>
        )}
      </Modal>
      <Toast message={toast} onClose={() => setToast('')} />

      {editImage && (
        <ImageEditorModal
          src={editImage.src}
          title={t('editor.editorTitle')}
          defaultAspect="16:9"
          onApply={applyEditedImage}
          onClose={() => setEditImage(null)}
        />
      )}
    </div>
  )
}
