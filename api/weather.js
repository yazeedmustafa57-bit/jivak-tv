// Wetter-API für ROJ TV.
// Holt aktuelle Wetterdaten für 5 Städte von Open-Meteo (kostenlos, kein API-Key)
// und cached das Ergebnis serverseitig (45 Minuten TTL). Bei Fehlern wird –
// falls vorhanden – der letzte bekannte Stand ausgeliefert (stale), damit die
// Website nie durch das Wetter-Widget blockiert wird.

const HOURLY_COUNT = 10
const CITIES = [
  { id: 'baghdad', lat: 33.3152, lon: 44.3661 },
  { id: 'erbil', lat: 36.1911, lon: 44.0092 },
  { id: 'baghdad', lat: 33.3128, lon: 44.3615 },
  { id: 'duhok', lat: 36.8667, lon: 42.9833 },
  { id: 'berlin', lat: 52.52, lon: 13.405 }
]

const TTL_MS = 45 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

let cache = { at: 0, data: null }

async function fetchCity(city) {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1'
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`open-meteo http ${res.status}`)
    const json = await res.json()
    const cur = json.current || {}
    const daily = json.daily || {}
    // Stunden-Vorhersage: ab der aktuellen lokalen Stunde der Stadt (current.time
    // ist in der Stadt-Zeitzone), nächste HOURLY_COUNT Stunden.
    const times = json.hourly?.time || []
    const temps = json.hourly?.temperature_2m || []
    const codes = json.hourly?.weather_code || []
    const isDays = json.hourly?.is_day || []
    const curHour = cur.time ? String(cur.time).slice(11, 13) : null
    let startIdx = 0
    if (curHour) {
      const idx = times.findIndex((tm) => String(tm).slice(11, 13) === curHour)
      if (idx >= 0) startIdx = idx
    }
    const hourly = []
    for (let i = startIdx; i < Math.min(times.length, startIdx + HOURLY_COUNT); i++) {
      hourly.push({
        time: times[i],
        temp: Math.round(Number(temps[i]) || 0),
        code: Number(codes[i]) || 0,
        isDay: Number(isDays[i]) === 1
      })
    }
    return {
      id: city.id,
      temp: Math.round(Number(cur.temperature_2m) || 0),
      feels: Math.round(Number(cur.apparent_temperature) || Number(cur.temperature_2m) || 0),
      humidity: Math.round(Number(cur.relative_humidity_2m) || 0),
      wind: Math.round(Number(cur.wind_speed_10m) || 0),
      code: Number(cur.weather_code) || 0,
      isDay: Number(cur.is_day) === 1,
      high: Math.round(Number(daily.temperature_2m_max?.[0]) || 0),
      low: Math.round(Number(daily.temperature_2m_min?.[0]) || 0),
      hourly
    }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(_req, res) {
  // Browser + CDN: 25 min (max-age) / 45 min (s-maxage) cachen
  res.setHeader('Cache-Control', 'public, max-age=1500, s-maxage=2700, stale-while-revalidate=2700')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (cache.data && Date.now() - cache.at < TTL_MS) {
    return res.status(200).json({ ok: true, cached: true, stale: false, updatedAt: cache.at, cities: cache.data })
  }

  try {
    const cities = await Promise.all(CITIES.map(fetchCity))
    cache = { at: Date.now(), data: cities }
    return res.status(200).json({ ok: true, cached: false, stale: false, updatedAt: cache.at, cities })
  } catch (err) {
    if (cache.data) {
      return res.status(200).json({ ok: true, cached: true, stale: true, updatedAt: cache.at, cities: cache.data })
    }
    return res.status(502).json({ ok: false, error: 'weather_unavailable', message: String(err && err.message ? err.message : err) })
  }
}
