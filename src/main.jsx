import React, { Component, Fragment, Suspense, lazy, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/500.css'
import '@fontsource/cairo/600.css'
import '@fontsource/cairo/700.css'
import '@fontsource/almarai/300.css'
import '@fontsource/almarai/400.css'
import '@fontsource/almarai/700.css'
import '@fontsource/noto-naskh-arabic/400.css'
import '@fontsource/noto-naskh-arabic/500.css'
import '@fontsource/noto-naskh-arabic/600.css'
import '@fontsource/noto-naskh-arabic/700.css'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'
import './styles.css'

import { I18nProvider, LANGUAGES, detectInitialLang, useI18n } from './lib/i18n.jsx'
import { recoveryTokens } from './lib/supabase.js'
import PublicLayout from './components/PublicLayout.jsx'
import PageBoundary from './components/PageBoundary.jsx'
import { installGlobalErrorHandlers, logError } from './lib/errorLog.js'
import { initTheme } from './lib/useTheme.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import { PageSkeleton } from './components/Skeleton.jsx'

initTheme()

// Code-Splitting: Seiten werden erst beim Aufruf geladen
const Home = lazy(() => import('./pages/Home.jsx'))
const Articles = lazy(() => import('./pages/Articles.jsx'))
const ArticleDetail = lazy(() => import('./pages/ArticleDetail.jsx'))
const Videos = lazy(() => import('./pages/Videos.jsx'))
const Fotos = lazy(() => import('./pages/Fotos.jsx'))
const CategoryPage = lazy(() => import('./pages/CategoryPage.jsx'))
const InfoPage = lazy(() => import('./pages/InfoPage.jsx'))
const LiveTv = lazy(() => import('./pages/LiveTv.jsx'))
const Authors = lazy(() => import('./pages/Authors.jsx'))
const AuthorProfile = lazy(() => import('./pages/AuthorProfile.jsx'))
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const Login = lazy(() => import('./pages/admin/Login.jsx'))
const ResetPassword = lazy(() => import('./pages/admin/ResetPassword.jsx'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'))
const AdminArticles = lazy(() => import('./pages/admin/AdminArticles.jsx'))
const ArticleEditor = lazy(() => import('./pages/admin/ArticleEditor.jsx'))
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories.jsx'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'))
const MediaLibrary = lazy(() => import('./pages/admin/MediaLibrary.jsx'))
const AdminStorage = lazy(() => import('./pages/admin/AdminStorage.jsx'))
const AdminAuthors = lazy(() => import('./pages/admin/AdminAuthors.jsx'))
const CrashLog = lazy(() => import('./pages/admin/CrashLog.jsx'))
const Newsletter = lazy(() => import('./pages/admin/Newsletter.jsx'))
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff.jsx'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog.jsx'))
const RequireRole = lazy(() => import('./pages/admin/RequireRole.jsx'))

// Erzwingt einen frischen Mount des Artikel-Editors bei jeder Artikel-ID.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Ohne den key würde React Router die Editor-Instanz zwischen „Neuer Artikel“
// und „Bearbeiten“ wiederverwenden – dann bliebe das alte Formular inklusive
// altem Titelbild stehen und würde den neuen Artikel überschreiben.
function ArticleEditorRoute() {
  const { id } = useParams()
  return <ArticleEditor key={id || 'neu'} />
}

