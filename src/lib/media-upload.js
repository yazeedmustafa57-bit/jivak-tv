// Einheitlicher Upload-Pfad für Medien:
//   1. Cloud (Supabase Storage), wenn konfiguriert → öffentliche URL.
//   2. Lokal (IndexedDB für Videos / data-URL für Bilder) als Fallback.
import { cloudStorageEnabled, uploadToCloud } from './cloud-storage.js'
import { idbPut } from './blobstore.js'

export async function saveMediaFile(file, folder = 'media') {
  if (cloudStorageEnabled) {
    const res = await uploadToCloud(file, folder)
    if (res.ok) return { ok: true, url: res.url, source: 'cloud' }
    // Wichtig: Bei aktivem Cloud-Speicher KEIN stiller Fallback in den lokalen
    // Browser-Speicher – so ein Video wäre nur lokal sichtbar, aber nicht für
    // Besucher. Stattdessen den Fehler klar an die Oberfläche geben.
    return { ...res, ok: false }
  }
  const id = await idbPut(file)
  return { ok: true, url: `idb://${id}`, source: 'local' }
}

/** Bilder: Cloud-URL wenn möglich, sonst data-URL (kleine Dateien). */
export async function saveImageFile(file, folder = 'images') {
  if (cloudStorageEnabled) {
    const res = await uploadToCloud(file, folder)
    if (res.ok) return { ok: true, url: res.url, source: 'cloud' }
    // Bei aktivem Cloud-Speicher KEIN stiller data-URL-Fallback: ein nur im
    // eigenen Browser sichtbares Bild wäre für Besucher unsichtbar und würde
    // die Artikel-Datensätze aufblähen. Stattdessen den Fehler klar melden.
    return { ...res, ok: false }
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ ok: true, url: reader.result, source: 'local' })
    reader.onerror = () => resolve({ ok: false, message: 'read-failed' })
    reader.readAsDataURL(file)
  })
}
