import { useEffect, useRef } from 'react'

/**
 * Auto-Play beim Scrollen (Intersection Observer API):
 * Das überwachte Container-Element spielt ein darin liegendes <video>
 * automatisch ab, sobald es in den sichtbaren Bereich kommt, und pausiert
 * es, sobald es den Bildschirm verlässt. Browser erlauben Autoplay nur
 * stumm – den Ton schaltet der Nutzer selbst über die Player-Steuerung frei.
 *
 * @param {import('react').RefObject} ref        Ref auf den beobachteten Container
 * @param {object}   options
 * @param {boolean}  options.enabled             Observer aktiv (z. B. bei Live TV aus)
 * @param {boolean}  options.autoStart           Video beim ersten Sichtbarwerden automatisch starten (muted)
 * @param {Function} options.getVideo            Gibt das aktuelle <video>-Element zurück
 * @param {Function} options.onAutoStart         Wird beim automatischen Start aufgerufen
 * @param {number}   options.threshold           Sichtbarkeits-Schwelle (0–1)
 */
export default function useAutoPlayInView(ref, {
  enabled = true,
  autoStart = false,
  getVideo = null,
  onAutoStart = null,
  threshold = 0.5,
} = {}) {
  const getVideoRef = useRef(getVideo)
  const onAutoStartRef = useRef(onAutoStart)
  getVideoRef.current = getVideo
  onAutoStartRef.current = onAutoStart
  const optsRef = useRef({ autoStart })
  optsRef.current.autoStart = autoStart

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return undefined

    let autoStarted = false

    const play = () => {
      const v = getVideoRef.current && getVideoRef.current()
      if (!v) return
      const p = v.play()
      if (p) p.catch(() => {
        v.muted = true
        v.play().catch(() => {})
      })
    }

    const pause = () => {
      const v = getVideoRef.current && getVideoRef.current()
      if (v) v.pause()
    }

    const startIfNeeded = () => {
      if (optsRef.current.autoStart && !autoStarted) {
        autoStarted = true
        if (onAutoStartRef.current) onAutoStartRef.current()
      }
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          startIfNeeded()
          play()
        } else {
          pause()
        }
      }
    }, { threshold })

    observer.observe(el)
    // Der Observer meldet den aktuellen Zustand bereits beim ersten Callback –
    // ein bereits sichtbares Video startet dadurch automatisch.

    return () => observer.disconnect()
  }, [ref, enabled, threshold])
}
