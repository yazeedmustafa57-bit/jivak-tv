// Zentrale Supabase-Konfiguration (Client-Key ist für Browser gedacht).
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim()
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
export const SUPABASE_BUCKET = (import.meta.env.VITE_SUPABASE_BUCKET || 'jivak-tv').trim()

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON)

export const supabase = cloudEnabled ? createClient(SUPABASE_URL, SUPABASE_ANON) : null

// Recovery-Tokens direkt beim Laden aus der URL sichern. supabase-js entfernt
// den Hash nach der Initialisierung – dadurch würden wir den Recovery-Zustand
// sonst verlieren und die Reset-Seite würde „Link ungültig“ zeigen.
export const recoveryTokens = (() => {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('type') !== 'recovery') return null
    const access = params.get('access_token')
    const refresh = params.get('refresh_token')
    if (!access || !refresh) return null
    return { access, refresh }
  } catch {
    return null
  }
})()

export async function signIn(email, password) {
  if (!supabase) return { ok: false, error: 'not-configured' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true, user: data.user }
}

export async function signUp(email, password) {
  if (!supabase) return { ok: false, error: 'not-configured' }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { ok: false, error: error.message }
  return { ok: true, user: data.user }
}

export async function signOutCloud() {
  if (!supabase) return
  try { await supabase.auth.signOut() } catch { /* ignore */ }
}

export function isCloudSession() {
  if (!supabase) return false
  const { data } = supabase.auth.getSession()
  if (data?.session) return true
  // Fallback: persistierte Session direkt aus dem Storage lesen (robust,
  // falls der Client-Status nach Signup noch nicht synchron ist).
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    return Boolean(raw && JSON.parse(raw).access_token)
  } catch {
    return false
  }
}

/** Liefert das aktuelle Access-Token (für geschützte API-Aufrufe) oder ''. */
export async function getCloudToken() {
  if (!supabase) return ''
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) return data.session.access_token
  } catch {
    /* Fallback unten */
  }
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.access_token) return parsed.access_token
    }
  } catch {
    /* kein Token verfügbar */
  }
  return ''
}

