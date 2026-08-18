import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, cloudEnabled, recoveryTokens } from '../../lib/supabase.js'
import { Brand } from '../../components/Logo.jsx'
import { PasswordField } from '../../components/ui.jsx'
import { useI18n } from '../../lib/i18n.jsx'

// Passwort-Reset über den Supabase-Link (type=recovery im URL-Hash).
// Der Link aus der E-Mail enthält access_token + refresh_token im Hash –
// diese Seite übernimmt die Session und erlaubt das Setzen eines neuen Passworts.
export default function ResetPassword() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [checking, setChecking] = useState(true)
  const [blocked, setBlocked] = useState(false)
  // „resetError“ kommt von RecoveryRedirect, wenn GoTrue einen bereits
  // verwendeten/abgelaufenen Link abgelehnt hat (error-Callback im Hash).
  const [usedLink] = useState(() => Boolean(new URLSearchParams(window.location.search).get('resetError')))

  useEffect(() => {
    let alive = true
    let subscription = null
    async function handle() {
      if (!cloudEnabled || !supabase) {
        if (alive) { setChecking(false); setError(t('reset.invalid')) }
        return
      }
      let sessionOk = false
      // 1) Tokens, die beim Seiten-Laden aus der URL gesichert wurden
      if (recoveryTokens && recoveryTokens.access && recoveryTokens.refresh) {
        try {
          const { error } = await supabase.auth.setSession({ access_token: recoveryTokens.access, refresh_token: recoveryTokens.refresh })
          sessionOk = !error
        } catch { /* unten weiter versuchen */ }
      }
      // 2) Fallback: Hash direkt lesen (falls supabase-js ihn noch nicht entfernt hat)
      if (!sessionOk) {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const access = params.get('access_token')
        const refresh = params.get('refresh_token')
        if (params.get('type') === 'recovery' && access && refresh) {
          try {
            const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh })
            sessionOk = !error
          } catch { /* unten weiter versuchen */ }
        }
      }
      // 3) PASSWORD_RECOVERY-Event als zusätzliches Signal (supabase-js hat die
      //    Session evtl. schon selbst aus der URL übernommen)
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' && alive) { sessionOk = true; setChecking(false) }
      })
      subscription = sub && sub.subscription
      if (!sessionOk) {
        // WICHTIG: Keine frischen Recovery-Tokens in der URL → eine vorhandene
        // Session ist eine ALTE, nie widerrufene Recovery-Session (oder ein
        // direkter Besuch ohne Link). Solche Sessions stammen aus Versionen VOR
        // dem globalen SignOut-Fix und dürfen KEINE weitere Passwort-Änderung
        // erlauben. Sie werden deshalb serverseitig widerrufen (scope: global),
        // damit ein alter Link dauerhaft wirkungslos wird.
        const { data: existing } = await supabase.auth.getSession()
        if (existing && existing.session) {
          try { await supabase.auth.signOut({ scope: 'global' }) } catch { /* ignorieren */ }
          try { localStorage.removeItem('jivak.session') } catch { /* ignorieren */ }
        }
      }
      if (alive) setChecking(false)
      // Keine gültige Recovery-Session (Link bereits verwendet/abgelaufen oder
      // alte Session widerrufen) → verständliche Meldung, ohne Formular
      if (alive && !sessionOk) {
        setBlocked(true)
        setError(usedLink ? t('reset.used') : t('reset.invalid'))
      }
    }
    handle()
    return () => { alive = false; if (subscription) subscription.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (pw.length < 6) { setError(t('reset.short')); return }
    if (pw !== pw2) { setError(t('reset.mismatch')); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      // Recovery-Tokens aus der URL entfernen (falls supabase-js sie noch nicht bereinigt hat)
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      } catch { /* ignorieren */ }
      // Serverseitig ALLE Sessions widerrufen (scope: global). Erst dadurch ist
      // der Reset-Link wirklich einmalig: Ohne diesen Schritt bleiben die
      // Access-/Refresh-Tokens aus dem Link gültig und das Passwort könnte
      // erneut geändert werden (auch über einen direkt gespeicherten Link).
      let signOutError = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await supabase.auth.signOut({ scope: 'global' })
          if (!r.error) { signOutError = null; break }
          signOutError = r.error
        } catch (err) {
          signOutError = err
        }
      }
      // Lokale Session- und Store-Daten ebenfalls leeren
      try { localStorage.removeItem('jivak.session') } catch { /* ignorieren */ }
      if (signOutError) console.error('[reset] globaler Logout fehlgeschlagen:', signOutError)
      // Nutzer soll sich mit dem neuen Passwort erneut anmelden
      setDone(true)
      const lang = window.location.search
      window.setTimeout(() => {
        navigate('/admin/login' + lang, { replace: true })
      }, 1800)
    } catch (err) {
      setError(t('reset.error') + (err?.message ? ' (' + err.message + ')' : ''))
    }
    setBusy(false)
  }

  return (
    <div className="login-page" >
      <div className="login-card">
        <Brand to="/" />
        <p className="login-sub">{t('reset.title')}</p>
        {done ? (
          <>
            <p className="form-ok" role="status">{t('reset.success')}</p>
            <p className="login-hint">{t('reset.redirect')}</p>
            <Link className="btn btn-primary btn-block" style={{ textAlign: 'center' }} to="/admin/login">
              {t('reset.login')}
            </Link>
          </>
        ) : (
          <>
            <p className="login-hint">{t('reset.sub')}</p>
            {error && <div className="form-error">{error}</div>}
            {checking && <p className="login-hint">…</p>}
            {!checking && !blocked && (
              <form onSubmit={onSubmit}>
                <PasswordField
                  id="pw"
                  label={t('reset.newPw')}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <PasswordField
                  id="pw2"
                  label={t('reset.confirmPw')}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                  {busy ? '…' : t('reset.submit')}
                </button>
              </form>
            )}
          </>
        )}
        <p className="hint" style={{ textAlign: 'center', marginTop: 20 }}>
          <Link to="/admin/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t('reset.login')}</Link>
        </p>
      </div>
    </div>
  )
}
