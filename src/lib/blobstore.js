// Browser-Blob-Speicher (IndexedDB) für hochgeladene Videos.
// Ermöglicht Uploads ohne Größenlimit (Browser-Quota, meist mehrere GB).
const DB_NAME = 'jivak-tv-blobs'
const STORE = 'blobs'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB öffnen fehlgeschlagen'))
  })
}

/** Erkennt Blob-Referenzen (idb://<id>). */
export function isIdbUrl(input) {
  return typeof input === 'string' && input.startsWith('idb://')
}

export function idbIdFromUrl(url) {
  return isIdbUrl(url) ? url.slice('idb://'.length) : null
}

/** Speichert einen Blob und liefert die Referenz idb://<id>. */
export async function idbPut(blob) {
  const db = await openDb()
  const id = `blob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Blob speichern fehlgeschlagen'))
      tx.onabort = () => reject(tx.error || new Error('Blob speichern abgebrochen'))
    })
  } finally {
    db.close()
  }
  return id
}

/** Liest einen gespeicherten Blob. */
export async function idbGet(id) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error || new Error('Blob lesen fehlgeschlagen'))
    })
  } finally {
    db.close()
  }
}

/** Löscht einen gespeicherten Blob (gibt Speicher frei). */
export async function idbDelete(id) {
  const db = await openDb()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Blob löschen fehlgeschlagen'))
      tx.onabort = () => reject(tx.error || new Error('Blob löschen abgebrochen'))
    })
  } finally {
    db.close()
  }
}
