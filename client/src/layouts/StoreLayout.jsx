import {
  Bell,
  Clock,
  Crown,
  Heart,
  HelpCircle,
  Home as HomeIcon,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShoppingCart,
  User,
  Wallet,
  X,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useNotificationsQuery, useSettingsQuery } from '../app/api'
import Logo from '../components/Logo'
import PincodeModal, { getPincode } from '../components/PincodeModal'
import SearchBar from '../components/SearchBar'
import ThemeToggle from '../components/ThemeToggle'
import { PageLoader } from '../components/ui'
import { homeForRole, selectUser } from '../features/auth/authSlice'
import { selectCartCount } from '../features/cart/cartSlice'
import { useLogout } from '../hooks/useLogout'
import { formatINR, telHref } from '../lib/format'
import { useStoreRouteMeta } from '../lib/meta'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Products' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/plans', label: 'Membership' },
  { to: '/about', label: 'Our Story' },
]

// Extra destinations in the phone menu (the header row has no room for them).
const DRAWER_EXTRA = [
  { to: '/categories', label: 'Categories' },
  { to: '/deals', label: 'Deals of the day' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/support', label: 'Help & support' },
  { to: '/contact', label: 'Contact' },
  { to: '/careers', label: 'Careers' },
]

const ICON = { className: 'size-5', strokeWidth: 1.5 }

/** Small circular badge; always shown on the cart (even 0), hidden elsewhere when empty. */
function CountBadge({ n, always = false }) {
  if (!n && !always) return null
  return (
    <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-on-primary">
      {n > 99 ? '99+' : n}
    </span>
  )
}

function AccountMenu() {
  const user = useSelector(selectUser)
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()
  const { data: notes } = useNotificationsQuery(undefined, { skip: !user, pollingInterval: 120000 })
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!user) {
    return (
      <Link to="/login" className="icon-btn" aria-label="Log in">
        <User {...ICON} />
      </Link>
    )
  }
  const panel = homeForRole(user.role)
  const unread = notes?.unread || 0
  const items = [
    ...(panel !== '/' ? [{ to: panel, label: 'My dashboard', icon: LayoutDashboard }] : []),
    { to: '/account', label: 'My profile', icon: User },
    { to: '/account/orders', label: 'Orders', icon: Package },
    { to: '/subscriptions', label: 'Subscriptions', icon: RefreshCw },
    { to: '/account/membership', label: 'Membership', icon: Crown },
    { to: '/account/notifications', label: unread ? `Notifications (${unread})` : 'Notifications', icon: Bell },
    { to: '/account/wallet', label: 'Wallet', icon: Wallet },
    { to: '/wishlist', label: 'Wishlist', icon: Heart },
    { to: '/support', label: 'Help & support', icon: HelpCircle },
  ]
  return (
    <div ref={ref} className="relative">
      <button className="icon-btn relative" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={unread ? `Account menu, ${unread} unread notifications` : 'Account menu'}>
        <User {...ICON} />
        <CountBadge n={unread} />
      </button>
      {open && (
        <div className="animate-pop absolute right-0 z-40 mt-3 w-60 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-[var(--shadow-lift)]">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-medium">{user.name}</p>
            <p className="text-xs text-muted">Wallet: {formatINR(user.wallet)}</p>
          </div>
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-primary-soft">
              <Icon className="size-4 text-muted" strokeWidth={1.5} /> {label}
            </Link>
          ))}
          <button onClick={logout} className="flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-sm text-error hover:bg-primary-soft">
            <LogOut className="size-4" strokeWidth={1.5} /> Logout
          </button>
        </div>
      )}
    </div>
  )
}

