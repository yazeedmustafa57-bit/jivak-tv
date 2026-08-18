import { useEffect, useMemo, useState } from 'react'
import { useI18n } from './i18n.jsx'
import { ALL_LANGS_LIST, detectArticleLang, sourceHash, translateArticle } from './translate.js'

/**
 * Übersetzt die dynamischen Live-TV-Texte (Kanaltitel + Programmtitel) in die
 * aktuelle Seitensprache. Diese Texte kommen aus den Einstellungen (Supabase)
 * und sind dort nur in einer Sprache gespeichert. Analog zu Artikeln werden
 * sie serverseitig übersetzt, in der Datenbank gecacht und im Browser nur die
 * fertigen Texte angezeigt. Priorität: gespeicherte Übersetzung → Original.
 *
 * Zusätzlich werden beim Laden ALLE anderen Sprachen im Hintergrund vorgewärmt
 * (localStorage + DB-Cache). Dadurch wechselt die Seite die Sprache sofort –
 * ohne Warten und ohne Seiten-Refresh.
 *
 * Overrides werden PRO SPRACHE gespeichert, damit beim Wechsel zurück zur
 * Originalsprache nie eine alte Übersetzung stehen bleibt.
 *
 * Zurückgegeben wird eine resolve-Funktion: resolve(key, originalText).
 * Render-Schleifen werden vermieden: Die Liste der zu übersetzenden Texte
 * wird über eine Signatur memoisiert und Overrides nur bei echten Änderungen
 * gesetzt.
 */
export function useLiveTvL10n(live) {
  const { lang } = useI18n()
  const [byLang, setByLang] = useState({})

  // Stabile Signatur aus den sichtbaren Texten – getLiveTv() liefert bei jedem
  // Render ein neues Objekt, die Inhalte ändern sich aber nur selten.
  const sig = useMemo(() => {
    const programs = Array.isArray(live?.programs)
      ? live.programs.filter((p) => p && p.time).map((p) => `${p.time}\u0000${p.title || ''}`).join('\u0001')
      : ''
    return `${String(live?.title || '')}\u0000${programs}`
  }, [live])

  const entries = useMemo(() => {
    const out = []
    const push = (key, text) => {
      const s = String(text || '').trim()
      if (!s) return
      out.push({ key, text: s, h: sourceHash({ title: s, intro: '', body: '' }) })
    }
    if (live) {
      push('live:title', live.title)
      ;(Array.isArray(live.programs) ? live.programs : []).forEach((p) => {
        if (p && p.time) push('live:prog:' + p.time, p.title)
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, lang, live])

  useEffect(() => {
    if (entries.length === 0) return undefined
    let alive = true

    const makeArticle = (entry) => ({ id: entry.key, title: entry.text, intro: '', body: '' })

    // Aktuelle Sprache: Ergebnis anzeigen, sobald es da ist.
    entries.forEach((entry) => {
      translateArticle(makeArticle(entry), lang)
        .then((res) => {
          if (!alive || !res || !res.title || res.title === entry.text) return
          setByLang((prev) => {
            const cur = prev[lang] || {}
            if (cur[entry.key] && cur[entry.key].h === entry.h && cur[entry.key].title === res.title) return prev
            return { ...prev, [lang]: { ...cur, [entry.key]: { h: entry.h, title: res.title } } }
          })
        })
        .catch(() => {})
    })

    // Vorwärmen aller anderen Sprachen → Sprachwechsel sofort, ohne Refresh.
    entries.forEach((entry) => {
      const source = detectArticleLang(entry.text)
      ALL_LANGS_LIST.forEach((target) => {
        if (target === lang || target === source) return
        translateArticle(makeArticle(entry), target).catch(() => {})
      })
    })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, lang])

  const resolve = (key, original) => {
    const text = String(original || '')
    const s = text.trim()
    if (!s) return text
    const ov = byLang[lang] && byLang[lang][key]
    if (ov && ov.h === sourceHash({ title: s, intro: '', body: '' }) && ov.title) return ov.title
    return text
  }

  return resolve
}
