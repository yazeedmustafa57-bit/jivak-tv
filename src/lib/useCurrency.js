// Wechselkurs-Hook: lädt /api/currency einmal pro Seite (modulweit geteilt),
// cached das Ergebnis im localStorage als „letzter bekannter Stand" und
// aktualisiert beim Sichtbarwerden des Tabs, wenn der Stand älter als 60
// Minuten ist. Fehler blockieren nie die Seite.
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'jivak.currency.cache'
const REFRESH_MS = 60 * 60 * 1000
const MAX_LOCAL_AGE_MS = 48 * 60 * 60 * 1000

let shared = null
let listeners = new Set()
let inflight = null
let lastFetchAt = 0

function notify() {
  listeners.forEach((fn) => fn(shared))
}

function emit(partial) {
  shared = { ...(shared || {}), ...partial }
  notify()
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.pairs) && parsed.pairs.length > 0 && Date.now() - parsed.at < MAX_LOCAL_AGE_MS) {
      // Alte Cache-Einträge ohne fetchedAt: löschen, damit neuer Fetch ausgelöst wird
      if (!parsed.fetchedAt) {
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
        return null
      }
      return { data: { ...parsed, stale: true }, loading: false, stale: true, error: false }
    }
  } catch {
    /* ignore */
  }
  return null
}

async function fetchCurrency() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch('/api/currency', { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('currency-http')
    const json = await res.json()
    if (!json || json.ok !== true || !Array.isArray(json.pairs)) throw new Error('currency-bad')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), fetchedAt: json.fetchedAt, updatedAt: json.updatedAt, pairs: json.pairs }))
    } catch {
      /* ignore */
    }
    return { data: json, loading: false, stale: Boolean(json.stale), error: false }
  } finally {
    clearTimeout(timer)
  }
}

function refresh(force = false) {
  if (inflight) return inflight
  // Nur Cache nutzen wenn: nicht forciert, Daten vorhanden, jünger als 60 Min, UND fetchedAt vorhanden
  if (!force && shared?.data?.fetchedAt && Date.now() - lastFetchAt < REFRESH_MS) {
    return Promise.resolve(shared)
  }
  if (!shared) {
    shared = readLocal() || { data: null, loading: true, stale: false, error: false }
    notify()
  } else if (!shared.data) {
    emit({ loading: true, error: false })
  }
  lastFetchAt = Date.now()
  inflight = fetchCurrency()
    .then((next) => {
      emit(next)
      return next
    })
    .catch(() => {
      if (shared && shared.data) emit({ loading: false, stale: true, error: true })
      else emit({ loading: false, stale: false, error: true })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useCurrency() {
  const [state, setState] = useState(() => shared || readLocal() || { data: null, loading: true, stale: false, error: false })

  useEffect(() => {
    listeners.add(setState)
    if (!shared) refresh(false)
    else setState(shared)

    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchAt > REFRESH_MS) {
        refresh(true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      listeners.delete(setState)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return state
}
