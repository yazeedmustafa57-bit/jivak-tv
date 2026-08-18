import { Component, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.jsx'
import { logError } from '../lib/errorLog.js'

// Lokalisierte Fehlertexte für die Bereichs-Fehler-Grenze
const TEXTS = {
  ar: { title: 'حدث خطأ في هذا القسم.', text: 'يرجى إعادة محاولة تحميل هذا القسم أو العودة إلى الصفحة الرئيسية.', btn: 'إعادة تحميل القسم', home: 'الرئيسية' },
  ku: { title: 'د ڤی بەشێ دا تشتەک تێدا چوو.', text: 'ژ کەرەما خوە ڤی بەشێ دوبارە بار کە یان ڤەگەرە سەر مالپەرێ.', btn: 'بەش دوبارە بار کە', home: 'مالپەرە' },
  en: { title: 'Something went wrong in this section.', text: 'Please reload this section or return to the homepage.', btn: 'Reload section', home: 'Home' },
  de: { title: 'In diesem Bereich ist ein Fehler aufgetreten.', text: 'Bitte lade diesen Bereich neu oder kehre zur Startseite zurück.', btn: 'Bereich neu laden', home: 'Startseite' }
}

class PageBoundaryBase extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, retryKey: 0, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // Fehler protokollieren (inkl. Stacktrace) – die Seite läuft in anderen
    // Bereichen weiter, das Log ist im Admin sichtbar.
    logError('page-boundary', error, {
      componentStack: info && info.componentStack ? info.componentStack : ''
    })
  }
  retry = () => {
    // Nur DIESEN Bereich neu mounten (key-Änderung) – kein Full-Reload.
    this.setState((s) => ({ hasError: false, retryKey: s.retryKey + 1, error: null }))
  }
  render() {
    if (this.state.hasError) {
      const msg = TEXTS[this.props.lang] || TEXTS.de
      return (
        <div className="container" style={{ padding: '110px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-serif, serif)' }}>{msg.title}</h1>
          <p className="lead" style={{ color: 'var(--ink-soft)' }}>{msg.text}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <button className="btn btn-primary" type="button" onClick={this.retry}>
              {msg.btn}
            </button>
            <Link className="btn btn-ghost" to="/">{msg.home}</Link>
          </div>
          {this.state.error && (
            <details style={{ marginTop: 22, textAlign: 'left', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }}>Details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: '#8a1f0e', background: 'rgba(196,71,44,0.06)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                {String(this.state.error && (this.state.error.stack || this.state.error.message) || this.state.error).slice(0, 600)}
              </pre>
            </details>
          )}
        </div>
      )
    }
    // key-Änderung erzwingt einen sauberen Remount des Bereichs nach einem Fehler.
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>
  }
}

/**
 * Fehler-Grenze für einen Seitenbereich (Startseite, Artikel, Videos, Fotos,
 * Suche, Kategorien, Live, Admin …). Ein Fehler in einem Bereich zeigt eine
 * verständliche Meldung – Header, Navigation und alle anderen Bereiche
 * bleiben voll funktionsfähig.
 */
export default function PageBoundary({ children }) {
  const { lang } = useI18n()
  return <PageBoundaryBase lang={lang}>{children}</PageBoundaryBase>
}
