import { useEffect, useState } from 'react'
import { getLiveTv } from '../lib/store.js'
import { useI18n } from '../lib/i18n.jsx'
import { useStoreVersion } from '../lib/useStore.js'
import { useLiveTvL10n } from '../lib/useLiveTvL10n.jsx'
import Seo from '../components/Seo.jsx'
import VideoPlayer from '../components/VideoPlayer.jsx'

function currentProgram(programs, now) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const list = [...programs].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
  for (const p of list) {
    const [h, m] = String(p.time || '').split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) continue
    const start = h * 60 + m
    const end = start + 90
    if (minutes >= start && minutes < end) return p
  }
  return null
}

export default function LiveTv() {
  useStoreVersion()
  const { t } = useI18n()
  const [now, setNow] = useState(() => new Date())
  const live = getLiveTv()
  const tr = useLiveTvL10n(live)
  const enabled = Boolean(live.enabled && live.streamUrl)
  const liveTitle = tr('live:title', live.title)
  const channelName = liveTitle || t('liveTv.title')

  // "Jetzt live"-Anzeige aktualisiert sich jede Minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const programs = [...(live.programs || [])].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
  const current = currentProgram(programs, now)

  return (
    <div>
      <Seo title={t('liveTv.title')} description={t('seo.desc')} path="/live" />
      <section className="page-head">
        <div className="container">
          <h1>{t('liveTv.title')}</h1>
          <p>{t('liveTv.sub')}</p>
        </div>
      </section>

      <div className="container" style={{ paddingBottom: 72 }}>
        <div className="live-stage">
          <div className="live-stage-top">
            <span className="live-badge">
              <span className="live-dot" aria-hidden="true" />
              {t('liveTv.liveBadge')}
            </span>
            <span className="live-now">
              {current ? (
                <>
                  <strong>{t('liveTv.liveNow')}:</strong> {tr('live:prog:' + current.time, current.title)}
                </>
              ) : enabled ? (
                <>
                  <strong>{t('liveTv.liveNow')}:</strong> {channelName}
                </>
              ) : (
                t('liveTv.offline')
              )}
            </span>
          </div>

          {enabled ? (
            <div className="video-stage live-player">
              <VideoPlayer url={live.streamUrl} poster={live.poster || null} title={liveTitle || t('liveTv.title')} autoStart loop autoPlayOnScroll={false} />
            </div>
          ) : (
            <div className="live-offline" role="status">
              <span className="video-play" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <p>{t('liveTv.offlineText')}</p>
            </div>
          )}

          {channelName && <h2 className="live-title">{channelName}</h2>}
        </div>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <h2>{t('liveTv.program')}</h2>
                <p>{t('liveTv.programSub')}</p>
              </div>
            </div>
            {programs.length > 0 ? (
              <div className="program-list">
                <div className="program-row program-head">
                  <span>{t('liveTv.today')}</span>
                </div>
                {programs.map((p, i) => {
                  const running = current && current.time === p.time
                  return (
                    <div className={`program-row ${running ? 'active' : ''}`} key={`${p.time}-${i}`}>
                      <span className="program-time">{p.time || '--:--'}</span>
                      <span className="program-title">{tr('live:prog:' + p.time, p.title) || '—'}</span>
                      {running && <span className="live-flag">{t('liveTv.liveNow')}</span>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state">
                <p>{t('liveTv.noProgram')}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
