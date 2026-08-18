import { useEffect, useState } from 'react'

/**
 * Weichgezeichneter Video-Hintergrund im Instagram-/Shorts-Stil:
 *  - Prüft, ob das Seitenverhältnis des Videos nicht zum Container passt
 *    (Hochformat in Querformat-Container). Nur dann wird der Hintergrund
 *    benötigt – normale 16:9-Videos bleiben unverändert.
 *  - Synchronisiert die (geblurrte) Hintergrund-Kopie mit dem
 *    Vordergrund-Video (Play/Pause/Seek + regelmäßige Zeit-Korrektur),
 *    damit es nicht wie zwei getrennte Videos wirkt.
 *
 * @param {import('react').RefObject} fgRef   Ref auf das Vordergrund-<video>
 * @param {import('react').RefObject} wrapRef Ref auf den Video-Container
 * @param {import('react').RefObject} bgRef   Ref auf die Hintergrund-<video>-Kopie
 * @param {boolean} active                    Soll geprüft/synchronisiert werden?
 * @returns {boolean} needsBg                 true = Hintergrund-Kopie anzeigen
 */
export default function useBlurBackdrop(fgRef, wrapRef, bgRef, active = true) {
  const [needsBg, setNeedsBg] = useState(false)

  // 1) Seitenverhältnis Video vs. Container prüfen
  useEffect(() => {
    const v = fgRef.current
    const wrap = wrapRef.current
    if (!v || !wrap || !active) return undefined

    const check = () => {
      const videoW = v.videoWidth
      const videoH = v.videoHeight
      const boxW = wrap.clientWidth
      const boxH = wrap.clientHeight
      if (!videoW || !videoH || !boxW || !boxH) return
      const videoAR = videoW / videoH
      const boxAR = boxW / boxH
      setNeedsBg(Math.abs(videoAR - boxAR) > 0.05)
    }

    v.addEventListener('loadedmetadata', check)
    check()
    return () => v.removeEventListener('loadedmetadata', check)
  }, [fgRef, wrapRef, active])

  // 2) Hintergrund-Kopie mit dem Vordergrund-Video synchron halten
  useEffect(() => {
    const fg = fgRef.current
    const bg = bgRef.current
    if (!active || !needsBg || !fg || !bg) return undefined

    const sync = () => {
      try {
        if (bg.readyState < 2) return
        if (bg.paused && !fg.paused) {
          bg.muted = true
          const p = bg.play()
          if (p) p.catch(() => {})
        }
        if (Math.abs(bg.currentTime - fg.currentTime) > 0.25) {
          bg.currentTime = fg.currentTime
        }
      } catch {
        /* Video noch nicht bereit – nächster Sync-Versuch wartet */
      }
    }
    const onPlay = () => {
      bg.muted = true
      const p = bg.play()
      if (p) p.catch(() => {})
    }
    const onPause = () => {
      if (!bg.paused) bg.pause()
    }

    fg.addEventListener('play', onPlay)
    fg.addEventListener('playing', onPlay)
    fg.addEventListener('pause', onPause)
    fg.addEventListener('seeked', sync)
    fg.addEventListener('timeupdate', sync)
    return () => {
      fg.removeEventListener('play', onPlay)
      fg.removeEventListener('playing', onPlay)
      fg.removeEventListener('pause', onPause)
      fg.removeEventListener('seeked', sync)
      fg.removeEventListener('timeupdate', sync)
    }
  }, [fgRef, bgRef, active, needsBg])

  return needsBg
}
