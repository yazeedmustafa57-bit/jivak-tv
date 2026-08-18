import { Navigate } from 'react-router-dom'
import { currentUser } from '../../lib/staff.js'

// Route-Guard: erlaubt nur bestimmte Rollen (AdminLayout prüft bereits den Login).
export default function RequireRole({ roles, children }) {
  const user = currentUser()
  if (!user || !user.role) return null
  if (!roles.includes(user.role)) return <Navigate to="/admin" replace />
  return children
}
