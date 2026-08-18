import rojLogo from '../assets/roj-logo.png'
import { useI18n } from '../lib/i18n.jsx'

export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="7.5" fill="#E2613E" />
      <g stroke="#E2613E" strokeWidth="2.4" strokeLinecap="round">
        <path d="M16 2.5v4" />
        <path d="M16 25.5v4" />
        <path d="M2.5 16h4" />
        <path d="M25.5 16h4" />
        <path d="M6.5 6.5l2.8 2.8" />
        <path d="M22.7 22.7l2.8 2.8" />
        <path d="M25.5 6.5l-2.8 2.8" />
        <path d="M9.3 22.7l-2.8 2.8" />
      </g>
    </svg>
  )
}

export function LogoImage({ size = 42, className = '' }) {
  const { t } = useI18n()
  return (
    <img
      className={`brand-logo ${className}`}
      src={rojLogo}
      alt={t('logo.alt')}
      width={size}
      height={size}
    />
  )
}

export function Brand({ to = '/', dark = false }) {
  return (
    <a className="brand" href={to}>
      <LogoImage />
      <span>ROJ <em>Media</em></span>
    </a>
  )
}