function Navbar() {
  const cartCount = useSelector(selectCartCount)
  const [pinOpen, setPinOpen] = useState(false)
  const [pincode, setPincode] = useState(getPincode())
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const toggleRef = useRef(null)
  const drawerRef = useRef(null)

  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
  }, [pathname])

  // Phone menu: Escape closes it, focus moves into it and back to the toggle, and the page behind doesn't scroll.
  useEffect(() => {
    if (!menuOpen) return
    const toggle = toggleRef.current
    drawerRef.current?.querySelector('a, button')?.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      toggle?.focus()
    }
  }, [menuOpen])

  const linkClass = ({ isActive }) =>
    `relative py-1 text-sm font-medium transition-colors hover:text-ink ${
      isActive ? 'text-ink after:absolute after:inset-x-0 after:-bottom-1 after:h-[1.5px] after:rounded-full after:bg-primary' : 'text-muted'
    }`

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="mx-auto max-w-7xl rounded-2xl border border-line bg-surface/95 shadow-[var(--shadow-soft)] backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-2 px-2 sm:h-[70px] sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <button
              ref={toggleRef}
              className="icon-btn lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
            >
              <Menu {...ICON} />
            </button>
            <Logo compactOnTiny />
          </div>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.label} to={n.to} end={n.end} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <button onClick={() => setSearchOpen((o) => !o)} className="icon-btn" aria-label={searchOpen ? 'Close search' : 'Search'} aria-expanded={searchOpen}>
              {searchOpen ? <X {...ICON} /> : <Search {...ICON} />}
            </button>
            <AccountMenu />
            <Link to="/cart" className="icon-btn relative" aria-label={`Cart, ${cartCount} items`}>
              <ShoppingCart {...ICON} />
              <CountBadge n={cartCount} always />
            </Link>
            {/* No room on phones (it pushed the header past 375px); it lives in the menu drawer there. */}
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
          </div>
        </div>

        {searchOpen && (
          <div className="animate-pop flex items-center gap-3 border-t border-line px-3 py-3 sm:px-6">
            <SearchBar className="min-w-0 flex-1" />
            <button onClick={() => setPinOpen(true)} className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-left hover:bg-primary-soft sm:flex">
              <MapPin className="size-4 text-brand" strokeWidth={1.5} />
              <span className="leading-tight">
                <span className="block text-[11px] text-muted">Deliver to</span>
                <span className="block text-sm font-medium">{pincode || 'Select pincode'}</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Phone/tablet slide-in menu */}
      <div className={`fixed inset-0 z-50 lg:hidden ${menuOpen ? '' : 'pointer-events-none'}`} inert={!menuOpen}>
        <div className={`absolute inset-0 bg-night/50 transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMenuOpen(false)} />
        <div
          id="mobile-menu"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface p-5 shadow-[var(--shadow-lift)] transition-transform duration-300 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <Logo />
            <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X {...ICON} />
            </button>
          </div>
          <nav className="flex flex-col" aria-label="Mobile">
            {[...NAV, ...DRAWER_EXTRA].map((n) => (
              <NavLink
                key={n.label}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex min-h-12 items-center border-b border-line text-[15px] font-medium ${isActive ? 'text-ink' : 'text-muted'}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center justify-between border-b border-line py-3 text-sm text-muted">
            Dark mode
            <ThemeToggle />
          </div>
          <button
            onClick={() => {
              setMenuOpen(false)
              setPinOpen(true)
            }}
            className="mt-2 flex min-h-11 items-center gap-2 text-sm text-muted"
          >
            <MapPin className="size-4 text-brand" strokeWidth={1.5} /> Deliver to <b className="font-medium text-ink">{pincode || 'select pincode'}</b>
          </button>
        </div>
      </div>

      <PincodeModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onSaved={(p) => {
          setPincode(p)
          setTimeout(() => setPinOpen(false), 900)
        }}
      />
    </header>
  )
}

const QUICK_LINKS = [
  ['Home', '/'],
  ['All products', '/search'],
  ['Categories', '/categories'],
  ['Milk subscriptions', '/subscriptions'],
  ['Membership plans', '/plans'],
  ['Deals of the day', '/deals'],
  ['Our story', '/about'],
  ['Careers', '/careers'],
]

const HELP_LINKS = [
  ['Help & FAQ', '/support'],
  ['Contact us', '/contact'],
  ['Delivery information', '/shipping-policy'],
  ['Returns & refunds', '/refund-policy'],
  ['Privacy policy', '/privacy'],
  ['Terms & conditions', '/terms'],
  ['Become a delivery partner', '/delivery/register'],
]

function FooterLinks({ title, links }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-4 font-sans text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">{title}</h2>
      <ul className="space-y-1 text-sm">
        {links.map(([label, to]) => (
          <li key={label}>
            <Link to={to} className="inline-flex min-h-9 items-center text-ink transition-colors hover:text-accent">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Footer() {
  const { data: s } = useSettingsQuery()
  const contact = [
    s?.supportPhone && [Phone, <a key="p" href={telHref(s.supportPhone)} className="hover:text-accent">{s.supportPhone}</a>],
    s?.supportEmail && [Mail, <a key="e" href={`mailto:${s.supportEmail}`} className="break-all hover:text-accent">{s.supportEmail}</a>],
    s?.address && [MapPin, <span key="a">{s.address}</span>],
    [Clock, <span key="h">Care team: 6 AM to 10 PM, every day</span>],
  ].filter(Boolean)
  return (
    <footer className="mt-20 border-t border-line bg-footer pb-24 md:pb-0">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Farm-fresh milk, curd, paneer, ghee and more, collected at dawn and delivered to your door every morning.
          </p>
        </div>
        <FooterLinks title="Shop" links={QUICK_LINKS} />
        <FooterLinks title="Customer care" links={HELP_LINKS} />
        <div>
          <h2 className="mb-4 font-sans text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">Get in touch</h2>
          <ul className="space-y-3 text-sm text-ink">
            {contact.map(([Icon, value], i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-muted md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {s?.storeName || 'Gavyora'}. All rights reserved.
          </p>
          <p>
            FSSAI Lic. No: {s?.fssaiNo || 'applied for'} · GSTIN: {s?.gstNo || 'applied for'}
          </p>
        </div>
      </div>
    </footer>
  )
}

function BottomTabs() {
  const count = useSelector(selectCartCount)
  const user = useSelector(selectUser)
  const tabs = [
    { to: '/', label: 'Home', icon: HomeIcon, end: true },
    { to: '/categories', label: 'Categories', icon: LayoutGrid },
    { to: '/subscriptions', label: 'Subscribe', icon: RefreshCw },
    { to: '/cart', label: 'Cart', icon: ShoppingCart, badge: count },
    { to: user ? '/account' : '/login', label: user ? 'Account' : 'Login', icon: User },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Quick">
      <div className="grid grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-muted'}`}
          >
            <span className="relative">
              <Icon className="size-5" strokeWidth={1.5} />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default function StoreLayout() {
  const { pathname } = useLocation()
  useStoreRouteMeta()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Navbar />
      <main id="main" key={pathname} className="animate-fade flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <BottomTabs />
    </div>
  )
}