// Fehler-Grenze: verhindert, dass ein Render-Fehler die ganze Seite
// einfriert („Klick tut nichts“). Zeigt stattdessen eine verständliche,
// sprachabhängige Fehlermeldung mit Neuladen-Schaltfläche.
const ERROR_TEXTS = {
  ar: { title: 'حدث خطأ غير متوقع.', text: 'يرجى إعادة محاولة التحميل أو العودة إلى الصفحة الرئيسية.', btn: 'إعادة المحاولة', home: 'الصفحة الرئيسية' },
  ku: { title: 'تشتەک تێدا چوو.', text: 'ژ کەرەما خوە دوبارە بکە یان ڤەگەرە سەر مالپەرێ.', btn: 'دوبارە بکە', home: 'مالپەرە' },
  en: { title: 'Something went wrong.', text: 'Please try again or return to the homepage.', btn: 'Try again', home: 'Homepage' },
  de: { title: 'Etwas ist schiefgelaufen.', text: 'Bitte versuche es erneut oder kehre zur Startseite zurück.', btn: 'Erneut versuchen', home: 'Startseite' }
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, retryKey: 0, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // Fehler mit vollständigem Stack protokollieren – im Admin unter „Crash-Protokoll“ sichtbar.
    logError('react-boundary', error, {
      componentStack: info && info.componentStack ? info.componentStack : ''
    })
  }
  retry = () => {
    // App-Baum neu mounten (ohne Full-Reload): „Bereich neu laden“ statt Blockade.
    this.setState((s) => ({ hasError: false, retryKey: s.retryKey + 1, error: null }))
  }
  render() {
    if (this.state.hasError) {
      const msg = ERROR_TEXTS[this.props.lang] || ERROR_TEXTS.de
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', fontFamily: 'var(--font-sans, sans-serif)' }}>
          <h2 style={{ margin: 0 }}>{msg.title}</h2>
          <p style={{ margin: 0, color: 'var(--ink-soft, #666)' }}>{msg.text}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
            <button type="button" className="btn btn-primary" onClick={this.retry}>
              {msg.btn}
            </button>
            <a className="btn btn-ghost" href="/">{msg.home}</a>
          </div>
          {this.state.error && (
            <details style={{ marginTop: 18, textAlign: 'left', maxWidth: 680 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--ink-soft, #666)', fontSize: 13 }}>Details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: '#8a1f0e', background: 'rgba(196,71,44,0.06)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                {String(this.state.error && (this.state.error.stack || this.state.error.message) || this.state.error).slice(0, 700)}
              </pre>
            </details>
          )}
        </div>
      )
    }
    // key-Änderung erzwingt einen sauberen Remount nach einem Fehler.
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>
  }
}

// Liest die aktuelle Sprache aus dem I18n-Provider und reicht sie an die Fehler-Grenze weiter.
function AppErrorBoundary({ children }) {
  const { lang } = useI18n()
  return <ErrorBoundary lang={lang}>{children}</ErrorBoundary>
}

// Sprache/Dir vor dem ersten Render setzen (verhindert RTL-Flackern)
const initial = detectInitialLang()
const initialMeta = LANGUAGES.find((l) => l.code === initial) || LANGUAGES[0]
document.documentElement.lang = initialMeta.code
document.documentElement.dir = initialMeta.dir

// Leitet Passwort-Reset-Links, die auf der Startseite (oder einer anderen
// Seite) landen, automatisch zur Reset-Seite weiter.
// Wichtig: Nur EINMAL pro Seitenladen ausführen. useNavigate() in React Router v6
// liefert bei jeder Ortsänderung eine neue Funktions-Identität zurück – ohne diesen
// Guard würde der Effekt bei jeder Navigation erneut feuern und den Nutzer nach
// erfolgreichem Reset zurück auf /auth/reset werfen.
let recoveryRedirectHandled = false
function RecoveryRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    if (recoveryRedirectHandled) return
    recoveryRedirectHandled = true
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    // Fehler-Callback von GoTrue (z. B. Link bereits verwendet/abgelaufen):
    // auf die Reset-Seite mit verständlicher Meldung weiterleiten.
    if (params.get('error') && window.location.pathname !== '/auth/reset') {
      const q = new URLSearchParams(window.location.search)
      q.set('resetError', params.get('error_code') || 'invalid')
      navigate('/auth/reset?' + q.toString(), { replace: true })
      return
    }
    if (recoveryTokens && window.location.pathname !== '/auth/reset') {
      navigate('/auth/reset', { replace: true })
    }
  }, [navigate])
  return null
}

