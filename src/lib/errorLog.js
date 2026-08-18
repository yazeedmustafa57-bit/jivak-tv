// Zentrales Crash-/Fehler-Logging für ROJ TV (Debug-Build).
// Erfasst auf echten Geräten:
//   - alle Exceptions (window.onerror) mit Datei/Zeile/Spalte + Stacktrace
//   - alle unhandled promise rejections
//   - React-Render-Fehler (ErrorBoundaries) inkl. vollständigem Stack
//   - Lifecycle-Events (visibilitychange, pageshow, pagehide, beforeunload,
//     freeze, resume, focus, blur) – so lässt sich nachvollziehen, was auf
//     dem Gerät direkt vor einem Crash passiert ist
//   - Heartbeat: Erkennt, ob der Haupt-Thread eingefroren war
// Persistenz: localStorage → sessionStorage → In-Memory (fallback),
// damit auch bei vollem/blockiertem Speicher nichts verloren geht.
// Jede Funktion hier ist gegen eigene Fehler abgesichert (darf nie crashen).

const ERR_KEY = 'em.error-log'
const LIFE_KEY = 'em.lifecycle-log'
const MAX_ERRS = 40
const MAX_LIFE = 120

// In-Memory-Fallback, falls gar kein Storage schreibbar ist
let memErrs = []
let memLife = []

