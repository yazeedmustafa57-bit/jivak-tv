import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brand, LogoImage } from './Logo.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import SearchBox from './SearchBox.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import NewsTicker from './NewsTicker.jsx'
import { WeatherChips } from './Weather.jsx'
import { CurrencyChips } from './Currency.jsx'
import { getCategories, trackPageView } from '../lib/store.js'
import { useStoreVersion } from '../lib/useStore.js'
import { useI18n } from '../lib/i18n.jsx'

const SOCIALS = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/1EzSaWuCkC/' },
  { name: 'Instagram', href: 'https://www.instagram.com/jivak_media' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@jivaktv' },
  { name: 'YouTube', href: 'https://youtube.com/@jivaktv435' },
  { name: 'Threads', href: 'https://www.threads.com/@jivak_media' },
  { name: 'Web', href: 'https://www.jivaktv.net' },
  { name: 'WhatsApp', href: 'https://wa.me/9647828323106' }
]

const BRAND_PATHS = {
  Facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  Instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  TikTok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z',
  YouTube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  WhatsApp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
  Threads: 'M12.186 23.999c-3.666 0-6.269-1.643-7.629-4.821-.848-2.012-.947-4.846-.412-8.49.404-2.754 1.113-5.177 2.122-7.242C7.941 1.045 9.44-.005 12.186.001c1.773 0 3.117.473 4.18 1.273 1.784 1.343 2.727 3.65 3.049 6.058.153 1.15.172 2.561.055 4.151-.99.087-2.06.196-3.169.341.179 2.85 2.579 4.557 4.567 4.062.912-.229 1.67-.725 2.196-1.602 1.1-1.875 1.047-4.8-.373-7.087-.943-1.504-2.211-2.596-3.668-3.278-.117-2.24-.65-5.054-2.403-7.047C13.767.424 11.866-.239 9.54.077 5.162.543 3.687 3.176 2.587 5.373c-1.07 2.14-1.785 4.702-2.192 7.33-.45 2.923-.477 6.102.666 8.664C2.681 24.7 5.938 25.9 9.865 25.9c4.74 0 7.855-2.198 9.524-5.367.387-.736.425-1.577.095-2.277-1.483 1.695-3.611 2.846-6.274 2.846-1.629 0-3.43-.769-4.268-2.308-.343-.633-.463-1.319-.353-2.021 1.46-.295 2.951-.495 4.457-.603.847-.063 1.687-.11 2.52-.16.023-.888.025-1.73-.012-2.542-.01-.222-.022-.435-.04-.657-.722.065-1.454.145-2.187.229-1.663.198-3.31.44-4.944.714l.004-.024c-.111-1.681.174-3.438.754-4.994.588-1.643 1.397-2.928 2.38-3.865.026-.025.055-.048.084-.073.016-.125.031-.25.045-.376.24-2.302 1.34-4.02 3.016-5.128C17.455.415 19.583.143 21.437 1.04c1.68.802 2.893 2.535 3.252 4.623.38 2.213-.245 4.898.078 6.725-.473-.873-1.039-1.62-1.698-2.234-.363-.336-.771-.648-1.215-.93-1.678.364-3.397.758-5.078 1.163.037.95.058 1.923.033 2.907.019.213.045.427.077.64 1.149-.238 2.264-.44 3.317-.605.423-.066.83-.131 1.244-.196.063.484.089.984.076 1.493.026 2.292-.464 4.54-1.342 6.147-1.003 1.854-2.486 3.024-4.377 3.024-.813 0-1.604-.199-2.272-.572-.754-.417-1.438-1.004-2.019-1.73-1.458 1.043-2.824 2.647-4.181 4.267-1.75.809-3.503 1.185-5.357 1.185z'
}

function SocialIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' }
  const brand = BRAND_PATHS[name]
  if (brand) {
    return (
      <svg {...common} fill="currentColor" stroke="none">
        <path d={brand} />
      </svg>
    )
  }
  if (name === 'Web') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z" />
      </svg>
    )
  }
  return null
}


