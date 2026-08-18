// Mitarbeiter-/Rollen-Verwaltung (Client).
// - Rollen liegen serverseitig in den Supabase-Auth-Metadaten.
// - Die Session (jivak.session) hält den aktuellen Benutzer (id, email, name, role, authorId).
// - Ohne Cloud (lokaler Modus) gilt der Nutzer immer als Admin.
import { supabase, cloudEnabled } from './supabase.js'
import { getSessionUser, setSessionUser } from './store.js'

const STAFF_API = '/api/staff'
const AUDIT_API = '/api/staff?action=audit'

// Basis-URL der Live-Webseite – Reset-Links dürfen NIE auf localhost zeigen.
const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://jivak-tv.vercel.app').replace(/\/+$/, '')

export const ROLES = ['admin', 'editor', 'author', 'media']

export function canPublish(role) {
  return role === 'admin' || role === 'editor'
}

export function canManageMedia(role) {
  return role === 'admin' || role === 'editor' || role === 'media'
}

export function canDeleteArticles(role) {
  return role === 'admin'
}

async function apiFetch(path, opts = {}) {
  if (!cloudEnabled || !supabase) return { ok: false, reason: 'not-configured' }
  let token = ''
  try {
    const { data } = await supabase.auth.getSession()
    token = (data && data.session && data.session.access_token) || ''
  } catch {
    token = ''
  }
  if (!token) return { ok: false, reason: 'no-session' }
  let res
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    })
  } catch {
    return { ok: false, reason: 'network' }
  }
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...body }
}

/** Aktuellen Benutzer (aus Session) liefern – im lokalen Modus immer Admin. */
export function currentUser() {
  const u = getSessionUser()
  if (u) return u
  if (!cloudEnabled) {
    const local = { id: 'local', email: '', name: 'Admin', role: 'admin', authorId: '', active: true }
    setSessionUser(local)
    return local
  }
  return null
}

/** Profil nach Login/Seitenstart auffrischen (auch Bootstrap „erster Admin“). */
export async function refreshCurrentUser() {
  if (!cloudEnabled) {
    setSessionUser({ id: 'local', email: '', name: 'Admin', role: 'admin', authorId: '', active: true })
    return getSessionUser()
  }
  const r = await apiFetch(`${STAFF_API}?me=1`)
  if (r.ok && r.user) {
    setSessionUser({
      id: r.user.id,
      email: r.user.email || '',
      name: r.user.name || r.user.email || '',
      role: r.user.role || 'author',
      authorId: r.user.authorId || '',
      active: r.user.active !== false
    })
  } else {
    // Fallback: Metadaten direkt aus der Supabase-Session
    try {
      const { data } = await supabase.auth.getUser()
      const u = data && data.user
      if (u) {
        const md = u.user_metadata || {}
        setSessionUser({
          id: u.id,
          email: u.email || '',
          name: md.name || u.email || '',
          role: ROLES.includes(md.role) ? md.role : 'author',
          authorId: md.authorId || '',
          active: md.active !== false
        })
      }
    } catch {
      /* ignorieren */
    }
  }
  return getSessionUser()
}

export async function fetchStaff() {
  return apiFetch(STAFF_API)
}

export async function createStaff(payload) {
  return apiFetch(STAFF_API, { method: 'POST', body: payload })
}

export async function updateStaff(payload) {
  return apiFetch(STAFF_API, { method: 'PATCH', body: payload })
}

export async function deleteStaff(id) {
  return apiFetch(`${STAFF_API}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Supabase-Reset-E-Mail an einen Mitarbeiter senden („Passwort vergessen“). */
export async function sendStaffResetEmail(email) {
  if (!cloudEnabled || !supabase) return { ok: false, error: 'not-configured' }
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
      redirectTo: `${SITE_URL}/auth/reset`
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'network' }
  }
}

/** Aktion ins Audit-Protokoll schreiben (best effort, blockiert nie). */
export function logAudit(action, { targetType = '', targetId = '', targetTitle = '', detail = '' } = {}) {
  apiFetch(AUDIT_API, {
    method: 'POST',
    body: { action, targetType, targetId, targetTitle, detail }
  }).catch(() => {})
}

export async function fetchAudit() {
  return apiFetch(AUDIT_API)
}

