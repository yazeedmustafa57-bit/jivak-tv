// Wechselkurs-Widget für ROJ TV (open.er-api.com, kein API-Key).
// Zwei Darstellungsformen:
//   - CurrencyChips:   kompakte Chips im Header ("1 USD = X IQD")
//   - CurrencySection: größere Karten auf der Startseite (Kurs, ▲/▼-Veränderung
//                      zum Vortag, letzte Aktualisierung)
// Fehler blockieren nie die Seite: bei nicht erreichbarer API wird der letzte
// bekannte Stand angezeigt oder dezent ausgeblendet.
import { useI18n } from '../lib/i18n.jsx'
import { useCurrency } from '../lib/useCurrency.js'
import iconDollar from '../assets/currency-icons/dollar.svg?raw'
import iconEuro from '../assets/currency-icons/euro.svg?raw'
import iconDinar from '../assets/currency-icons/dinar.svg?raw'

const ICON_SVGS = {
  USD: iconDollar,
  EUR: iconEuro,
  IQD: iconDinar
}

function CurrencyIcon({ code, size = 20 }) {
  const svg = ICON_SVGS[code] || iconDinar
  return (
    <span
      className="currency-icon"
      style={{ width: size, height: size }}
      role="img"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// 1311.781 → "1,311.78", ganze Zahlen ohne Nachkommastellen.
function formatRate(rate) {
  const n = Number(rate) || 0
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function CurrencyChips() {
  const { t, formatNum } = useI18n()
  const { data, loading, error } = useCurrency()
  const pairs = data?.pairs || []

  if (error && !pairs.length) return null

  return (
    <>
      {loading && !pairs.length
        ? [...Array(2)].map((_, i) => <span key={i} className="skeleton currency-chip-skeleton" />)
        : pairs.map((p) => (
            <span
              key={p.id}
              className="currency-chip"
              title={`1 ${p.base} = ${formatNum(formatRate(p.rate))} ${p.target} · ${t('currency.changeDay')}`}
            >
              <CurrencyIcon code={p.base} size={18} />
              <span className="currency-chip-pair">1 {p.base} =</span>
              <span className="currency-chip-rate">{formatNum(formatRate(p.rate))} {p.target}</span>
              {p.change != null && (
                <span className={`currency-chip-change ${p.change >= 0 ? 'up' : 'down'}`}>
                  {p.change >= 0 ? '▲' : '▼'}
                  {formatNum(Math.abs(p.change).toFixed(2))}%
                </span>
              )}
            </span>
          ))}
    </>
  )
}

export function CurrencySection() {
  const { t, formatDateTime, formatNum } = useI18n()
  const { data, loading, error } = useCurrency()
  const pairs = data?.pairs || []

  return (
    <section className="section">
      <div className="container">
        <div className="sec-head">
          <div>
            <span className="sec-kicker">{t('currency.kicker')}</span>
            <h2>{t('currency.title')}</h2>
            <p>
              {t('currency.sub')}
              {(data?.fetchedAt || data?.updatedAt) && ` · ${t('currency.updated')}: ${formatNum(formatDateTime(data.fetchedAt || data.updatedAt))}`}
            </p>
          </div>
        </div>

        {loading && !pairs.length ? (
          <div className="currency-grid" aria-hidden="true">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="skeleton currency-card-skeleton" />
            ))}
          </div>
        ) : error && !pairs.length ? (
          <p className="currency-unavailable" role="status">
            {t('currency.unavailable')}
          </p>
        ) : (
          <div className="currency-grid">
            {pairs.map((p) => {
              const up = p.change != null && p.change >= 0
              return (
                <div key={p.id} className="currency-card">
                  <div className="currency-card-top">
                    <CurrencyIcon code={p.base} size={40} />
                    <div className="currency-card-names">
                      <span className="currency-pair">{p.base} → {p.target}</span>
                      <span className="currency-names">
                        {t(`currency.${p.base.toLowerCase()}`)} / {t('currency.iqd')}
                      </span>
                    </div>
                  </div>
                  <div className="currency-main">
                    <span className="currency-amount">1 {p.base}</span>
                    <span className="currency-rate">{formatNum(formatRate(p.rate))}</span>
                    <span className="currency-target">{p.target}</span>
                  </div>
                  <div className="currency-foot">
                    {p.change != null ? (
                      <span className={`currency-change ${up ? 'up' : 'down'}`} title={t('currency.changeDay')}>
                        {up ? '▲' : '▼'} {formatNum(Math.abs(p.change).toFixed(2))}% · {t('currency.changeDay')}
                      </span>
                    ) : (
                      <span className="currency-change neutral">–</span>
                    )}
                  </div>
                  <span className="currency-meta">
                    {t('currency.updated')}: {formatNum(formatDateTime(data.fetchedAt || data.updatedAt))}
                  </span>
                  {data?.stale && <span className="currency-stale">{t('currency.stale')}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
