import { useEffect, useRef, useState } from 'react'
import OptimizedImage from '../../components/OptimizedImage.jsx'

import { Link, useNavigate, useParams } from 'react-router-dom'
import { getArticleById, getCategories, getAuthors, saveArticle, uid } from '../../lib/store.js'
import { coverFor } from '../../lib/cover.js'
import { toYouTubeEmbed, isYouTubeLink, isTikTokLink, toTikTokEmbed, isFacebookLink, toFacebookEmbed, isDirectMediaUrl, isHlsUrl, isDataVideoUrl, isVimeoLink } from '../../lib/youtube.js'
import { isIdbUrl } from '../../lib/blobstore.js'
import { saveMediaFile, saveImageFile } from '../../lib/media-upload.js'
import { deleteCloudImage, cloudItemFromUrl, MAX_IMAGE_BYTES } from '../../lib/cloud-storage.js'
  function formatSizeMB(bytes) {
    return Math.round(bytes / (1024 * 1024) * 10) / 10
  }

import { cleanupRetiredCoverFiles, cloudUrlUsedElsewhere } from '../../lib/cover-cleanup.js'
import { logError } from '../../lib/errorLog.js'
import { supabase, cloudEnabled } from '../../lib/supabase.js'
import { currentUser, canPublish, logAudit } from '../../lib/staff.js'
import { renderBody } from '../../lib/markdown-lite.jsx'
import { Icon, Toast } from '../../components/ui.jsx'
import ImageEditorModal from '../../components/ImageEditorModal.jsx'
import VideoPlayer from '../../components/VideoPlayer.jsx'
import { LANGUAGES, useI18n } from '../../lib/i18n.jsx'
import { detectArticleLang, sourceHash } from '../../lib/translate.js'
import {
  cloudFetchArticleTranslations,
  cloudSaveTranslation,
  cloudDeleteTranslation
} from '../../lib/cloud-api.js'


function formatMb(bytes) {
  const mb = Number(bytes) / (1024 * 1024)
  return mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10
}