function Footer() {
  const { t, tCategory, lang } = useI18n()
  const categories = getCategories()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('')

  async function onSubscribe(e) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setMsg('')
    setMsgType('')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, lang })
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) {
        setEmail('')
        if (data.duplicate) {
          setMsg(t('newsletter.duplicate'))
        } else {
          setMsg(t('newsletter.success'))
        }
        setMsgType('success')
      } else {
        setMsg(data.code === 'invalid-email' ? t('newsletter.invalid') : t('newsletter.error'))
        setMsgType('error')
      }
    } catch {
      setMsg(t('newsletter.error'))
      setMsgType('error')
    }
  }

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-newsletter">
          <div className="footer-newsletter-text">
            <h4>{t('newsletter.title')}</h4>
            <p>{t('newsletter.sub')}</p>
          </div>
          <form className="footer-newsletter-form" onSubmit={onSubscribe} noValidate>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setMsg('') }}
              placeholder={t('newsletter.email')}
              aria-label={t('newsletter.email')}
            />
            <button type="submit" className="btn btn-primary">{t('newsletter.subscribe')}</button>
          </form>
          {msg && <span className={`newsletter-msg ${msgType}`} role="status">{msg}</span>}
        </div>
        <div className="footer-grid">
          <div>
            <LogoImage size={56} className="footer-logo" />
            <h4>ROJ TV</h4>
            <p>{t('footer.about')}</p>
          </div>
          <div>
            <h4>{t('footer.nav')}</h4>
            <div className="footer-links">
              <Link to="/">{t('nav.home')}</Link>
              <Link to="/artikel">{t('nav.articles')}</Link>
              <Link to="/videos">{t('nav.videos')}</Link>
              <Link to="/fotos">{t('nav.photos')}</Link>
              <Link to="/live">{t('nav.live')}</Link>
              <Link to="/autoren">{t('authors.title')}</Link>
              <Link to="/kategorien">{t('nav.categories')}</Link>
            </div>
          </div>
          <div>
            <h4>{t('footer.topics')}</h4>
            <div className="footer-links">
              {categories.slice(0, 5).map((c) => (
                <Link key={c.id} to={`/kategorien/${c.slug}`}>{tCategory(c)}</Link>
              ))}
            </div>
          </div>
          <div>
            <h4>{t('footer.legal')}</h4>
            <div className="footer-links">
              <Link to="/info/ueber-uns">{t('footer.aboutUs')}</Link>
              <Link to="/info/kontakt">{t('footer.contact')}</Link>
              <Link to="/info/datenschutz">{t('footer.privacy')}</Link>
              <Link to="/info/impressum">{t('footer.imprint')}</Link>
              <Link to="/admin">{t('nav.admin')}</Link>
            </div>
          </div>
        </div>
        <div className="footer-social">
          <span>{t('footer.follow')}</span>
          <div className="footer-social-links">
            {SOCIALS.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} data-brand={s.name.toLowerCase()}>
                <SocialIcon name={s.name} />
              </a>
            ))}
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ROJ TV · {t('footer.rights')}</span>
          <span>{t('footer.locally')}</span>
          <ThemeToggle onDark />
        </div>
      </div>
    </footer>
  )
}

export default function PublicLayout() {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()
  useStoreVersion()
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  // Besucherstatistik: Seitenaufruf erfassen
  useEffect(() => {
    if (!isAdmin) trackPageView(location.pathname || '/')
  }, [location.pathname, isAdmin])

  if (isAdmin) return <Outlet />

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Brand to="/" />
          <nav className={`site-nav ${open ? 'open' : ''}`}>
            <NavLink to="/" end onClick={() => setOpen(false)}>{t('nav.home')}</NavLink>
            <NavLink to="/artikel" onClick={() => setOpen(false)}>{t('nav.articles')}</NavLink>
            <NavLink to="/videos" onClick={() => setOpen(false)}>{t('nav.videos')}</NavLink>
            <NavLink to="/fotos" onClick={() => setOpen(false)}>{t('nav.photos')}</NavLink>
            <NavLink to="/live" onClick={() => setOpen(false)}>{t('nav.live')}</NavLink>
            <NavLink to="/kategorien" onClick={() => setOpen(false)}>{t('nav.categories')}</NavLink>
            <Link className="btn btn-soft btn-sm" to="/admin" onClick={() => setOpen(false)}>{t('nav.admin')}</Link>
          </nav>
          <div className="header-tools">
            <SearchBox />
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
          <button
            className="nav-toggle"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l12 12M16 4L4 16" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 5h16M2 10h16M2 15h16" />
              </svg>
            )}
          </button>
        </div>
        <div className="weather-chips-row">
          <div className="container weather-chips">
            <WeatherChips />
            <span className="chips-divider" aria-hidden="true" />
            <CurrencyChips />
          </div>
        </div>
      </header>
      <NewsTicker />
      <main key={location.pathname} className="page-fade">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