function browserInfo() {
  try {
    const ua = navigator.userAgent || ''
    let name = 'Unbekannt'
    if (/Edg\//.test(ua)) name = 'Edge ' + (ua.match(/Edg\/([\d.]+)/) || [])[1]
    else if (/Chrome\//.test(ua)) name = 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/) || [])[1]
    else if (/Safari\//.test(ua)) name = 'Safari ' + (ua.match(/Version\/([\d.]+)/) || [])[1]
    else if (/Firefox\//.test(ua)) name = 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/) || [])[1]
    const android = /Android/.test(ua) ? ' Android ' + ((ua.match(/Android ([\d.]+)/) || [])[1] || '') : ''
    const ios = /iPhone|iPad/.test(ua) ? ' iOS' : ''
    return name + android + ios
  } catch {
    return 'Unbekannt'
  }
}

function nowIso() {
  try { return new Date().toISOString() } catch { return String(Date.now()) }
}

function pushTo(store, max, entry) {
  store.push(entry)
  while (store.length > max) store.shift()
}

function readStore(key, mem) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : mem
    }
  } catch {
    /* weiter */
  }
  try {
    const raw2 = sessionStorage.getItem(key)
    if (raw2) {
      const arr2 = JSON.parse(raw2)
      return Array.isArray(arr2) ? arr2 : mem
    }
  } catch {
    /* weiter */
  }
  return mem
}

function writeStore(key, entries) {
  let ok = false
  try {
    localStorage.setItem(key, JSON.stringify(entries))
    ok = true
  } catch {
    // Speicher voll/blockiert: Platz schaffen, indem alte Einträge fallen
    try {
      const half = entries.slice(Math.floor(entries.length / 2))
      localStorage.setItem(key, JSON.stringify(half))
      ok = true
    } catch {
      ok = false
    }
  }
  if (!ok) {
    try {
      sessionStorage.setItem(key, JSON.stringify(entries.slice(-20)))
    } catch {
      /* nur Memory */
    }
  }
}

function stackOf(err) {
  try {
    if (err && err.stack) return String(err.stack)
    if (err && err.message) return String(err.message)
    if (err) return String(err)
  } catch {
    /* ignore */
  }
  return ''
}

function messageOf(err) {
  try {
    if (typeof err === 'string') return err
    if (err && err.message) return String(err.message)
    if (err) return String(err)
  } catch {
    /* ignore */
  }
  return 'Unbekannter Fehler'
}

function baseEntry(source) {
  return {
    t: Date.now(),
    iso: nowIso(),
    source,
    url: (typeof window !== 'undefined' ? window.location.href : '').slice(0, 400),
    lang: (typeof document !== 'undefined' && document.documentElement.lang) || '',
    browser: browserInfo(),
    ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
    platform: (typeof navigator !== 'undefined' ? navigator.platform || '' : '').slice(0, 80),
    visible: typeof document !== 'undefined' ? document.visibilityState : '?',
    hbAge: heartbeatAge()
  }
}

// ---------- Heartbeat (Haupt-Thread-Freeze-Erkennung) ----------
let lastBeat = 0
let hiddenSinceBeat = false
let lastFreezeLogged = 0
const FREEZE_MS = 45000
function beat() {
  lastBeat = Date.now()
  hiddenSinceBeat = typeof document !== 'undefined' && document.visibilityState === 'hidden'
}
function heartbeatAge() {
  if (!lastBeat) return 0
  return Math.round((Date.now() - lastBeat) / 1000)
}
function checkFreeze() {
  try {
    const now = Date.now()
    const age = lastBeat ? now - lastBeat : 0
    const visibleNow = typeof document === 'undefined' || document.visibilityState !== 'hidden'
    // Freeze nur melden, wenn der Tab durchgehend sichtbar war und der
    // Haupt-Thread spürbar blockiert war (Intervall kommt zu spät).
    if (visibleNow && !hiddenSinceBeat && age > FREEZE_MS && now - lastFreezeLogged > 60000) {
      lastFreezeLogged = now
      logError(
        'heartbeat-freeze',
        new Error('Haupt-Thread war ca. ' + Math.round(age / 1000) + 's blockiert (Seite eingefroren, keine Exception)'),
        { file: 'src/lib/errorLog.js' }
      )
    }
  } catch {
    /* ignore */
  }
}
function startHeartbeat() {
  if (typeof window === 'undefined' || window.__emHeartbeatStarted) return
  window.__emHeartbeatStarted = true
  beat()
  try {
    setInterval(() => {
      checkFreeze()
      beat()
    }, 30000)
  } catch {
    /* ignore */
  }
}

/**
 * Fehler protokollieren (Exception, Rejection, Boundary, Storage …).
 * extra kann { file, line, col, componentStack } enthalten.
 */
export function logError(source, err, extra) {
  try {
    const entry = {
      ...baseEntry(source),
      msg: messageOf(err),
      stack: stackOf(err).slice(0, 4000),
      file: extra && extra.file ? String(extra.file).slice(0, 200) : undefined,
      line: extra && extra.line != null ? Number(extra.line) : undefined,
      col: extra && extra.col != null ? Number(extra.col) : undefined,
      componentStack: extra && extra.componentStack ? String(extra.componentStack).slice(0, 3000) : undefined
    }
    const entries = readStore(ERR_KEY, memErrs)
    pushTo(entries, MAX_ERRS, entry)
    memErrs = entries
    writeStore(ERR_KEY, entries)
    try {
      console.error('[' + source + ']', entry.msg)
    } catch {
      /* ignore */
    }
  } catch {
    /* Logging darf nie selbst crashen */
  }
}

/** Lifecycle-Ereignis protokollieren (optional mit Detail). */
export function logLifecycle(eventName, detail) {
  try {
    const entry = {
      ...baseEntry('lifecycle:' + eventName),
      detail: detail ? String(detail).slice(0, 120) : undefined
    }
    const entries = readStore(LIFE_KEY, memLife)
    pushTo(entries, MAX_LIFE, entry)
    memLife = entries
    writeStore(LIFE_KEY, entries)
  } catch {
    /* ignore */
  }
}

/** Alle gespeicherten Fehler (neueste zuerst). */
export function getErrorLog() {
  try {
    return readStore(ERR_KEY, memErrs).slice().reverse()
  } catch {
    return memErrs.slice().reverse()
  }
}

/** Lifecycle-Historie (neueste zuerst). */
export function getLifecycleLog() {
  try {
    return readStore(LIFE_KEY, memLife).slice().reverse()
  } catch {
    return memLife.slice().reverse()
  }
}

/** Einzelnen Fehler-Eintrag dauerhaft löschen (nach Zeitstempel t). */
export function removeErrorEntry(t) {
  try {
    const target = Number(t)
    if (!Number.isFinite(target)) return
    const entries = readStore(ERR_KEY, memErrs).filter((e) => Number(e.t) !== target)
    memErrs = entries
    writeStore(ERR_KEY, entries)
  } catch {
    /* ignore */
  }
}

/** Fehler- und Lifecycle-Protokoll leeren. */
export function clearErrorLog() {
  try { localStorage.removeItem(ERR_KEY) } catch { /* ignore */ }
  try { localStorage.removeItem(LIFE_KEY) } catch { /* ignore */ }
  try { sessionStorage.removeItem(ERR_KEY) } catch { /* ignore */ }
  try { sessionStorage.removeItem(LIFE_KEY) } catch { /* ignore */ }
  memErrs = []
  memLife = []
}

/**
 * Formatiert das komplette Crash-Protokoll als Text (für „Crash-Log kopieren“).
 */
export function formatCrashLog() {
  const errs = getErrorLog()
  const life = getLifecycleLog()
  const lines = []
  lines.push('=== JIVAK TV CRASH-LOG ===')
  lines.push('Erstellt: ' + nowIso())
  lines.push('URL: ' + (typeof window !== 'undefined' ? window.location.href : ''))
  lines.push('Sprache: ' + (typeof document !== 'undefined' ? document.documentElement.lang : ''))
  lines.push('Browser: ' + browserInfo())
  lines.push('User-Agent: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : ''))
  lines.push('')
  lines.push('--- FEHLER (' + errs.length + ') ---')
  errs.slice(0, 10).forEach((e) => {
    lines.push('')
    lines.push('[' + e.source + '] ' + e.iso + (e.lang ? ' (lang=' + e.lang + ')' : ''))
    lines.push('Meldung: ' + e.msg)
    if (e.file || e.line) lines.push('Datei: ' + (e.file || '') + ' Zeile: ' + (e.line || '') + (e.col ? ' Spalte: ' + e.col : ''))
    lines.push('URL: ' + e.url)
    if (e.stack) lines.push('Stack:\n' + e.stack)
    if (e.componentStack) lines.push('ComponentStack:\n' + e.componentStack)
  })
  lines.push('')
  lines.push('--- LIFECYCLE (letzte ' + life.length + ') ---')
  life.slice(0, 40).forEach((e) => {
    lines.push(e.iso + ' ' + e.source + (e.detail ? ' ' + e.detail : '') + ' visible=' + e.visible + ' hbAge=' + e.hbAge + 's')
  })
  return lines.join('\n')
}

/**
 * Globale Fehler-Handler + Lifecycle-Tracker installieren (einmal beim Start).
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined' || window.__emErrorHandlersInstalled) return
  window.__emErrorHandlersInstalled = true
  startHeartbeat()

  window.addEventListener('error', (event) => {
    logError('window.onerror', event.error || event.message, {
      file: event.filename || '',
      line: event.lineno,
      col: event.colno
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    logError('unhandledrejection', event.reason)
  })

  // ---------- Lifecycle-Events ----------
  document.addEventListener('visibilitychange', () => {
    logLifecycle('visibilitychange', document.visibilityState)
  })
  window.addEventListener('pageshow', (e) => {
    logLifecycle('pageshow', 'persisted=' + Boolean(e.persisted))
  })
  window.addEventListener('pagehide', (e) => {
    logLifecycle('pagehide', 'persisted=' + Boolean(e.persisted))
  })
  window.addEventListener('beforeunload', () => {
    logLifecycle('beforeunload', '')
  })
  document.addEventListener('freeze', () => {
    logLifecycle('freeze', '')
  })
  document.addEventListener('resume', () => {
    logLifecycle('resume', '')
  })
  window.addEventListener('focus', () => {
    logLifecycle('focus', '')
  })
  window.addEventListener('blur', () => {
    logLifecycle('blur', '')
  })
}
