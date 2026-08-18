import { useState } from 'react'
import { changePassword, exportData, resetData, getSettings, saveSettings, getPublishedArticles } from '../../lib/store.js'
import { Icon, Modal, Toast, PasswordField } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'
import { translateArticle, detectArticleLang } from '../../lib/translate.js'
import { useStoreVersion } from '../../lib/useStore.js'

export default function AdminSettings() {
  useStoreVersion()
  const { t, formatDate } = useI18n()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwOk, setPwOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [showReset, setShowReset] = useState(false)
  const settings = getSettings()
  const published = getPublishedArticles()
  const [liveTv, setLiveTv] = useState({
    enabled: Boolean(settings.liveTv.enabled),
    streamUrl: settings.liveTv.streamUrl || '',
    poster: settings.liveTv.poster || '',
    title: settings.liveTv.title || '',
    programs: Array.isArray(settings.liveTv.programs)
      ? settings.liveTv.programs.map((p) => ({ time: p.time || '', title: p.title || '' }))
      : []
  })
  const [liveSaved, setLiveSaved] = useState(false)
  const [liveError, setLiveError] = useState('')
  const TICKER_FIELDS = [
    { code: 'ar', field: 'titleAr' },
    { code: 'ku', field: 'titleKu' },
    { code: 'en', field: 'titleEn' },
    { code: 'de', field: 'titleDe' }
  ]
  const LANG_NAMES = { ar: 'العربية', ku: 'کوردی (بادینی)', en: 'English', de: 'Deutsch' }
  function blankTickerItem() {
    return {
      clientId: 'tk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      titleAr: '', titleKu: '', titleEn: '', titleDe: '',
      linkType: 'none', articleId: '', url: '', enabled: true
    }
  }
  const [ticker, setTicker] = useState({
    autoArticles: settings.ticker ? settings.ticker.autoArticles !== false : true,
    excludeArticleIds: Array.isArray(settings.ticker && settings.ticker.excludeArticleIds)
      ? settings.ticker.excludeArticleIds
      : [],
    items: (Array.isArray(settings.ticker && settings.ticker.items) ? settings.ticker.items : []).map((i, idx) => ({
      clientId: i.clientId || 'tk-load-' + idx,
      titleAr: i.titleAr || '', titleKu: i.titleKu || '', titleEn: i.titleEn || '', titleDe: i.titleDe || '',
      linkType: i.linkType || 'none', articleId: i.articleId || '', url: i.url || '', enabled: i.enabled !== false
    }))
  })
  const autoArticleRows = published
    .filter((a) => a.slug && a.title && !ticker.excludeArticleIds.includes(a.id))
    .slice(0, 15)
  const excludedArticleRows = published.filter((a) => ticker.excludeArticleIds.includes(a.id))
  const [tickerBusy, setTickerBusy] = useState(false)
  const [tickerBusyIdx, setTickerBusyIdx] = useState(null)
  const [tickerSaved, setTickerSaved] = useState(false)

  function setTickerItem(i, patch) {
    setTicker((v) => {
      const items = [...v.items]
      items[i] = { ...items[i], ...patch }
      return { ...v, items }
    })
  }

  function onExcludeArticle(id) {
    setTicker((v) => ({
      ...v,
      excludeArticleIds: v.excludeArticleIds.includes(id) ? v.excludeArticleIds : [...v.excludeArticleIds, id]
    }))
  }

  function onRestoreArticle(id) {
    setTicker((v) => ({ ...v, excludeArticleIds: v.excludeArticleIds.filter((x) => x !== id) }))
  }

  function onClearExcluded() {
    setTicker((v) => ({ ...v, excludeArticleIds: [] }))
  }

  function onMoveTickerItem(i, dir) {
    setTicker((v) => {
      const items = [...v.items]
      const j = i + dir
      if (j < 0 || j >= items.length) return v
      const tmp = items[i]
      items[i] = items[j]
      items[j] = tmp
      return { ...v, items }
    })
  }

  async function translateTickerItem(item) {
    const source = TICKER_FIELDS.find((l) => (item[l.field] || '').trim())
    if (!source) return item
    const srcLang = detectArticleLang(item[source.field])
    const missing = TICKER_FIELDS.filter((l) => l.code !== srcLang && !(item[l.field] || '').trim())
    if (missing.length === 0) return item
    const out = { ...item }
    await Promise.all(missing.map(async (l) => {
      try {
        const res = await translateArticle(
          { id: item.clientId, title: item[source.field], intro: '', body: '' },
          l.code
        )
        if (res && res.kind && res.kind !== 'missing' && String(res.title || '').trim()) {
          out[l.field] = res.title
        }
      } catch {
        /* Übersetzungsfehler: manueller Text bleibt erhalten */
      }
    }))
    return out
  }

  async function onAutoTranslateItem(i) {
    setTickerBusyIdx(i)
    const next = await translateTickerItem(ticker.items[i])
    setTickerBusyIdx(null)
    setTickerItem(i, next)
  }

  async function onSaveTicker(e) {
    e.preventDefault()
    setTickerBusy(true)
    let items = ticker.items
    const need = items.filter((it) => TICKER_FIELDS.some((l) => (it[l.field] || '').trim()))
    if (need.length > 0) {
      const translated = await Promise.all(need.map(translateTickerItem))
      const byId = new Map(translated.map((it) => [it.clientId, it]))
      items = items.map((it) => byId.get(it.clientId) || it)
    }
    const cleaned = items
      .filter((it) => TICKER_FIELDS.some((l) => (it[l.field] || '').trim()))
      .map((it) => ({
        clientId: it.clientId,
        titleAr: (it.titleAr || '').trim(),
        titleKu: (it.titleKu || '').trim(),
        titleEn: (it.titleEn || '').trim(),
        titleDe: (it.titleDe || '').trim(),
        linkType: it.linkType || 'none',
        articleId: it.articleId || '',
        url: (it.url || '').trim(),
        enabled: it.enabled !== false
      }))
    saveSettings({
      ticker: {
        items: cleaned,
        autoArticles: ticker.autoArticles,
        excludeArticleIds: ticker.excludeArticleIds
      }
    })
    setTicker((v) => ({ ...v, items: cleaned }))
    setTickerBusy(false)
    setTickerSaved(true)
    setTimeout(() => setTickerSaved(false), 2500)
  }

  function onLiveChange(field, value) {
    setLiveTv((v) => ({ ...v, [field]: value }))
    setLiveError('')
  }

  function onSaveLive(e) {
    e.preventDefault()
    if (liveTv.enabled && liveTv.streamUrl.trim() && !/^(https?:\/\/)/i.test(liveTv.streamUrl.trim())) {
      setLiveError(t('mediaLib.urlErr'))
      return
    }
    const livePayload = {
      enabled: liveTv.enabled,
      streamUrl: liveTv.streamUrl.trim(),
      poster: liveTv.poster,
      title: liveTv.title.trim(),
      programs: liveTv.programs.filter((p) => p.time && p.title)
    }
    saveSettings({ liveTv: livePayload })
    setLiveSaved(true)
    setTimeout(() => setLiveSaved(false), 2200)
  }

  async function onPassword(e) {
    e.preventDefault()
    setPwError('')
    setPwOk('')
    if (pw.next !== pw.confirm) {
      setPwError(t('set.pwMismatch'))
      return
    }
    setBusy(true)
    const result = await changePassword(pw.current, pw.next)
    setBusy(false)
    if (result.ok) {
      setPw({ current: '', next: '', confirm: '' })
      setPwOk(t('set.pwChanged'))
    } else {
      setPwError(t(result.errorKey || 'set.errorWrongCurrent'))
    }
  }

  function onExport() {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jivak-tv-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToast(t('set.exported'))
  }

  function onReset() {
    resetData()
    setShowReset(false)
    setToast(t('set.resetDone'))
  }

  return (
    <div>
      <div className="admin-topbar">
        <div>
          <h1>{t('set.title')}</h1>
          <div className="sub">{t('set.sub')}</div>
        </div>
      </div>

      <div className="editor-grid">
        <div>
          <div className="panel">
            <h2>{t('set.ticker')}</h2>
            <p className="hint" style={{ marginTop: 0 }}>{t('set.tickerSub')}</p>

            <div className="ticker-section-label">
              <Icon name="artikel" size={16} /> {t('set.tickerAutoTitle')}
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="check-row" htmlFor="ticker-auto">
                <input
                  id="ticker-auto"
                  type="checkbox"
                  checked={ticker.autoArticles}
                  onChange={(e) => setTicker((v) => ({ ...v, autoArticles: e.target.checked }))}
                />
                {t('set.tickerAutoArticles')}
              </label>
            </div>
            {ticker.autoArticles && (
              <>
                <span className="hint" style={{ display: 'block', margin: 0, marginBottom: 10 }}>{t('set.tickerAutoArticlesSub')}</span>
                {autoArticleRows.length === 0 ? (
                  <p className="hint" style={{ marginTop: 0 }}>{t('set.tickerAutoEmpty')}</p>
                ) : (
                  <div className="breaking-admin-list">
                    {autoArticleRows.map((a, idx) => (
                      <div className="ticker-auto-row" key={a.id}>
                        <span className="ticker-index">{idx + 1}</span>
                        <span className="grow ticker-auto-title">{a.title}</span>
                        <span className="ticker-auto-date">{formatDate(a.createdAt)}</span>
                        <button
                          className="icon-btn danger"
                          type="button"
                          onClick={() => onExcludeArticle(a.id)}
                          title={t('set.tickerHideArticle')}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {excludedArticleRows.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <span className="hint" style={{ display: 'block', margin: 0, marginBottom: 8 }}>{t('set.tickerHiddenArticles')}</span>
                    <div className="breaking-admin-list">
                      {excludedArticleRows.map((a) => (
                        <div className="ticker-auto-row" key={a.id}>
                          <span className="ticker-index" style={{ opacity: 0.7 }}>✕</span>
                          <span className="grow ticker-auto-title" style={{ opacity: 0.7 }}>{a.title}</span>
                          <span className="ticker-auto-date">{formatDate(a.createdAt)}</span>
                          <button
                            className="icon-btn"
                            type="button"
                            onClick={() => onRestoreArticle(a.id)}
                            title={t('set.tickerRestoreArticle')}
                          >
                            <Icon name="plus" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-block" type="button" onClick={onClearExcluded} style={{ marginTop: 8 }}>
                      <Icon name="refresh" size={15} /> {t('set.tickerRestoreAll')}
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="ticker-section-label" style={{ marginTop: 20 }}>
              <Icon name="edit" size={16} /> {t('set.tickerManual')}
            </div>
            <span className="hint" style={{ display: 'block', margin: 0, marginBottom: 10 }}>{t('set.tickerOrderHint')}</span>
            {ticker.items.length === 0 ? (
              <p className="hint" style={{ marginTop: 0 }}>{t('set.tickerNoItems')}</p>
            ) : (
              <div className="breaking-admin-list">
                {ticker.items.map((item, i) => (
                  <div className="breaking-admin-item" key={item.clientId || i}>
                    <div className="ticker-item-head">
                      <span className="ticker-index">{i + 1}</span>
                      <label className="check-row" htmlFor={`ticker-enable-${i}`}>
                        <input
                          id={`ticker-enable-${i}`}
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(e) => setTickerItem(i, { enabled: e.target.checked })}
                        />
                        {t('set.tickerEnabled')}
                      </label>
                      <span className="grow" />
                      <span className="ticker-actions">
                        <button
                          className="icon-btn"
                          type="button"
                          disabled={i === 0}
                          onClick={() => onMoveTickerItem(i, -1)}
                          title={t('set.tickerMoveUp')}
                        >
                          <Icon name="up" size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          type="button"
                          disabled={i === ticker.items.length - 1}
                          onClick={() => onMoveTickerItem(i, 1)}
                          title={t('set.tickerMoveDown')}
                        >
                          <Icon name="down" size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          type="button"
                          onClick={() => setTicker((v) => ({ ...v, items: v.items.filter((_, x) => x !== i) }))}
                          title={t('set.tickerRemove')}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </span>
                    </div>
                    <div className="ticker-lang-grid">
                      {TICKER_FIELDS.map((l) => (
                        <div className="field" key={l.code}>
                          <label>{LANG_NAMES[l.code]}</label>
                          <input
                            className="input"
                            dir={l.code === 'ar' || l.code === 'ku' ? 'rtl' : 'ltr'}
                            value={item[l.field]}
                            onChange={(e) => setTickerItem(i, { [l.field]: e.target.value })}
                            placeholder={t('set.tickerTitlePh')}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="ticker-footer-row">
                      <div className="field">
                        <label>{t('set.tickerLink')}</label>
                        <select
                          className="select"
                          value={item.linkType || 'none'}
                          onChange={(e) => setTickerItem(i, { linkType: e.target.value })}
                        >
                          <option value="none">{t('set.tickerLinkNone')}</option>
                          <option value="article">{t('set.tickerLinkArticle')}</option>
                          <option value="url">{t('set.tickerLinkUrl')}</option>
                        </select>
                      </div>
                      {item.linkType === 'article' && (
                        <div className="field">
                          <label>{t('set.tickerArticle')}</label>
                          <select
                            className="select"
                            value={item.articleId}
                            onChange={(e) => setTickerItem(i, { articleId: e.target.value })}
                          >
                            <option value="">—</option>
                            {published.map((a) => (
                              <option key={a.id} value={a.id}>{a.title}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {item.linkType === 'url' && (
                        <div className="field">
                          <label>{t('set.tickerUrl')}</label>
                          <input
                            className="input"
                            dir="ltr"
                            value={item.url}
                            onChange={(e) => setTickerItem(i, { url: e.target.value })}
                            placeholder={t('set.tickerUrlPh')}
                          />
                        </div>
                      )}
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={tickerBusyIdx === i}
                        onClick={() => onAutoTranslateItem(i)}
                        title={t('set.tickerAutoHint')}
                      >
                        <Icon name="refresh" size={15} /> {tickerBusyIdx === i ? t('set.tickerTranslating') : t('set.tickerAuto')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <span className="hint" style={{ display: 'block', marginTop: 8 }}>{t('set.tickerSourceHint')}</span>
            <button
              className="btn btn-ghost btn-block"
              type="button"
              onClick={() => setTicker((v) => ({ ...v, items: [...v.items, blankTickerItem()] }))}
            >
              <Icon name="plus" size={16} /> {t('set.tickerAdd')}
            </button>
            <button
              className="btn btn-primary btn-block"
              type="button"
              style={{ marginTop: 14 }}
              disabled={tickerBusy}
              onClick={onSaveTicker}
            >
              {tickerBusy ? t('set.tickerTranslating') : t('set.tickerSave')}
            </button>
            {tickerSaved && (
              <div className="form-error" style={{ marginTop: 12, background: 'var(--success-soft)', color: 'var(--success)' }}>
                {t('set.tickerSaved')}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="panel" style={{ marginBottom: 20 }}>
            <h2>{t('set.liveTv')}</h2>
            <p className="hint" style={{ marginTop: 0 }}>{t('set.liveTvSub')}</p>
            {liveError && <div className="form-error">{liveError}</div>}
            <form onSubmit={onSaveLive}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="check-row" htmlFor="live-enabled">
                  <input
                    id="live-enabled"
                    type="checkbox"
                    checked={liveTv.enabled}
                    onChange={(e) => onLiveChange('enabled', e.target.checked)}
                  />
                  {t('set.liveTvEnabled')}
                </label>
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="live-url">{t('set.liveTvUrl')}</label>
                <input
                  id="live-url"
                  className="input"
                  dir="ltr"
                  value={liveTv.streamUrl}
                  onChange={(e) => onLiveChange('streamUrl', e.target.value)}
                  placeholder={t('set.liveTvUrlHint')}
                />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="live-poster">{t('set.liveTvPoster')}</label>
                <input
                  id="live-poster"
                  className="input"
                  dir="ltr"
                  value={liveTv.poster}
                  onChange={(e) => onLiveChange('poster', e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="live-title">{t('set.liveTvTitle')}</label>
                <input
                  id="live-title"
                  className="input"
                  value={liveTv.title}
                  onChange={(e) => onLiveChange('title', e.target.value)}
                />
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <span className="hint" style={{ margin: 0 }}>{t('set.liveTvProgram')}</span>
              </div>
              {liveTv.programs.length === 0 && (
                <p className="hint" style={{ marginTop: 0 }}>{t('liveTv.noProgram')}</p>
              )}
              {liveTv.programs.map((p, i) => (
                <div className="breaking-admin-row" key={i}>
                  <div className="field">
                    <label>{t('set.liveTvProgramTime')}</label>
                    <input
                      className="input"
                      dir="ltr"
                      value={p.time}
                      onChange={(e) => {
                        const programs = [...liveTv.programs]
                        programs[i] = { ...programs[i], time: e.target.value }
                        onLiveChange('programs', programs)
                      }}
                      placeholder="18:00"
                    />
                  </div>
                  <div className="field">
                    <label>{t('set.liveTvProgramName')}</label>
                    <input
                      className="input"
                      value={p.title}
                      onChange={(e) => {
                        const programs = [...liveTv.programs]
                        programs[i] = { ...programs[i], title: e.target.value }
                        onLiveChange('programs', programs)
                      }}
                    />
                  </div>
                  <button
                    className="icon-btn danger"
                    type="button"
                    onClick={() => onLiveChange('programs', liveTv.programs.filter((_, x) => x !== i))}
                    title={t('set.liveTvRemove')}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
              <button
                className="btn btn-ghost btn-block"
                type="button"
                onClick={() => onLiveChange('programs', [...liveTv.programs, { time: '', title: '' }])}
              >
                <Icon name="plus" size={16} /> {t('set.liveTvAddProgram')}
              </button>
              <button className="btn btn-primary btn-block" type="submit" style={{ marginTop: 14 }}>
                {t('set.liveTvSave')}
              </button>
              {liveSaved && (
                <div className="form-error" style={{ marginTop: 12, background: 'var(--success-soft)', color: 'var(--success)' }}>
                  {t('set.liveTvSaved')}
                </div>
              )}
            </form>
          </div>
          <div className="panel" style={{ marginBottom: 20 }}>
            <h2>{t('set.pwTitle')}</h2>
          {pwError && <div className="form-error">{pwError}</div>}
          {pwOk && <div className="form-error" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>{pwOk}</div>}
          <form onSubmit={onPassword}>
            <PasswordField
              id="current"
              label={t('set.current')}
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              autoComplete="current-password"
              required
            />
            <PasswordField
              id="next"
              label={t('set.next')}
              hint={t('set.nextHint')}
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <PasswordField
              id="confirm"
              label={t('set.confirm')}
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              autoComplete="new-password"
              required
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              <Icon name="key" size={16} /> {busy ? t('set.saving') : t('set.change')}
            </button>
          </form>
        </div>
          <div className="panel" style={{ marginBottom: 20 }}>
            <h2>{t('set.backup')}</h2>
            <p className="hint" style={{ marginTop: 0 }}>{t('set.backupText')}</p>
            <button className="btn btn-ghost btn-block" onClick={onExport}>
              <Icon name="download" size={16} /> {t('set.export')}
            </button>
          </div>
          <div className="panel">
            <h2>{t('set.danger')}</h2>
            <p className="hint" style={{ marginTop: 0 }}>{t('set.dangerText')}</p>
            <button className="btn btn-danger btn-block" onClick={() => setShowReset(true)}>
              <Icon name="trash" size={16} /> {t('set.reset')}
            </button>
          </div>
        </div>
      </div>
      <Modal
        open={showReset}
        title={t('set.resetTitle')}
        onClose={() => setShowReset(false)}
        onConfirm={onReset}
        confirmLabel={t('set.resetBtn')}
        danger
      >
        <p>{t('set.resetText')}</p>
      </Modal>
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
