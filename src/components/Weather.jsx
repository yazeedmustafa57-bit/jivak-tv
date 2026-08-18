// Wetter-Widget für Jivak TV (Open-Meteo, kein API-Key).
// Zwei Darstellungsformen:
//   - WeatherChips:   kompakte Chips im Header (Stadt + Temperatur + Icon)
//   - WeatherSection: größere Karten auf der Startseite (Region, Stadt, Icon,
//                     Temperatur, Beschreibung, Tief/Hoch)
// Fehler blockieren nie die Seite: bei nicht erreichbarer API wird der letzte
// bekannte Stand angezeigt oder dezent ausgeblendet.
import { useI18n } from '../lib/i18n.jsx'
import { useWeather } from '../lib/useWeather.js'
import { weatherGroup, weatherIconName, WEATHER_CODE_KEYS, WEATHER_REGION_KEYS, WEATHER_CITY_KEYS } from '../lib/weather.js'

// Lokale, realistische Meteocons-SVGs (MIT-Lizenz, basmilius/weather-icons).
// Die Dateien liegen unter src/assets/weather-icons/ und werden per Vite
// ?raw als Strings eingebunden – keine externen CDNs/Laufzeitabhängigkeiten.
import iconClearDay from '../assets/weather-icons/clear-day.svg?raw'
import iconClearNight from '../assets/weather-icons/clear-night.svg?raw'
import iconPartlyDay from '../assets/weather-icons/partly-cloudy-day.svg?raw'
import iconPartlyNight from '../assets/weather-icons/partly-cloudy-night.svg?raw'
import iconOvercastDay from '../assets/weather-icons/overcast-day.svg?raw'
import iconOvercastNight from '../assets/weather-icons/overcast-night.svg?raw'
import iconFogDay from '../assets/weather-icons/fog-day.svg?raw'
import iconFogNight from '../assets/weather-icons/fog-night.svg?raw'
import iconDrizzle from '../assets/weather-icons/drizzle.svg?raw'
import iconRain from '../assets/weather-icons/rain.svg?raw'
import iconSnow from '../assets/weather-icons/snow.svg?raw'
import iconThunderDay from '../assets/weather-icons/thunderstorms-day.svg?raw'
import iconThunderNight from '../assets/weather-icons/thunderstorms-night.svg?raw'

const ICON_SVGS = {
  'clear-day': iconClearDay,
  'clear-night': iconClearNight,
  'partly-cloudy-day': iconPartlyDay,
  'partly-cloudy-night': iconPartlyNight,
  'overcast-day': iconOvercastDay,
  'overcast-night': iconOvercastNight,
  'fog-day': iconFogDay,
  'fog-night': iconFogNight,
  drizzle: iconDrizzle,
  rain: iconRain,
  snow: iconSnow,
  'thunderstorms-day': iconThunderDay,
  'thunderstorms-night': iconThunderNight
}

function WeatherIcon({ group, isDay, size = 20 }) {
  const name = weatherIconName(group, isDay)
  const svg = ICON_SVGS[name] || iconPartlyDay
  return (
    <span
      className="weather-icon"
      style={{ width: size, height: size }}
      role="img"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// "2026-08-16T14:00" (Stadt-Zeitzone) → "14:00"
function hourLabel(time) {
  if (!time) return '–'
  const t = String(time)
  return t.length >= 16 ? t.slice(11, 16) : t.slice(11, 13) || '–'
}

export function WeatherChips() {
  const { t, formatNum } = useI18n()
  const { data, loading, error } = useWeather()
  const cities = data?.cities || []

  if (error && !cities.length) return null

  return (
    <>
      {loading && !cities.length
        ? [...Array(5)].map((_, i) => <span key={i} className="skeleton weather-chip-skeleton" />)
        : cities.map((c) => (
            <span
              key={c.id}
              className="weather-chip"
              title={`${t(WEATHER_CITY_KEYS[c.id] || '')} · ${t(WEATHER_CODE_KEYS[weatherGroup(c.code)] || 'weather.code.partly')}`}
            >
              <WeatherIcon group={weatherGroup(c.code)} isDay={c.isDay} size={18} />
              <span className="weather-chip-city">{t(WEATHER_CITY_KEYS[c.id] || '')}</span>
              <span className="weather-chip-temp">{formatNum(Math.round(c.temp))}°</span>
            </span>
          ))}
    </>
  )
}

export function WeatherSection() {
  const { t, formatDateTime, formatNum } = useI18n()
  const { data, loading, error } = useWeather()
  const cities = data?.cities || []

  return (
    <section className="section">
      <div className="container">
        <div className="sec-head">
          <div>
            <span className="sec-kicker">{t('weather.kicker')}</span>
            <h2>{t('weather.title')}</h2>
            <p>
              {t('weather.sub')}
              {data?.updatedAt && ` · ${t('weather.updated')}: ${formatNum(formatDateTime(data.updatedAt))}`}
            </p>
          </div>
        </div>

        {loading && !cities.length ? (
          <div className="weather-grid" aria-hidden="true">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton weather-card-skeleton" />
            ))}
          </div>
        ) : error && !cities.length ? (
          <p className="weather-unavailable" role="status">
            {t('weather.unavailable')}
          </p>
        ) : (
          <div className="weather-grid">
            {cities.map((c) => {
              const group = weatherGroup(c.code)
              return (
                <div key={c.id} className="weather-card">
                  <span className="weather-region">{t(WEATHER_REGION_KEYS[c.id] || 'weather.region.diaspora')}</span>
                  <span className="weather-city">{t(WEATHER_CITY_KEYS[c.id] || '')}</span>
                  <div className="weather-main">
                    <WeatherIcon group={group} isDay={c.isDay} size={40} />
                    <span className="weather-temp">{formatNum(Math.round(c.temp))}°</span>
                  </div>
                  <span className="weather-desc">{t(WEATHER_CODE_KEYS[group] || 'weather.code.partly')}</span>
                  <span className="weather-highlow">
                    {t('weather.highLow', { high: formatNum(Math.round(c.high)), low: formatNum(Math.round(c.low)) })}
                  </span>
                  {Array.isArray(c.hourly) && c.hourly.length > 0 && (
                    <>
                      <span className="weather-hourly-label">{t('weather.hourly')}</span>
                      <div className="weather-hourly">
                        {c.hourly.map((h) => (
                          <span
                            key={h.time}
                            className="weather-hour"
                            title={`${formatNum(hourLabel(h.time))} · ${t(WEATHER_CODE_KEYS[weatherGroup(h.code)] || 'weather.code.partly')}`}
                          >
                            <span className="weather-hour-time">{formatNum(hourLabel(h.time))}</span>
                            <WeatherIcon group={weatherGroup(h.code)} isDay={h.isDay} size={16} />
                            <span className="weather-hour-temp">{formatNum(h.temp)}°</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {data?.stale && <span className="weather-stale">{t('weather.stale')}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
