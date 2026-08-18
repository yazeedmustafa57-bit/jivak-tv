import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { login, isAuthed, isDefaultPassword, markAuthed, syncFromCloud } from '../../lib/store.js'
import { cloudEnabled, signIn } from '../../lib/supabase.js'
import { refreshCurrentUser } from '../../lib/staff.js'
import { Brand } from '../../components/Logo.jsx'
import { PasswordField } from '../../components/ui.jsx'
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx'
import ThemeToggle from '../../components/ThemeToggle.jsx'
import { useI18n } from '../../lib/i18n.jsx'

export default function Login() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const showDefaultHint = !cloudEnabled && isDefaultPassword()

  if (isAuthed()) return <Navigate to="/admin" replace />

  async function finishCloudLogin() {
    const user = await refreshCurrentUser()
    markAuthed(user)
    await syncFromCloud()
    navigate('/admin', { replace: true })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (cloudEnabled) {
      const res = await signIn(email.trim(), password)
      setBusy(false)
      if (res.ok) {
        await finishCloudLogin()
      } else {
        setError(res.error || t('login.error'))
      }
      return
    }
    const ok = await login(password)
    setBusy(false)
    if (ok) {
      navigate('/admin', { replace: true })
    } else {
      setError(t('login.error'))
    }
  }


  return (
    <div className="login-page" >
      <div className="login-card">
        <div className="login-head">
          <Brand to="/" />
          <div className="admin-side-tools">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
        <p className="login-sub">{t('login.sub')}</p>
        {cloudEnabled && <p className="login-hint">{t('login.cloudNote')}</p>}
        {showDefaultHint && (
          <div className="login-hint">{t('login.hint')}</div>
        )}
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={onSubmit}>
          {cloudEnabled && (
            <div className="field">
              <label htmlFor="email">{t('login.email')}</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          )}
          <PasswordField
            id="password"
            label={t('set.current')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus={!cloudEnabled}
            required
          />
          {cloudEnabled ? (
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? t('login.busy') : t('login.submit')}
            </button>
          ) : (
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? t('login.busy') : t('login.submit')}
            </button>
          )}
        </form>
        <p className="hint" style={{ textAlign: 'center', marginTop: 20 }}>
          <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t('login.back')}</Link>
        </p>
      </div>
    </div>
  )
}
