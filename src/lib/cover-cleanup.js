/**
 * Aufräumen ersetzter/entfernter Titelbilder aus dem Cloud-Speicher (Supabase).
 *
 * WICHTIG (bekannte Vorgeschichte mit versehentlich gelöschten Bildern):
 *  - Die Löschung wird NUR nach erfolgreichem Speichern des Artikels ausgelöst,
 *    damit ein Abbruch im Editor nie ein noch aktives Bild löscht.
 *  - Vor jedem Löschen wird gegen die Cloud geprüft (nicht nur lokaler Cache),
 *    ob ein ANDERER Artikel die Datei noch referenziert.
 *  - Löschfehler blockieren das Speichern nie – sie werden nur ins
 *    Crash-Protokoll geschrieben.
 *
 * Das Modul hat keine eigenen Imports (injektierte Abhängigkeiten), damit die
 * Entscheidungslogik in Node direkt getestet werden kann.
 */

/** Filtert die zu löschenden URLs: die finale Bild-/Galerie-URL wird nie gelöscht. */
export function selectRetiredCovers(retiredUrls, finalImage, finalGallery) {
  const keep = new Set([finalImage, ...(Array.isArray(finalGallery) ? finalGallery : [])].filter(Boolean))
  return [...new Set(retiredUrls || [])].filter((u) => u && !keep.has(u))
}

/** Prüft gegen die Cloud, ob eine Bild-URL noch von einem anderen Artikel verwendet wird. */
export async function cloudUrlUsedElsewhere(supabase, url, currentId) {
  try {
    const { data } = await supabase.from('articles').select('id,image,gallery')
    return (data || []).some(
      (a) => a && a.id !== currentId && (a.image === url || (Array.isArray(a.gallery) && a.gallery.includes(url)))
    )
  } catch {
    // Konservativ: bei fehlgeschlagener Abfrage nicht löschen.
    return true
  }
}

/**
 * Löscht ersetzte/entfernte Titelbilder aus dem Cloud-Speicher.
 * Wirft nie: Fehler werden über `logError` ins Crash-Protokoll geschrieben.
 * Liefert { deleted, skipped } für Tests/Debugging.
 */
export async function cleanupRetiredCoverFiles({
  retiredUrls,
  currentId,
  finalImage,
  finalGallery,
  supabase,
  cloudItemFromUrl,
  deleteCloudImage,
  logError,
  onDeleted
}) {
  const urls = selectRetiredCovers(retiredUrls, finalImage, finalGallery)
  const deleted = []
  const skipped = []
  for (const url of urls) {
    try {
      // Schutzmechanismus: Cloud-Wahrheit prüfen – löschen nur, wenn kein
      // anderer Artikel die Datei mehr braucht.
      if (await cloudUrlUsedElsewhere(supabase, url, currentId)) {
        skipped.push(url)
        continue
      }
      const item = cloudItemFromUrl ? cloudItemFromUrl(url) : null
      if (!item) continue
      const res = await deleteCloudImage(item)
      if (!res || !res.ok) throw new Error((res && res.message) || 'delete-fail')
      deleted.push(url)
      if (onDeleted) onDeleted(url)
    } catch (err) {
      if (logError) logError('cover-cleanup', err, { file: 'ArticleEditor.jsx' })
    }
  }
  return { deleted, skipped }
}
