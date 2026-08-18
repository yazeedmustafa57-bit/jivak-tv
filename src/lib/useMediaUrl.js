import { useEffect, useState } from 'react'
import { isIdbUrl, idbGet, idbIdFromUrl } from './blobstore.js'

/**
 * Löst idb://<id>-Referenzen zu Objekt-URLs auf (für <video>/<img> src).
 * Alle anderen URLs (https, data:, …) bleiben unverändert.
 */
export function useMediaUrl(url) {
  const [resolved, setResolved] = useState(isIdbUrl(url) ? '' : url)

  useEffect(() => {
    if (!isIdbUrl(url)) {
      setResolved(url)
      return undefined
    }
    let objectUrl = null
    let cancelled = false
    setResolved('')
    idbGet(idbIdFromUrl(url))
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setResolved(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return resolved
}