function App() {
  return (
    <BrowserRouter>
        <ScrollToTop />
      <RecoveryRedirect />
      <Analytics />
      <Suspense fallback={<PageSkeleton />}>
        <AppErrorBoundary>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<PageBoundary><Home /></PageBoundary>} />
            <Route path="artikel" element={<PageBoundary><Articles /></PageBoundary>} />
            <Route path="artikel/:slug" element={<PageBoundary><ArticleDetail /></PageBoundary>} />
            <Route path="videos" element={<PageBoundary><Videos /></PageBoundary>} />
            <Route path="fotos" element={<PageBoundary><Fotos /></PageBoundary>} />
            <Route path="kategorien" element={<PageBoundary><CategoryPage /></PageBoundary>} />
            <Route path="kategorien/:slug" element={<PageBoundary><CategoryPage /></PageBoundary>} />
            <Route path="live" element={<PageBoundary><LiveTv /></PageBoundary>} />
            <Route path="autoren" element={<PageBoundary><Authors /></PageBoundary>} />
            <Route path="autor/:slug" element={<PageBoundary><AuthorProfile /></PageBoundary>} />
            <Route path="suche" element={<PageBoundary><SearchPage /></PageBoundary>} />
            <Route path="info/:page" element={<PageBoundary><InfoPage /></PageBoundary>} />
            <Route path="*" element={<PageBoundary><NotFound /></PageBoundary>} />
          </Route>
          <Route path="/admin/login" element={<PageBoundary><Login /></PageBoundary>} />
          <Route path="/auth/reset" element={<PageBoundary><ResetPassword /></PageBoundary>} />
          <Route path="/admin" element={<PageBoundary><AdminLayout /></PageBoundary>}>
            <Route index element={<PageBoundary><Dashboard /></PageBoundary>} />
            <Route path="artikel" element={<PageBoundary><AdminArticles /></PageBoundary>} />
            <Route path="artikel/neu" element={<PageBoundary><ArticleEditorRoute /></PageBoundary>} />
            <Route path="artikel/:id" element={<PageBoundary><ArticleEditorRoute /></PageBoundary>} />
            <Route path="kategorien" element={<RequireRole roles={['admin']}><PageBoundary><AdminCategories /></PageBoundary></RequireRole>} />
            <Route path="medien" element={<RequireRole roles={['admin', 'editor', 'media']}><PageBoundary><MediaLibrary /></PageBoundary></RequireRole>} />
            <Route path="speicher" element={<RequireRole roles={['admin', 'editor', 'media']}><PageBoundary><AdminStorage /></PageBoundary></RequireRole>} />
            <Route path="autoren" element={<RequireRole roles={['admin']}><PageBoundary><AdminAuthors /></PageBoundary></RequireRole>} />
            <Route path="einstellungen" element={<RequireRole roles={['admin']}><PageBoundary><AdminSettings /></PageBoundary></RequireRole>} />
            <Route path="crash-log" element={<RequireRole roles={['admin']}><PageBoundary><CrashLog /></PageBoundary></RequireRole>} />
            <Route path="newsletter" element={<RequireRole roles={['admin']}><PageBoundary><Newsletter /></PageBoundary></RequireRole>} />
            <Route path="mitarbeiter" element={<RequireRole roles={['admin']}><PageBoundary><AdminStaff /></PageBoundary></RequireRole>} />
            <Route path="audit" element={<RequireRole roles={['admin']}><PageBoundary><AuditLog /></PageBoundary></RequireRole>} />
          </Route>
        </Routes>
        </AppErrorBoundary>
      </Suspense>
    </BrowserRouter>
  )
}

// Globale Fehler-Handler (window.onerror + unhandledrejection) aktivieren
installGlobalErrorHandlers()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
)
