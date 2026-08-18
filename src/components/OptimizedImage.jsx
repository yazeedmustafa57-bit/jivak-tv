// Responsive, optimiertes Bild (WebP + srcset).
// Nur Remote-Bilder (Supabase/YouTube) werden über /api/image optimiert;
// Platzhalter (data:), lokale Blobs (idb://, blob:) bleiben unverändert.
import { canOptimizeImage, imageSrcSet, optimizeImageUrl } from '../lib/imageOpt.js'
import { useRef, useState } from 'react'
import { logError } from '../lib/errorLog.js'

export default function OptimizedImage({ src, alt = '', widths, sizes = '100vw', fallback, ...rest }) {
  const can = canOptimizeImage(src)
  const list = widths && widths.length > 0 ? widths : [480, 800, 1200, 1920]
  const [stage, setStage] = useState(0)
  const brokenLogged = useRef(new Set())
  if (stage === 2 && fallback) {
    return <img src={fallback} alt={alt} loading="lazy" decoding="async" {...rest} />
  }
  const useOptimized = can && stage === 0
  const srcSet = useOptimized ? imageSrcSet(src, list) : undefined
  const handleError = () => {
    if (can && stage === 0) setStage(1)
    else if (fallback) {
      setStage(2)
      // Kaputte Bild-URLs (z. B. gelöschte Storage-Datei) im Crash-Protokoll
      // festhalten, damit der Admin sie sieht – pro URL nur einmal.
      if (src && !brokenLogged.current.has(src)) {
        brokenLogged.current.add(src)
        logError('image-broken', new Error('Bild nicht ladbar: ' + String(src).slice(0, 300)))
      }
    }
  }
  return (
    <img
      src={useOptimized ? optimizeImageUrl(src, list[0]) : src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={handleError}
      {...rest}
    />
  )
}
