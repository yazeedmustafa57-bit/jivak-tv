// Wechselkurs-API für ROJ TV.
// Datenquelle: open.er-api.com (kostenlos, kein API-Key, keine Kosten) –
// Frankfurter API unterstützt IQD nicht. Abruf: 1×/Stunde.
// Die Vortags-Veränderung (▲/▼ %) wird dauerhaft in der Supabase-Tabelle
// "settings" (Key "currency_rates") gespeichert, damit sie auch nach
// Serverless-Cold-Starts korrekt bleibt. Bei API-Fehlern wird der letzte
// bekannte Stand ausgeliefert (stale) – die Seite wird nie blockiert.

import { createClient } from '@supabase/supabase-js'

const TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000
const PAIRS = [
  { id: 'usd-iqd', base: 'USD', target: 'IQD' },
  { id: 'eur-iqd', base: 'EUR', target: 'IQD' }
]

let cache = { at: 0, data: null }

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function supabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function loadStored() {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.from('settings').select('value').eq('key', 'currency_rates').maybeSingle()
  if (error || !data || !data.value) return null
  try { return typeof data.value === 'string' ? JSON.parse(data.value) : data.value } catch { return null }
}

async function saveStored(row) {
  const db = supabase()
  if (!db) return
  await db.from('settings').upsert({ key: 'currency_rates', value: row }, { onConflict: 'key' })
}

// Holt USD-Kurse (eine Anfrage) und rechnet EUR→IQD als Kreuzkurs.
async function fetchRates() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`er-api http ${res.status}`)
    const json = await res.json()
    if (json.result !== 'success' || !json.rates) throw new Error('er-api bad payload')
    const iqd = Number(json.rates.IQD)
    const eur = Number(json.rates.EUR)
    if (!Number.isFinite(iqd) || !Number.isFinite(eur) || eur <= 0) throw new Error('er-api missing rates')
    return {
      updatedAt: json.time_last_update_unix ? Number(json.time_last_update_unix) * 1000 : Date.now(),
      usd: iqd,
      eur: iqd / eur
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildPairs(rates, changeUsd, changeEur) {
  return PAIRS.map((p) => ({
    ...p,
    rate: Math.round((p.base === 'USD' ? rates.usd : rates.eur) * 100) / 100,
    change: p.base === 'USD' ? changeUsd : changeEur
  }))
}

export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=3600')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (cache.data && Date.now() - cache.at < TTL_MS) {
    return res.status(200).json({ ok: true, cached: true, stale: false, fetchedAt: cache.at, updatedAt: cache.updatedAt, source: cache.source, pairs: cache.data })
  }

  let stored = null
  try { stored = await loadStored() } catch { stored = null }

  // Erstmaliger Abruf: Aktuelle Kurse als Vortags-Referenz speichern,
  // damit morgen die Veränderung berechnet werden kann.
  if (!stored) {
    try {
      const fresh = await fetchRates()
      await saveStored({ date: todayUtc(), usd: fresh.usd, eur: fresh.eur, prev: { usd: fresh.usd, eur: fresh.eur }, fetchedAt: Date.now(), updatedAt: fresh.updatedAt })
      cache = { at: Date.now(), data: buildPairs(fresh, null, null), updatedAt: fresh.updatedAt, source: 'open.er-api.com' }
      return res.status(200).json({ ok: true, cached: false, stale: false, fetchedAt: Date.now(), updatedAt: fresh.updatedAt, source: cache.source, pairs: cache.data })
    } catch {
      // First fetch failed – fall through to normal error handling
    }
  }

  // Frisch gespeicherte Daten (jünger als 60 min) ohne Upstream-Abruf ausliefern –
  // schützt das kostenlose Request-Kontingent von er-api (1500/Monat).
  if (stored && stored.fetchedAt && Date.now() - stored.fetchedAt < TTL_MS) {
    const rates = { usd: Number(stored.usd), eur: Number(stored.eur), updatedAt: Number(stored.updatedAt) || Date.now() }
    if (rates.usd > 0 && rates.eur > 0) {
      const prev = stored.prev
      const changeUsd = prev && prev.usd > 0 ? ((rates.usd - prev.usd) / prev.usd) * 100 : null
      const changeEur = prev && prev.eur > 0 ? ((rates.eur - prev.eur) / prev.eur) * 100 : null
      cache = { at: Date.now(), data: buildPairs(rates, changeUsd, changeEur), updatedAt: rates.updatedAt, source: 'open.er-api.com' }
      return res.status(200).json({ ok: true, cached: true, stale: false, fetchedAt: Date.now(), updatedAt: rates.updatedAt, source: cache.source, pairs: cache.data })
    }
  }

  try {
    const rates = await fetchRates()
    const today = todayUtc()
    let changeUsd = null
    let changeEur = null
    let prev = null

    if (stored && stored.date && stored.date < today) {
      // Vortag (oder älter) als Referenz für die Veränderung verwenden
      prev = { date: stored.date, usd: Number(stored.usd), eur: Number(stored.eur) }
      if (prev.usd > 0) changeUsd = ((rates.usd - prev.usd) / prev.usd) * 100
      if (prev.eur > 0) changeEur = ((rates.eur - prev.eur) / prev.eur) * 100
    } else if (stored && stored.date === today && stored.prev) {
      // Gleicher Tag mit gespeichertem Vortag → Veränderung berechnen
      prev = stored.prev
      if (prev.usd > 0) changeUsd = ((rates.usd - prev.usd) / prev.usd) * 100
      if (prev.eur > 0) changeEur = ((rates.eur - prev.eur) / prev.eur) * 100
    }
    // Wenn stored.date === today aber stored.prev === null → changeUsd/Eur bleiben null (–)

    try {
      await saveStored({ date: today, usd: rates.usd, eur: rates.eur, prev, fetchedAt: Date.now(), updatedAt: rates.updatedAt })
    } catch {
      /* Persistenz-Fehler blockieren nie die Antwort */
    }

    cache = { at: Date.now(), data: buildPairs(rates, changeUsd, changeEur), updatedAt: rates.updatedAt, source: 'open.er-api.com' }
    return res.status(200).json({ ok: true, cached: false, stale: false, fetchedAt: Date.now(), updatedAt: rates.updatedAt, source: cache.source, pairs: cache.data })
  } catch (err) {
    if (cache.data) {
      return res.status(200).json({ ok: true, cached: true, stale: true, fetchedAt: cache.at, updatedAt: cache.updatedAt, source: cache.source, pairs: cache.data })
    }
    if (stored && Number(stored.usd) > 0) {
      const rates = { usd: Number(stored.usd), eur: Number(stored.eur), updatedAt: Number(stored.updatedAt) || Date.now() }
      const prev = stored.prev
      const changeUsd = prev && prev.usd > 0 ? ((rates.usd - prev.usd) / prev.usd) * 100 : null
      const changeEur = prev && prev.eur > 0 ? ((rates.eur - prev.eur) / prev.eur) * 100 : null
      return res.status(200).json({ ok: true, cached: true, stale: true, fetchedAt: Date.now(), updatedAt: rates.updatedAt, source: 'open.er-api.com', pairs: buildPairs(rates, changeUsd, changeEur) })
    }
    return res.status(502).json({ ok: false, error: 'currency_unavailable', message: String(err && err.message ? err.message : err) })
  }
}
