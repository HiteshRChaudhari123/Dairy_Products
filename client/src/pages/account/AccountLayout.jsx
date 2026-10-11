import { Bell, Crown, Gift, LogOut, MapPin, Package, ReceiptIndianRupee, RefreshCw, Settings, User, Wallet } from 'lucide-react'
import { Suspense } from 'react'
import { useSelector } from 'react-redux'
import { NavLink, Outlet } from 'react-router-dom'
import { PageLoader } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { useLogout } from '../../hooks/useLogout'
import { formatINR } from '../../lib/format'

const TABS = [
  { to: '/account', label: 'Profile', icon: User, end: true },
  { to: '/account/orders', label: 'Orders', icon: Package },
  { to: '/subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { to: '/account/membership', label: 'Membership', icon: Crown },
  { to: '/account/billing', label: 'Billing & invoices', icon: ReceiptIndianRupee },
  { to: '/account/notifications', label: 'Notifications', icon: Bell },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/wallet', label: 'Wallet', icon: Wallet },
  { to: '/account/rewards', label: 'Rewards & referral', icon: Gift },
  { to: '/account/settings', label: 'Settings', icon: Settings },
]

export default function AccountLayout() {
  const user = useSelector(selectUser)
  const logout = useLogout()

  return (
    <div className="container-page py-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="card sticky top-36 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line bg-primary-soft p-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg font-bold text-on-primary">
                {user?.name?.[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{user?.name}</p>
                <p className="truncate text-xs text-muted">{user?.phone || user?.email}</p>
                <p className="mt-0.5 text-xs font-medium text-brand">Wallet {formatINR(user?.wallet)}</p>
              </div>
            </div>
            <nav className="p-2">
              {TABS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      isActive ? 'bg-primary-soft font-semibold text-brand' : 'hover:bg-surface-2'
                    }`
                  }
                >
                  <Icon className="size-4.5" /> {label}
                </NavLink>
              ))}
              <button
                onClick={logout}
                className="mt-1 flex w-full items-center gap-3 rounded-lg border-t border-line px-3 py-2.5 text-sm text-error hover:bg-surface-2"
              >
                <LogOut className="size-4.5" /> Logout
              </button>
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-heading font-bold text-on-primary">
              {user?.name?.[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{user?.name}</p>
              <p className="text-xs text-muted">Wallet {formatINR(user?.wallet)}</p>
            </div>
            <button onClick={logout} className="btn-ghost btn-sm text-error" aria-label="Logout">
              <LogOut className="size-4" />
            </button>
          </div>
          <nav className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:hidden" aria-label="Account">
            {TABS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap ${
                    isActive ? 'bg-primary text-on-primary' : 'bg-surface-2'
                  }`
                }
              >
                <Icon className="size-4" /> {label}
              </NavLink>
            ))}
          </nav>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