export default function ArticleEditor() {
  const { t, tCategory } = useI18n()
  const { id } = useParams()
  const existing = id ? getArticleById(id) : null
  const previousStatus = existing ? existing.status : null
  const navigate = useNavigate()
  const user = currentUser()
  const role = user?.role || 'author'
  const isAuthor = role === 'author'
  const mayPublish = canPublish(role)
  const fileRef = useRef(null)
  const videoFileRef = useRef(null)
  const categories = getCategories()
  const authors = getAuthors()

  const [form, setForm] = useState(() => {
    const freshId = existing?.id || uid()
    return {
      id: freshId,
      title: existing?.title || '',
      categoryId: existing?.categoryId || categories[0]?.id || '',
      mediaType: existing?.mediaType || 'article',
      mediaUrl: existing?.mediaUrl || '',
      status: existing?.status || 'draft',
      intro: existing?.intro || '',
      body: existing?.body || '',
      author: existing?.author || '',
      authorId: existing?.authorId || (isAuthor ? user?.authorId || '' : ''),
      recommended: existing?.recommended || false,
      image: existing?.image || null,
      gallery: Array.isArray(existing?.gallery) ? existing.gallery : []
    }
  })
  const [errors, setErrors] = useState([])
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [videoUploadError, setVideoUploadError] = useState('')
  const [videoFileMeta, setVideoFileMeta] = useState(null)
  const [galleryUrl, setGalleryUrl] = useState('')
  const galleryFileRef = useRef(null)
  const [editImage, setEditImage] = useState(null)
  const [tr, setTr] = useState({})
  const [trLoading, setTrLoading] = useState(false)
  const [trBusy, setTrBusy] = useState('')
  const [trStatus, setTrStatus] = useState('')
  const [trProgress, setTrProgress] = useState(null)

  // Titelbild-Aufräumen: ersetzte/entfernte Cloud-URLs merken, Löschung erst
  // nach erfolgreichem Speichern auslösen (nie bei Abbruch im Editor).
  const retiredCoversRef = useRef(new Set())
  const currentImageRef = useRef(null)

  useEffect(() => {
    currentImageRef.current = form.image
  }, [form.image])

  /** Merkt sich eine ersetzte/entfernte Titelbild-URL für die spätere Löschung. */
  function retireCover(url) {
    if (url && cloudItemFromUrl(url)) retiredCoversRef.current.add(url)
  }

  /** Titelbild ersetzen: altes Bild wird erst nach dem Speichern gelöscht. */
  function setCover(url) {
    const prev = currentImageRef.current
    if (prev && prev !== url) retireCover(prev)
    setForm((f) => ({ ...f, image: url }))
  }

  /** Titelbild entfernen: Datei wird erst nach dem Speichern gelöscht. */
  function clearCover() {
    retireCover(currentImageRef.current)
    setForm((f) => ({ ...f, image: null }))
  }

  const sourceLang = detectArticleLang(form.title)
  // Getrimmt, damit der Hash mit dem serverseitig gespeicherten übereinstimmt.
  const currentSourceHash = sourceHash({
    title: form.title.trim(),
    intro: form.intro.trim(),
    body: form.body.trim()
  })

  // Vorhandene Übersetzungen aus der Datenbank laden
  useEffect(() => {
    let alive = true
    if (!form.id || !cloudEnabled) {
      setTr({})
      return undefined
    }
    setTrLoading(true)
    cloudFetchArticleTranslations([form.id])
      .then((rows) => {
        if (!alive) return
        const map = {}
        rows.forEach((r) => {
          map[r.lang] = { title: r.title, intro: r.intro, body: r.body, kind: r.kind }
        })
        setTr(map)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setTrLoading(false)
      })
    return () => {
      alive = false
    }
  }, [form.id])

  function setTrField(lang, field, value) {
    setTr((prev) => ({ ...prev, [lang]: { ...(prev[lang] || { kind: 'missing' }), [field]: value } }))
  }

  function copyOriginal(lang) {
    setTr((prev) => ({
      ...prev,
      [lang]: { title: form.title, intro: form.intro, body: form.body, kind: 'missing', sourceHash: currentSourceHash }
    }))
  }

  async function fetchTranslation(lang) {
    if (!form.id) throw new Error('no-id')
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleId: form.id,
        lang,
        title: form.title,
        intro: form.intro,
        body: form.body,
        withBody: true
      })
    })
    const json = await res.json()
    if (!json?.ok || !json.data) throw new Error('translate-fail')
    setTr((prev) => ({
      ...prev,
      [lang]: {
        title: json.data.title || '',
        intro: json.data.intro || '',
        body: json.data.body || '',
        kind: json.data.kind,
        sourceHash: currentSourceHash
      }
    }))
    return json.data
  }

  async function autoTranslate(lang) {
    if (trBusy) return
    setTrBusy(lang)
    setTrStatus('')
    try {
      const data = await fetchTranslation(lang)
      // kind=missing means the language can't be auto-translated right now
      // (e.g. Kurdish without Badini proxy) - this is NOT an error.
      if (data.kind === 'missing') {
        console.log(`[translate] ${lang}: kind=missing (kein automatischer Übersetzer verfügbar)`)
      }
    } catch (err) {
      console.error(`[translate] ${lang} fehlgeschlagen:`, err)
      setTrStatus(t('editor.trAutoFail'))
    } finally {
      setTrBusy('')
    }
  }

  async function autoTranslateAll() {
    if (trBusy) return
    setTrBusy('all')
    setTrStatus('')
    const targets = LANGUAGES.filter((l) => l.code !== sourceLang).map((l) => l.code)
    const failedLangs = []
    for (const lang of targets) {
      try {
        const data = await fetchTranslation(lang)
        // kind=missing = no auto-translator available (e.g. ku without Badini) - not a failure
        if (data.kind === 'missing') {
          console.log(`[translate] ${lang}: kind=missing (kein automatischer Übersetzer verfügbar)`)
        }
      } catch (err) {
        console.error(`[translate] ${lang} fehlgeschlagen:`, err)
        failedLangs.push(lang)
      }
    }
    setTrBusy('')
    if (failedLangs.length) {
      console.error('[translate] fehlgeschlagene Sprachen:', failedLangs.join(', '))
      setTrStatus(t('editor.trAutoFail'))
    }
  }

  async function saveTr(lang) {
    if (!form.id) return
    const entry = tr[lang]
    if (!entry) return
    try {
      await cloudSaveTranslation({
        articleId: form.id,
        lang,
        title: entry.title || '',
        intro: entry.intro || '',
        body: entry.body || '',
        kind: 'manual',
        sourceLang,
        sourceHash: sourceHash({ title: form.title.trim(), intro: form.intro.trim(), body: form.body.trim() })
      })
      setTr((prev) => ({ ...prev, [lang]: { ...prev[lang], kind: 'manual' } }))
      setToast(t('editor.saved'))
    } catch {
      setToast(t('editor.trSaveFail'))
    }
  }

  async function deleteTr(lang) {
    if (!form.id) return
    try {
      await cloudDeleteTranslation(form.id, lang)
      setTr((prev) => {
        const next = { ...prev }
        delete next[lang]
        return next
      })
      setToast(t('editor.trDeleted'))
    } catch {
      setToast(t('editor.trSaveFail'))
    }
  }

  function onGalleryFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(t('editor.bigImage', { size: formatSizeMB(file.size) }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => setEditImage({ src: reader.result, mode: 'gallery' })
    reader.onerror = () => setUploadError(t('editor.badImage'))
    reader.readAsDataURL(file)
  }

  function addGalleryUrl() {
    const url = galleryUrl.trim()
    if (!url || !/^(https?:\/\/|data:image\/)/i.test(url)) {
      setUploadError(t('mediaLib.urlErr'))
      return
    }
    set('gallery', [...form.gallery, url])
    setGalleryUrl('')
    setUploadError('')
  }

  function removeGalleryItem(idx) {
    set('gallery', form.gallery.filter((_, i) => i !== idx))
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function onFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(t('editor.bigImage', { size: formatSizeMB(file.size) }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => setEditImage({ src: reader.result, mode: 'cover' })
    reader.onerror = () => setUploadError(t('editor.badImage'))
    reader.readAsDataURL(file)
  }

  async function applyEditedImage(result) {
    if (!result || !result.ok) {
      setUploadError(t('editor.badImage'))
      setEditImage(null)
      return
    }
    try {
      const mime = result.mime || 'image/jpeg'
      const ext = mime === 'image/png' ? 'png' : 'jpg'
      const file = new File([result.blob], `bearbeitet.${ext}`, { type: mime })
      const res = await saveImageFile(file, 'images')
      if (!res.ok) {
        console.error('[upload] saveImageFile failed:', res)
        if (res.reason === 'too-large') {
          setUploadError(t('editor.bigImage', { size: formatSizeMB(file.size) }))
        } else if (res.reason === 'auth' || res.reason === 'forbidden') {
          setUploadError('Authentifizierung fehlgeschlagen – bitte erneut einloggen. (' + (res.message || '') + ')')
        } else if (res.reason === 'not-configured') {
          setUploadError('Cloud-Speicher nicht konfiguriert. (' + (res.message || '') + ')')
        } else if (res.message) {
          setUploadError(res.message)
        } else {
          setUploadError(t('editor.uploadFail') || t('editor.badImage'))
        }
        setEditImage(null)
        return
      }
      if (editImage?.mode === 'gallery') {
        set('gallery', [...form.gallery, res.url])
      } else {
        setCover(res.url)
      }
      setUploadError('')
      setEditImage(null)
    } catch {
      setUploadError(t('editor.uploadFail') || t('editor.badImage'))
      setEditImage(null)
    }
  }

  /** „Bild entfernen“: Datei wird erst NACH erfolgreichem Speichern gelöscht. */
  function removeCurrentCover() {
    const url = currentImageRef.current
    if (!url) return
    clearCover()
    setToast(t('editor.pickerDeleted'))
  }

  function generateVideoPoster(url) {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video')
        video.muted = true
        video.playsInline = true
        video.preload = 'metadata'
        if (/^https?:/i.test(url)) video.crossOrigin = 'anonymous'
        const cleanup = () => {
          video.removeAttribute('src')
          try { video.load() } catch { /* ignore */ }
        }
        const finish = (result) => { clearTimeout(timer); cleanup(); resolve(result) }
        const timer = setTimeout(() => finish(null), 15000)
        video.onloadeddata = () => {
          try {
            const vw = video.videoWidth || 640
            const vh = video.videoHeight || 360
            const scale = Math.min(1, 1280 / vw)
            const w = Math.round(vw * scale)
            const h = Math.round(vh * scale)
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, w, h)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
            ctx.fillRect(0, 0, w, h)
            const size = Math.round(Math.min(w, h) * 0.16)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
            ctx.beginPath()
            ctx.arc(w / 2, h / 2, size * 0.85, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.moveTo(w / 2 - size * 0.32, h / 2 - size * 0.42)
            ctx.lineTo(w / 2 - size * 0.32, h / 2 + size * 0.42)
            ctx.lineTo(w / 2 + size * 0.55, h / 2)
            ctx.closePath()
            ctx.fill()
            canvas.toBlob(async (blob) => {
              if (!blob) { finish(null); return }
              try {
                const file = new File([blob], 'video-poster.jpg', { type: 'image/jpeg' })
                const res = await saveImageFile(file, 'images')
                finish(res.ok ? res.url : null)
              } catch {
                finish(null)
              }
            }, 'image/jpeg', 0.88)
          } catch {
            finish(null)
          }
        }
        video.onerror = () => finish(null)
        video.src = url
      } catch {
        resolve(null)
      }
    })
  }

  async function onVideoFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    e.target.value = ''
    setVideoUploadError('')
    setVideoFileMeta({ name: file.name, size: file.size })
    try {
      const res = await saveMediaFile(file, 'videos')
      if (!res.ok) {
        if (res.reason === 'too-large') {
          setVideoUploadError(t('editor.videoTooBig', { size: formatMb(res.size) }))
        } else if (res.reason === 'quota-exceeded') {
          setVideoUploadError(t('editor.storageQuota'))
        } else {
          setVideoUploadError(res.message && res.message !== 'file-too-large' ? res.message : t('editor.videoUploadFail'))
        }
        return
      }
      set('mediaUrl', res.url)
      if (res.source === 'local') setToast(t('editor.videoLocalHint'))
      else setToast(t('editor.videoCloudOk'))
      const posterUrl = await generateVideoPoster(res.url)
      if (posterUrl) {
        setCover(posterUrl)
        setToast(t('editor.videoPosterOk'))
      }
    } catch (err) {
      setVideoUploadError(t('editor.videoUploadFail'))
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = []
    if (!form.title.trim()) errs.push(t('editor.errTitle'))
    if (!form.intro.trim()) errs.push(t('editor.errIntro'))
    if (!form.categoryId) errs.push(t('editor.errCat'))
    if (form.mediaType === 'video' && form.mediaUrl.trim() && (isYouTubeLink(form.mediaUrl) || isTikTokLink(form.mediaUrl) || isFacebookLink(form.mediaUrl) || isVimeoLink(form.mediaUrl))) {
      if (isVimeoLink(form.mediaUrl)) {
        errs.push(t('editor.videoVimeoUnsupported'))
      } else {
        const conv = isTikTokLink(form.mediaUrl) ? toTikTokEmbed(form.mediaUrl) : isFacebookLink(form.mediaUrl) ? toFacebookEmbed(form.mediaUrl) : toYouTubeEmbed(form.mediaUrl)
        if (!conv.ok) errs.push(t('editor.videoUrlErr'))
      }
    }
    setErrors(errs)
    if (errs.length > 0) return
    if (saving) return

    const rawUrl = form.mediaUrl.trim()
    let videoUrl = form.mediaUrl
    if (form.mediaType === 'video' && rawUrl) {
      const conv = toYouTubeEmbed(rawUrl)
      const convTt = toTikTokEmbed(rawUrl)
      const convFb = toFacebookEmbed(rawUrl)
      videoUrl = conv.ok ? conv.url : convTt.ok ? convTt.url : convFb.ok ? convFb.url : rawUrl
    }

    const payload = {
      ...form,
      mediaUrl: videoUrl,
      title: form.title.trim(),
      intro: form.intro.trim(),
      body: form.body.trim()
    }
    // Autoren dürfen nicht direkt veröffentlichen: Änderungen an veröffentlichten
    // Artikeln gehen zurück in die Prüfung, damit nichts ungeprüft live geht.
    if (isAuthor) {
      if (payload.status === 'published' || payload.status === 'archived') payload.status = previousStatus === 'published' ? 'review' : 'draft'
      if (previousStatus === 'published') payload.status = 'review'
    }
    const srcLang = detectArticleLang(payload.title)
    const targetLangs = LANGUAGES.filter((l) => l.code !== srcLang)
    const statuses = {}
    targetLangs.forEach((l) => { statuses[l.code] = 'pending' })

    setSaving(true)
    setTrProgress({ phase: 'saving', statuses, langs: targetLangs, failedCount: 0 })

    // 1) Artikel IMMER zuerst speichern – nie verlieren, auch wenn die
    //    Übersetzung fehlschlägt.
    let saved
    try {
      saved = await saveArticle(payload)
    } catch (err) {
      setErrors([err?.message ? `${t('editor.storageErr')}: ${err.message}` : t('editor.storageErr')])
      setSaving(false)
      setTrProgress(null)
      return
    }

    // Titelbild-Aufräumen: ersetzte/entfernte Dateien erst JETZT (nach
    // erfolgreichem Speichern) aus dem Cloud-Speicher löschen. Fehler dabei
    // dürfen das Speichern nie blockieren – nur ins Crash-Protokoll schreiben.
    try {
      await cleanupRetiredCoverFiles({
        retiredUrls: [...retiredCoversRef.current],
        currentId: saved.id,
        finalImage: payload.image,
        finalGallery: payload.gallery,
        supabase,
        cloudItemFromUrl,
        deleteCloudImage,
        logError
      })
      retiredCoversRef.current.clear()
    } catch (err) {
      logError('cover-cleanup', err, { file: 'ArticleEditor.jsx' })
    }

    // Audit: Erstellen/Bearbeiten + Statuswechsel protokollieren
    logAudit(existing ? 'article.updated' : 'article.created', {
      targetType: 'article',
      targetId: saved.id,
      targetTitle: saved.title
    })
    if (previousStatus !== payload.status) {
      const action = payload.status === 'published'
        ? 'article.published'
        : payload.status === 'review'
          ? 'article.review'
          : payload.status === 'archived'
            ? 'article.archived'
            : 'article.draft'
      logAudit(action, { targetType: 'article', targetId: saved.id, targetTitle: saved.title })
    }

    // Ohne Cloud gibt es keine serverseitige Übersetzung → direkt abschließen.
    if (!cloudEnabled) {
      setTrProgress(null)
      setSaving(false)
      setToast(existing ? t('editor.saved') : t('editor.created'))
      setTimeout(() => navigate('/admin/artikel'), 500)
      return
    }

    // 2) Fehlende/veraltete Übersetzungen automatisch erzeugen.
    //    Cache: bei unverändertem Hash wird die vorhandene Übersetzung
    //    wiederverwendet – nur geänderte Sprachen werden neu übersetzt.
    let failedCount = 0
    setTrProgress((p) => ({ ...p, phase: 'translating' }))
    const savedHash = sourceHash({ title: saved.title, intro: saved.intro, body: saved.body })
    for (const lang of targetLangs) {
      const entry = tr[lang.code]
      const fresh =
        entry &&
        (entry.kind === 'auto' || entry.kind === 'manual') &&
        entry.sourceHash === currentSourceHash
      if (fresh) {
        setTrProgress((p) => ({ ...p, statuses: { ...p.statuses, [lang.code]: 'done' } }))
        continue
      }
      setTrProgress((p) => ({ ...p, statuses: { ...p.statuses, [lang.code]: 'working' } }))
      try {
        const data = await fetchTranslation(lang.code)
        if (data.kind === 'missing') throw new Error('missing')
        // Übersetzung in der Datenbank speichern, damit die öffentliche Seite sie findet
        try {
          await cloudSaveTranslation({
            articleId: saved.id,
            lang: lang.code,
            title: data.title || '',
            intro: data.intro || '',
            body: data.body || '',
            kind: 'auto',
            sourceLang: srcLang,
            sourceHash: savedHash
          })
        } catch { /* Speicherfehler ist nicht kritisch – Cache existiert bereits */ }
        setTrProgress((p) => ({ ...p, statuses: { ...p.statuses, [lang.code]: 'done' } }))
      } catch (err) {
        console.error(`[translate] ${lang.code} fehlgeschlagen:`, err)
        failedCount += 1
        setTrProgress((p) => ({ ...p, statuses: { ...p.statuses, [lang.code]: 'failed' } }))
        // Als "ausstehend" markieren → automatischer Retry möglich.
        try {
          await cloudSaveTranslation({
            articleId: saved.id,
            lang: lang.code,
            title: '',
            intro: '',
            body: '',
            kind: 'pending',
            sourceLang: srcLang,
            sourceHash: savedHash
          })
          setTr((prev) => ({
            ...prev,
            [lang.code]: { title: '', intro: '', body: '', kind: 'pending', sourceHash: currentSourceHash }
          }))
        } catch { /* Markierung ist optional */ }
      }
    }

    setTrProgress((p) => ({ ...p, phase: 'done', failedCount }))
    setSaving(false)
    setToast(
      failedCount > 0
        ? t('editor.trFailedHint')
        : payload.status === 'published'
          ? t('editor.trPublishedOk')
          : existing
            ? t('editor.saved')
            : t('editor.created')
    )
    setTimeout(() => navigate('/admin/artikel'), 1800)
  }

  const currentCategory = categories.find((c) => c.id === form.categoryId) || null
  const coverClass = currentCategory ? `cover cat-${currentCategory.slug}` : 'cover'

  // Autoren dürfen nur eigene Artikel bearbeiten; Medien-Rolle hat keinen Artikel-Zugriff.
  const noAccess = role === 'media' || (existing && isAuthor && existing.authorId !== user?.authorId)
  if (noAccess) {
    return (
      <div className="container" style={{ padding: '120px 24px', textAlign: 'center' }}>
        <h1>{t('editor.noAccess')}</h1>
        <p className="lead" style={{ color: 'var(--ink-soft)' }}>{t('editor.noAccessText')}</p>
        <Link className="btn btn-primary" to="/admin/artikel">{t('editor.back')}</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{existing ? t('editor.editTitle') : t('editor.newTitle')}</h1>
          <div className="sub">
            <Link to="/admin/artikel" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t('editor.back')}</Link>
          </div>
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreview((v) => !v)}>
            <Icon name="eye" size={15} /> {preview ? t('editor.closePreview') : t('editor.preview')}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="form-error">
          {errors.map((er) => <div key={er}>• {er}</div>)}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="editor-grid">
          <div className="panel">
            <div className="field">
              <label htmlFor="title">{t('editor.title')}</label>
              <input
                id="title"
                className="input"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder={t('editor.titlePh')}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="intro">{t('editor.intro')}</label>
              <textarea
                id="intro"
                className="textarea"
                value={form.intro}
                onChange={(e) => set('intro', e.target.value)}
                placeholder={t('editor.introPh')}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="body">{t('editor.body')}</label>
              <textarea
                id="body"
                className="textarea large"
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
                placeholder={`${t('editor.bodyPh')}\n\n## …\n\n- …\n\n> …`}
              />
              <span className="hint">{t('markdown.hint')}</span>
            </div>
          </div>

          <div>
            <div className="panel" style={{ marginBottom: 20 }}>
              <h2>{t('editor.publish')}</h2>
              <div className="field">
                <label htmlFor="category">{t('editor.category')}</label>
                <select
                  id="category"
                  className="select"
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{tCategory(c)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="mediaType">{t('editor.format')}</label>
                <select
                  id="mediaType"
                  className="select"
                  value={form.mediaType}
                  onChange={(e) => set('mediaType', e.target.value)}
                >
                  <option value="article">{t('editor.formatArticle')}</option>
                  <option value="video">{t('editor.formatVideo')}</option>
                  <option value="photo">{t('editor.formatPhoto')}</option>
                </select>
              </div>
              {form.mediaType === 'video' && (
                <div className="field">
                  <label htmlFor="mediaUrl">{t('editor.videoUrl')}</label>
                  <input
                    id="mediaUrl"
                    className="input"
                    value={form.mediaUrl}
                    onChange={(e) => set('mediaUrl', e.target.value)}
                    placeholder={t('editor.videoUrlPh')}
                  />
                  <span className="hint">{t('editor.videoUrlHint')}</span>
                  {(() => {
                    const v = form.mediaUrl.trim()
                    if (!v) return null
                    const conv = toYouTubeEmbed(v)
                    if (conv.ok) return <span className="hint hint-live">{t('editor.videoUrlLive', { url: conv.url })}</span>
                    if (conv.reason === 'invalid-id') return <span className="hint hint-error">{t('editor.videoUrlErr')}</span>
                    const convTt = toTikTokEmbed(v)
                    if (convTt.ok) return <span className="hint hint-live">{t('editor.videoUrlLive', { url: convTt.url })}</span>
                    if (convTt.reason === 'invalid-id') return <span className="hint hint-error">{t('editor.videoUrlErr')}</span>
                    const convFb = toFacebookEmbed(v)
                    if (convFb.ok) return <span className="hint hint-live">{t('editor.videoUrlLive', { url: convFb.url })}</span>
                    if (convFb.reason === 'invalid-id') return <span className="hint hint-error">{t('editor.videoUrlErr')}</span>
                    if (isVimeoLink(v)) return <span className="hint hint-error">{t('editor.videoVimeoUnsupported')}</span>
                    if (isDirectMediaUrl(v) || isHlsUrl(v) || isIdbUrl(v)) return <span className="hint hint-live">{t('editor.videoUrlFile')}</span>
                    return null
                  })()}
                  <div className="cover-upload" style={{ marginTop: 12 }}>
                    <input ref={videoFileRef} id="video-file" type="file" accept="video/*" onChange={onVideoFile} />
                    <label className="file-label" htmlFor="video-file" onClick={(e) => { e.stopPropagation(); videoFileRef.current?.click() }}>
                      <Icon name="upload" size={18} />
                      {t('editor.videoUpload')}
                    </label>
                    {(isDataVideoUrl(form.mediaUrl) || isIdbUrl(form.mediaUrl)) && (
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => set('mediaUrl', '')}>
                        {t('editor.videoRemove')}
                      </button>
                    )}
                  </div>
                  {videoFileMeta && (
                    <span className="hint" style={{ display: 'block' }}>{t('editor.videoSize', { size: formatMb(videoFileMeta.size) })}</span>
                  )}
                  {videoUploadError && <span className="form-error" style={{ marginBottom: 0 }}>{videoUploadError}</span>}
                  <span className="hint">{t('editor.videoUploadHint')}</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="status">{t('editor.status')}</label>
                <select
                  id="status"
                  className="select"
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                >
                  <option value="draft">{t('editor.statusDraft')}</option>
                  {!isAuthor && <option value="review">{t('editor.statusReview')}</option>}
                  {mayPublish && <option value="published">{t('editor.statusPublished')}</option>}
                  {mayPublish && <option value="archived">{t('editor.statusArchived')}</option>}
                  {isAuthor && <option value="review">{t('editor.statusReview')}</option>}
                </select>
              </div>
              <span className="hint" style={{ display: 'block' }}>
                {isAuthor && previousStatus === 'published' && form.status === 'draft'
                  ? t('editor.hintReviewBack')
                  : form.status === 'published'
                    ? t('editor.hintPublished')
                    : form.status === 'review'
                      ? t('editor.hintReview')
                      : form.status === 'archived'
                        ? t('editor.hintArchived')
                        : t('editor.hintDraft')}
              </span>
              <div className="field" style={{ marginTop: 18 }}>
                <label htmlFor="authorId">{t('admin.authors')}</label>
                <select
                  id="authorId"
                  className="select"
                  value={form.authorId}
                  onChange={(e) => {
                    const id = e.target.value
                    const author = authors.find((a) => a.id === id)
                    set('authorId', id)
                    set('author', author ? author.name : form.author)
                  }}
                >
                  <option value="">—</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="author">{t('editor.author')}</label>
                <input
                  id="author"
                  className="input"
                  value={form.author}
                  onChange={(e) => set('author', e.target.value)}
                  placeholder={t('editor.authorPh')}
                />
              </div>
              <label className="check-row" htmlFor="recommended">
                <input
                  id="recommended"
                  type="checkbox"
                  checked={form.recommended}
                  onChange={(e) => set('recommended', e.target.checked)}
                />
                {t('editor.recommended')}
              </label>
              <span className="hint" style={{ display: 'block', marginTop: 6 }}>{t('editor.recommendedHint')}</span>
            </div>

            {form.mediaType === 'video' && (
              <div className="panel" style={{ marginBottom: 20 }}>
                <h2>{t('editor.videoPreview')}</h2>
                {form.mediaUrl.trim() ? (
                  <div className="video-preview">
                    <VideoPlayer url={form.mediaUrl.trim()} poster={form.image} title={form.title || t('editor.videoPreview')} autoStart />
                  </div>
                ) : (
                  <div className="video-preview video-preview-empty">
                    <span className="video-play" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                    <p className="video-hint">{t('editor.videoPreviewEmpty')}</p>
                  </div>
                )}
              </div>
            )}

            <div className="panel">
              <h2>{form.mediaType === 'video' ? t('editor.poster') : t('editor.cover')}</h2>
              <div className="cover-preview">
                <div className={coverClass}>
                  {form.image ? (
                    <OptimizedImage src={form.image} alt="" widths={[640, 960, 1600]} sizes="100vw" />
                  ) : (
                    <OptimizedImage src={coverFor(form, currentCategory?.slug || '')} alt="" widths={[640, 960, 1600]} sizes="100vw" />
                  )}
                </div>
              </div>
              <div className="cover-upload">
                <input ref={fileRef} id="cover-file" type="file" accept="image/*" onChange={onFile} />
                <label className="file-label" htmlFor="cover-file" onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}>
                  <Icon name="upload" size={18} />
                  {form.image ? t('editor.replace') : t('editor.upload')}
                </label>
                {form.image && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={removeCurrentCover}>
                    {t('editor.remove')}
                  </button>
                )}
                {uploadError && <span className="form-error" style={{ marginBottom: 0 }}>{uploadError}</span>}
                <span className="hint">{form.mediaType === 'video' ? t('editor.posterHint') : t('editor.uploadHint')}</span>
              </div>
            </div>

            {form.mediaType === 'photo' && (
              <div className="panel" style={{ marginTop: 20 }}>
                <h2>{t('editor.gallery')}</h2>
                <p className="hint" style={{ marginTop: 0 }}>{t('editor.galleryHint')}</p>
                {form.gallery.length > 0 ? (
                  <div className="gallery-admin">
                    {form.gallery.map((src, i) => (
                      <div className="gallery-admin-item" key={`${src}-${i}`}>
                        <OptimizedImage src={src} alt="" widths={[160, 320]} sizes="96px" />
                        <button type="button" className="icon-btn danger" onClick={() => removeGalleryItem(i)} title={t('aadmin.delete')}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint">{t('editor.galleryEmpty')}</p>
                )}
                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <input
                    className="input"
                    dir="ltr"
                    value={galleryUrl}
                    onChange={(e) => setGalleryUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={addGalleryUrl}>
                      <Icon name="plus" size={14} /> {t('editor.addImage')}
                    </button>
                    <input ref={galleryFileRef} id="gallery-file" type="file" accept="image/*" onChange={onGalleryFile} style={{ display: 'none' }} />
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => galleryFileRef.current?.click()}>
                      <Icon name="upload" size={14} /> {t('editor.upload')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="row-actions" style={{ marginTop: 20, justifyContent: 'flex-start' }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <Icon name="check" size={16} /> {saving ? t('editor.saving') : t('editor.save')}
              </button>
              <Link className="btn btn-ghost" to="/admin/artikel">{t('editor.cancel')}</Link>
            </div>
          </div>
        </div>
      </form>

      {cloudEnabled && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h2>{t('editor.translations')}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            {t('editor.translationsHint')} {t('editor.trOrigin')}:{' '}
            {LANGUAGES.find((l) => l.code === sourceLang)?.label || sourceLang}
          </p>
          <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={Boolean(trBusy)}
              onClick={autoTranslateAll}
            >
              <Icon name="refresh" size={14} /> {t('editor.trAutoAll')}
            </button>
            {trBusy === 'all' && <span className="hint">{t('editor.trAutoAllBusy')}</span>}
          </div>
          {trStatus && <span className="form-error" style={{ marginBottom: 0 }}>{trStatus}</span>}
          {trLoading ? (
            <p className="hint">{'…'}</p>
          ) : (
            <div className="tr-grid">
              {LANGUAGES.filter((l) => l.code !== sourceLang).map((l) => {
                const entry = tr[l.code]
                const kind = !entry ? 'missing' : entry.kind
                const badgeCls =
                  kind === 'manual' ? 'badge-success' : kind === 'auto' ? 'badge-info' : 'badge-warning'
                const badgeLabel =
                  kind === 'manual'
                    ? t('editor.trManual')
                    : kind === 'auto'
                      ? t('editor.trAuto')
                      : kind === 'pending'
                        ? t('editor.trPendingBadge')
                        : t('editor.trMissing')
                return (
                  <div className="tr-block" key={l.code}>
                    <div className="tr-head">
                      <strong>{l.label}</strong>
                      <span className={`badge ${badgeCls}`}>{badgeLabel}</span>
                      {entry && entry.sourceHash && entry.sourceHash !== currentSourceHash && (
                        <span className="hint" style={{ color: 'var(--danger, #c0392b)' }}>
                          {t('editor.trStaleHint')}
                        </span>
                      )}
                    </div>
                    {entry && entry.kind === 'pending' ? (
                      <p className="hint">{t('editor.trPendingHint')}</p>
                    ) : entry ? (
                      <>
                        <div className="field">
                          <label htmlFor={`tr-title-${l.code}`}>{t('editor.title')}</label>
                          <input
                            id={`tr-title-${l.code}`}
                            className="input"
                            dir={l.dir}
                            value={entry.title}
                            onChange={(e) => setTrField(l.code, 'title', e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`tr-intro-${l.code}`}>{t('editor.intro')}</label>
                          <textarea
                            id={`tr-intro-${l.code}`}
                            className="textarea"
                            dir={l.dir}
                            value={entry.intro}
                            onChange={(e) => setTrField(l.code, 'intro', e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`tr-body-${l.code}`}>
                            {t('editor.body')} <em className="hint">({t('editor.trBodyOpt')})</em>
                          </label>
                          <textarea
                            id={`tr-body-${l.code}`}
                            className="textarea large"
                            dir={l.dir}
                            value={entry.body}
                            onChange={(e) => setTrField(l.code, 'body', e.target.value)}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="hint">{t('editor.trMissingHint')}</p>
                    )}
                    <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        disabled={Boolean(trBusy)}
                        onClick={() => autoTranslate(l.code)}
                      >
                        <Icon name="refresh" size={14} /> {t('editor.trAutoBtn')}
                      </button>
                      {!entry && (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyOriginal(l.code)}>
                          <Icon name="copy" size={14} /> {t('editor.trCopy')}
                        </button>
                      )}
                      {entry && (
                        <button className="btn btn-primary btn-sm" type="button" onClick={() => saveTr(l.code)}>
                          <Icon name="check" size={14} /> {t('editor.trSave')}
                        </button>
                      )}
                      {entry && kind === 'manual' && (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => deleteTr(l.code)}>
                          <Icon name="trash" size={14} /> {t('editor.trDelete')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h2>{t('editor.preview')}</h2>
          <div className="preview-box">
            {currentCategory && <span className={`pill cat-${currentCategory.slug}`}>{tCategory(currentCategory)}</span>}
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 34, marginTop: 12 }}>{form.title || t('editor.previewTitle')}</h1>
            <p className="lead" style={{ color: 'var(--ink-soft)', fontSize: 18 }}>{form.intro}</p>
            <div className="prose">{form.body ? renderBody(form.body) : <p>{t('editor.emptyBody')}</p>}</div>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />

      {trProgress && (
        <div className="tr-progress-overlay">
          <div className="tr-progress-box">
            <h3>
              {trProgress.phase === 'saving' && t('editor.trProgressSaving')}
              {trProgress.phase === 'translating' && t('editor.trProgressTranslating')}
              {trProgress.phase === 'done' &&
                (form.status === 'published'
                  ? t('editor.trPublishedOk')
                  : existing
                    ? t('editor.saved')
                    : t('editor.created'))}
            </h3>
            <div className="tr-progress-list">
              {trProgress.langs.map((l) => {
                const st = trProgress.statuses[l.code] || 'pending'
                const icon = st === 'done' ? '✓' : st === 'failed' ? '✗' : st === 'working' ? '⏳' : '○'
                const label =
                  st === 'done'
                    ? t('editor.trStDone')
                    : st === 'failed'
                      ? t('editor.trStFailed')
                      : st === 'working'
                        ? t('editor.trStWorking')
                        : t('editor.trStPending')
                return (
                  <div className="tr-progress-row" key={l.code}>
                    <span className="tr-progress-lang">{l.label}</span>
                    <span className={`tr-progress-status tr-progress-${st}`}>
                      <span className="tr-progress-icon">{icon}</span>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
            {trProgress.phase === 'done' && trProgress.failedCount > 0 && (
              <p className="tr-progress-fail">{t('editor.trFailedHint')}</p>
            )}
          </div>
        </div>
      )}

      {editImage && (
        <ImageEditorModal
          src={editImage.src}
          title={editImage.mode === 'gallery' ? t('editor.galleryEdit') : t('editor.editorTitle')}
          defaultAspect="16:9"
          onApply={applyEditedImage}
          onClose={() => setEditImage(null)}
        />
      )}
    </div>
  )
}
