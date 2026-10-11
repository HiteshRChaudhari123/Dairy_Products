import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { homeForRole, selectAuthReady, selectSignedOut, selectUser } from '../features/auth/authSlice'
import { PageLoader } from './ui'

/**
 * The `?next=` page to return to after login, only if it is a path on this site. Anything else ("//evil.com",
 * "/\evil.com", "https://…", "javascript:…") falls back, so a crafted login link can't send people off-site.
 */
export function safeNext(next, fallback = '/') {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\u0000-\u001f]/.test(next)) return fallback
  return next
}

/** Only render children for logged-in users with one of `roles` (any role if omitted). */
export function RequireAuth({ roles, children }) {
  const user = useSelector(selectUser)
  const ready = useSelector(selectAuthReady)
  const signedOut = useSelector(selectSignedOut)
  const location = useLocation()
  if (!ready) return <PageLoader />
  if (!user && signedOut) return <Navigate to="/" replace />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />
  return children
}

/** Pages like /login: bounce already-logged-in users to their panel. */
export function GuestOnly({ children }) {
  const user = useSelector(selectUser)
  const ready = useSelector(selectAuthReady)
  const next = new URLSearchParams(useLocation().search).get('next')
  if (!ready) return <PageLoader />
  if (user) return <Navigate to={safeNext(next, homeForRole(user.role))} replace />
  return children
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** '/admin' or '/superadmin': admin pages are shared by both panels, so build links with this. */
export function usePanelBase() {
  return useLocation().pathname.startsWith('/superadmin') ? '/superadmin' : '/admin'
}

/** Admins only see tabs/pages they have permission for; super admin sees everything. */
export const hasPerm = (user, perm) => user?.role === 'superadmin' || (user?.role === 'admin' && user.permissions?.includes(perm))

/**
 * Admin pages an admin lacks the permission for show a "no access" message instead of a half-working page. The
 * server enforces the same permissions on every API call; this only keeps the panel honest about it.
 */
export function RequirePerm({ perm, children }) {
  const user = useSelector(selectUser)
  if (hasPerm(user, perm)) return children
  return (
    <div className="card mx-auto mt-8 max-w-md p-8 text-center" role="alert">
      <p className="text-4xl" aria-hidden="true">
        🔒
      </p>
      <h1 className="mt-3 text-lg font-semibold">You don't have access to this page</h1>
      <p className="mt-1 text-sm text-muted">It needs the “{perm}” permission. Ask the owner to add it to your admin role.</p>
      <Link to={panelHome(user)} className="btn-primary mt-5">
        Back to dashboard
      </Link>
    </div>
  )
}
const panelHome = (user) => (user?.role === 'superadmin' ? '/superadmin' : '/admin')
