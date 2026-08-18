// Wetter-Hook: lädt /api/weather einmal pro Seite (modulweit geteilt), cached
// das Ergebnis im localStorage als „letzter bekannter Stand“ und aktualisiert
// beim Sichtbarwerden des Tabs, wenn der Stand älter als 45 Minuten ist.
// Fehler blockieren nie die Seite – bei fehlgeschlagenem Fetch wird der
// letzte bekannte Stand (stale) oder ein dezent ausgeblendeter Zustand gezeigt.
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'jivak.weather.cache'
const REFRESH_MS = 45 * 60 * 1000
const MAX_LOCAL_AGE_MS = 24 * 60 * 60 * 1000

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
    if (parsed && Array.isArray(parsed.cities) && parsed.cities.length > 0 && Date.now() - parsed.at < MAX_LOCAL_AGE_MS) {
      return { data: { ...parsed, stale: true }, loading: false, stale: true, error: false }
    }
  } catch {
    /* ignore */
  }
  return null
}

async function fetchWeather() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch('/api/weather', { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('weather-http')
    const json = await res.json()
    if (!json || json.ok !== true || !Array.isArray(json.cities)) throw new Error('weather-bad')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), cities: json.cities }))
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
  if (shared && shared.data && !force && Date.now() - lastFetchAt < REFRESH_MS) return Promise.resolve(shared)
  if (!shared) {
    shared = readLocal() || { data: null, loading: true, stale: false, error: false }
    notify()
  } else if (!shared.data) {
    emit({ loading: true, error: false })
  }
  lastFetchAt = Date.now()
  inflight = fetchWeather()
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

export function useWeather() {
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
