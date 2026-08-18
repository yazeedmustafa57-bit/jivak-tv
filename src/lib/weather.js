// Wetter-Metadaten: WMO-Wettercode → Icon-Gruppe + Übersetzungs-Schlüssel.
// Die Beschreibungstexte liegen mehrsprachig im i18n-System (weather.code.*).

export function weatherGroup(code) {
  const n = Number(code)
  if (n === 0) return 'clear'
  if (n === 1 || n === 2) return 'partly'
  if (n === 3) return 'overcast'
  if (n === 45 || n === 48) return 'fog'
  if (n >= 51 && n <= 57) return 'drizzle'
  if ((n >= 61 && n <= 67) || (n >= 80 && n <= 82)) return 'rain'
  if (n >= 71 && n <= 77) return 'snow'
  if (n === 85 || n === 86) return 'snow'
  if (n >= 95) return 'thunder'
  return 'partly'
}


// Meteocons-Icon-Dateien (lokal unter src/assets/weather-icons/, MIT-Lizenz).
// Tag/Nacht-Variante wird anhand der lokalen Uhrzeit der Stadt (API-Feld is_day)
// gewählt; Regen/Schnee/Niesel sind tag-/nachtneutral (Wolke ohne Sonne).
export const WEATHER_ICON_NAMES = {
  clear: { day: 'clear-day', night: 'clear-night' },
  partly: { day: 'partly-cloudy-day', night: 'partly-cloudy-night' },
  overcast: { day: 'overcast-day', night: 'overcast-night' },
  fog: { day: 'fog-day', night: 'fog-night' },
  drizzle: { day: 'drizzle', night: 'drizzle' },
  rain: { day: 'rain', night: 'rain' },
  snow: { day: 'snow', night: 'snow' },
  thunder: { day: 'thunderstorms-day', night: 'thunderstorms-night' }
}

export function weatherIconName(group, isDay) {
  const entry = WEATHER_ICON_NAMES[group] || WEATHER_ICON_NAMES.partly
  return isDay === false ? entry.night : entry.day
}

export const WEATHER_CODE_KEYS = {
  clear: 'weather.code.clear',
  partly: 'weather.code.partly',
  overcast: 'weather.code.overcast',
  fog: 'weather.code.fog',
  drizzle: 'weather.code.drizzle',
  rain: 'weather.code.rain',
  snow: 'weather.code.snow',
  thunder: 'weather.code.thunder'
}

export const WEATHER_REGION_KEYS = {
  baghdad: 'weather.region.iraq',
  baghdad: 'weather.region.iraq',
  erbil: 'weather.region.kurdistan',
  duhok: 'weather.region.kurdistan',
  berlin: 'weather.region.diaspora'
}

export const WEATHER_CITY_KEYS = {
  baghdad: 'weather.cities.baghdad',
  erbil: 'weather.cities.erbil',
  baghdad: 'weather.cities.baghdad',
  duhok: 'weather.cities.duhok',
  berlin: 'weather.cities.berlin'
}
