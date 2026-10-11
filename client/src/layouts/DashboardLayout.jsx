// Shared shell for the admin, super admin and delivery partner panels:
// sidebar on large screens, slide-in drawer on phones (plus bottom tabs for delivery).
import { ExternalLink, LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { hasPerm } from '../components/guards'
import { PageLoader } from '../components/ui'
import { selectUser } from '../features/auth/authSlice'
import { useLogout } from '../hooks/useLogout'
import { useTheme } from '../hooks/useTheme'
import { usePanelRouteMeta } from '../lib/meta'

// Titles for panel pages that have no sidebar entry of their own.
const SUB_PAGES = [
  [/\/products\/new$/, 'Add product'],
  [/\/products\/[^/]+$/, 'Edit product'],
  [/\/orders\/[^/]+$/, 'Order details'],
  [/\/customers\/[^/]+$/, 'Customer details'],
  [/\/memberships\/[^/]+$/, 'Membership details'],
  [/\/plan-subscriptions\/[^/]+$/, 'Subscription details'],
  [/\/plans\/new$/, 'New plan'],
  [/\/plans\/[^/]+$/, 'Plan'],
  [/\/invoices\/[^/]+$/, 'Invoice'],
]

/**
 * nav: [{ to, label, icon, end?, perm?, section? }]
 * bottomTabs: optional subset of nav shown as a phone tab bar
 */
export default function DashboardLayout({ panelName, badge, nav, bottomTabs }) {
  const user = useSelector(selectUser)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [theme, toggleTheme] = useTheme()
  const logout = useLogout()
  const toggleRef = useRef(null)
  const drawerRef = useRef(null)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Phone menu: Escape closes it; focus moves into it and back to the toggle.
  useEffect(() => {
    if (!open) return
    const toggle = toggleRef.current
    drawerRef.current?.querySelector('a, button')?.focus()
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      toggle?.focus()
    }
  }, [open])

  const items = nav.filter((n) => !n.perm || hasPerm(user, n.perm))
  const home = nav.find((n) => n.end)?.to || nav[0].to
  const current = [...nav].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
  const sub = SUB_PAGES.find(([rx]) => rx.test(pathname))?.[1]
  usePanelRouteMeta(`${sub || current?.label || 'Page not found'} · ${panelName}`)

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to={home} className="flex h-16 items-center gap-2 border-b border-night-line px-5" aria-label={`Gavyora ${panelName} home`}>
        <LogoMark className="size-8" light />
        <span className="leading-tight">
          <span className="block font-heading text-lg font-semibold tracking-[0.12em] text-on-night uppercase">Gavyora</span>
          <span className="block text-[11px] font-medium tracking-wide text-secondary uppercase">{panelName}</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {items.map((n, i) => (
          <div key={n.to}>
            {n.section && (i === 0 || items[i - 1].section !== n.section) && (
              <p className="mt-4 mb-1 px-3 text-[10px] font-semibold tracking-wider text-on-night-muted/70 uppercase">{n.section}</p>
            )}
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? 'bg-white/[0.07] font-semibold text-on-night shadow-[inset_2px_0_0_var(--color-platinum)]' : 'text-on-night-muted hover:bg-white/5 hover:text-on-night'
                }`
              }
            >
              <n.icon className="size-4.5 shrink-0" />
              {n.label}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="border-t border-night-line p-3">
        <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-on-night-muted hover:bg-white/10 hover:text-on-night">
          <ExternalLink className="size-4.5" /> View store
        </Link>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-on-night-muted hover:bg-white/10 hover:text-on-night">
          <LogOut className="size-4.5" /> Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-page lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-night lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-night/60" onClick={() => setOpen(false)} />
          <aside ref={drawerRef} id="panel-menu" role="dialog" aria-modal="true" aria-label={`${panelName} menu`} className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-night shadow-xl">
            <button className="absolute top-4 right-3 rounded-lg p-1.5 text-on-night-muted hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            ref={toggleRef}
            className="btn-ghost btn-sm -ml-2 px-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="panel-menu"
          >
            <Menu className="size-5" />
          </button>
          <Link to={home} className="flex min-w-0 items-center gap-2 rounded-lg lg:hidden" aria-label={`Gavyora ${panelName} home`}>
            <LogoMark className="size-7 shrink-0" />
            <span className="truncate font-heading font-bold text-brand">{panelName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {badge}
            <button onClick={toggleTheme} className="btn-ghost btn-sm px-2" aria-label="Toggle dark mode">
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <div className="flex items-center gap-2 pl-1">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft font-semibold text-brand">{user?.name?.[0]}</span>
              <span className="hidden text-sm leading-tight sm:block">
                <span className="block font-medium">{user?.name}</span>
                <span className="block text-xs text-muted capitalize">{user?.role}</span>
              </span>
            </div>
          </div>
        </header>
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 ${bottomTabs ? 'pb-24 lg:pb-8' : ''}`}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {bottomTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomTabs.length}, 1fr)` }}>
            {bottomTabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-muted'}`}
              >
                <t.icon className="size-5" />
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
