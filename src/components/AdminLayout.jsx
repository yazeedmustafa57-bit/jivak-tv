import { NavLink, Link, Outlet, Navigate } from 'react-router-dom'
import { isAuthed, logout } from '../lib/store.js'
import { currentUser, refreshCurrentUser } from '../lib/staff.js'
import { useStoreVersion } from '../lib/useStore.js'
import { Icon } from './ui.jsx'
import { useI18n } from '../lib/i18n.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { useEffect } from 'react'

export default function AdminLayout() {
  const { t } = useI18n()
  useStoreVersion()
  const user = currentUser()
  const role = user?.role || ''

  useEffect(() => {
    refreshCurrentUser().catch(() => {})
  }, [])

  if (!isAuthed()) {
    return <Navigate to="/admin/login" replace />
  }

  const navItems = [
    { to: '/admin', label: t('admin.dashboard'), icon: 'dashboard', end: true, roles: ['admin', 'editor', 'author', 'media'] },
    { to: '/admin/artikel', label: t('admin.articles'), icon: 'artikel', roles: ['admin', 'editor', 'author'] },
    { to: '/admin/artikel/neu', label: t('admin.newArticle'), icon: 'neu', roles: ['admin', 'editor', 'author'] },
    { to: '/admin/medien', label: t('admin.media'), icon: 'medien', roles: ['admin', 'editor', 'media'] },
    { to: '/admin/speicher', label: t('admin.storage'), icon: 'medien', roles: ['admin', 'editor', 'media'] },
    { to: '/admin/mitarbeiter', label: t('admin.staff'), icon: 'authors', roles: ['admin'] },
    { to: '/admin/kategorien', label: t('admin.categories'), icon: 'kategorien', roles: ['admin'] },
    { to: '/admin/autoren', label: t('admin.authors'), icon: 'authors', roles: ['admin'] },
    { to: '/admin/einstellungen', label: t('admin.settings'), icon: 'einstellungen', roles: ['admin'] },
    { to: '/admin/newsletter', label: t('admin.newsletter'), icon: 'mail', roles: ['admin'] },
    { to: '/admin/audit', label: t('admin.audit'), icon: 'refresh', roles: ['admin'] },
    { to: '/admin/crash-log', label: t('crash.title'), icon: 'refresh', roles: ['admin'] }
  ].filter((item) => item.roles.includes(role))

  const roleLabel = {
    admin: t('staff.roleAdmin'),
    editor: t('staff.roleEditor'),
    author: t('staff.roleAuthor'),
    media: t('staff.roleMedia')
  }[role] || ''

  return (
    <div className="admin-shell">
      <div className="admin-body">
        <aside className="admin-sidebar">
          <div className="admin-side-head">
            <Link className="brand" to="/admin">
              <Icon name="sun" size={24} /> <span>ROJ <em>Media</em></span>
            </Link>
            <div className="admin-side-tools">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>
          <nav className="admin-nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            {user && (
              <div className="admin-user">
                <span className="admin-user-name">{user.name || user.email}</span>
                {roleLabel && <span className="admin-user-role">{roleLabel}</span>}
              </div>
            )}
            <Link to="/"><Icon name="website" /> {t('admin.site')}</Link>
            <Link to="/admin/login" onClick={() => logout()}><Icon name="logout" /> {t('admin.logout')}</Link>
          </div>
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
