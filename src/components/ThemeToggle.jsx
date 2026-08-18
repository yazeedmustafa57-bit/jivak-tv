import { useI18n } from '../lib/i18n.jsx'
import { useTheme } from '../lib/useTheme.jsx'
import { Icon } from './ui.jsx'

export default function ThemeToggle({ onDark = false }) {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? t('theme.toLight') : t('theme.toDark')
  return (
    <button
      type="button"
      className={`theme-toggle${onDark ? ' theme-toggle-on-dark' : ''}`}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={18} />
    </button>
  )
}
