import {
  BarChart3,
  Bell,
  Bike,
  Building2,
  ClipboardList,
  FileText,
  FolderTree,
  HeartPulse,
  Home,
  IndianRupee,
  LayoutDashboard,
  LifeBuoy,
  Map,
  Megaphone,
  Package,
  PackageSearch,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Star,
  TicketPercent,
  User,
  Users,
  Wallet,
  Image,
  Crown,
  CreditCard,
  ClipboardCheck,
  PackageX,
  ListChecks,
  Gauge,
  PieChart,
  SlidersHorizontal,
} from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useMeQuery } from './app/api'
import { GuestOnly, RequireAuth, RequirePerm, ScrollToTop } from './components/guards'
import { PageLoader } from './components/ui'
import { loggedOut, setUser } from './features/auth/authSlice'
import DashboardLayout from './layouts/DashboardLayout'
import StoreLayout from './layouts/StoreLayout'

const P = (loader) => lazy(loader)

// ── Customer store ──
const HomePage = P(() => import('./pages/store/Home'))
const Categories = P(() => import('./pages/store/Categories'))
const Listing = P(() => import('./pages/store/Listing'))
const ProductDetail = P(() => import('./pages/store/ProductDetail'))
const Cart = P(() => import('./pages/store/Cart'))
const Wishlist = P(() => import('./pages/store/Wishlist'))
const Checkout = P(() => import('./pages/store/Checkout'))
const OrderSuccess = P(() => import('./pages/store/OrderSuccess'))
const MySubscriptions = P(() => import('./pages/subscriptions/MySubscriptions'))
const NewSubscription = P(() => import('./pages/subscriptions/NewSubscription'))
const ManageSubscription = P(() => import('./pages/subscriptions/ManageSubscription'))
const PlansPage = P(() => import('./pages/plans/Plans'))
const PlanCheckout = P(() => import('./pages/plans/PlanCheckout'))
const PaymentResult = P(() => import('./pages/plans/PaymentResult'))

// ── Customer account ──
const AccountLayout = P(() => import('./pages/account/AccountLayout'))
const Profile = P(() => import('./pages/account/Profile'))
const Orders = P(() => import('./pages/account/Orders'))
const OrderDetail = P(() => import('./pages/account/OrderDetail'))
const Invoice = P(() => import('./pages/account/Invoice'))
const Addresses = P(() => import('./pages/account/Addresses'))
const WalletPage = P(() => import('./pages/account/Wallet'))
const Rewards = P(() => import('./pages/account/Rewards'))
const AccountSettings = P(() => import('./pages/account/Settings'))
const MembershipPage = P(() => import('./pages/account/Membership'))
const BillingPage = P(() => import('./pages/account/Billing'))
const BillingInvoicePage = P(() => import('./pages/account/BillingInvoicePage'))
const NotificationsPage = P(() => import('./pages/account/Notifications'))
const Support = P(() => import('./pages/support/Support'))
const TicketDetail = P(() => import('./pages/support/TicketDetail'))

// ── Auth + info ──
const Login = P(() => import('./pages/auth/Login'))
const Register = P(() => import('./pages/auth/Register'))
const ForgotPassword = P(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = P(() => import('./pages/auth/ResetPassword'))
const CmsPage = P(() => import('./pages/info/CmsPage'))
const Contact = P(() => import('./pages/info/Contact'))
const Careers = P(() => import('./pages/info/Careers'))
const NotFound = P(() => import('./pages/info/NotFound'))

// ── Delivery partner ──
const DeliveryRegister = P(() => import('./pages/delivery/Register'))
const DeliveryDashboard = P(() => import('./pages/delivery/Dashboard'))
const Deliveries = P(() => import('./pages/delivery/Deliveries'))
const DeliveryOrder = P(() => import('./pages/delivery/DeliveryOrder'))
const RouteMap = P(() => import('./pages/delivery/RouteMap'))
const Earnings = P(() => import('./pages/delivery/Earnings'))
const DeliveryProfile = P(() => import('./pages/delivery/Profile'))
const DeliverySupport = P(() => import('./pages/delivery/Support'))

// ── Admin (shared with super admin) ──
const AdminDashboard = P(() => import('./pages/admin/Dashboard'))
const AdminOrders = P(() => import('./pages/admin/Orders'))
const AdminOrderDetail = P(() => import('./pages/admin/OrderDetail'))
const AdminSubscriptions = P(() => import('./pages/admin/Subscriptions'))
const AdminProducts = P(() => import('./pages/admin/Products'))
const ProductForm = P(() => import('./pages/admin/ProductForm'))
const AdminCategories = P(() => import('./pages/admin/Categories'))
const Inventory = P(() => import('./pages/admin/Inventory'))
const Customers = P(() => import('./pages/admin/Customers'))
const CustomerDetail = P(() => import('./pages/admin/CustomerDetail'))
const Partners = P(() => import('./pages/admin/DeliveryPartners'))
const Coupons = P(() => import('./pages/admin/Coupons'))
const Banners = P(() => import('./pages/admin/Banners'))
const Reviews = P(() => import('./pages/admin/Reviews'))
const Tickets = P(() => import('./pages/admin/Tickets'))
const Notifications = P(() => import('./pages/admin/Notifications'))
const Reports = P(() => import('./pages/admin/Reports'))
const BillingOverview = P(() => import('./pages/admin/billing/Overview'))
const AdminMemberships = P(() => import('./pages/admin/billing/Memberships'))
const AdminMembershipDetail = P(() => import('./pages/admin/billing/Memberships').then((m) => ({ default: m.MembershipDetail })))
const AdminPlanSubscriptions = P(() => import('./pages/admin/billing/PlanSubscriptions'))
const AdminPlanSubscriptionDetail = P(() => import('./pages/admin/billing/PlanSubscriptions').then((m) => ({ default: m.PlanSubscriptionDetail })))
const AdminPayments = P(() => import('./pages/admin/billing/Payments'))
const AdminInvoice = P(() => import('./pages/account/BillingInvoicePage').then((m) => ({ default: m.AdminBillingInvoicePage })))
const MissedDeliveries = P(() => import('./pages/admin/billing/MissedDeliveries'))
const OverrideRequests = P(() => import('./pages/admin/billing/Requests'))
const BillingReports = P(() => import('./pages/admin/billing/Reports'))
const AdminPlans = P(() => import('./pages/superadmin/plans/Plans'))
const PlanEditor = P(() => import('./pages/superadmin/plans/PlanEditor'))

// ── Super admin only ──
const Admins = P(() => import('./pages/superadmin/Admins'))
const Zones = P(() => import('./pages/superadmin/Zones'))
const Financials = P(() => import('./pages/superadmin/Financials'))
const GlobalSettings = P(() => import('./pages/superadmin/Settings'))
const CmsPages = P(() => import('./pages/superadmin/CmsPages'))
const AuditLogs = P(() => import('./pages/superadmin/AuditLogs'))
const SystemHealth = P(() => import('./pages/superadmin/System'))
const Security = P(() => import('./pages/superadmin/Security'))
const BillingSettings = P(() => import('./pages/superadmin/plans/BillingSettings'))

const ADMIN_NAV = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard, end: true, section: 'Overview' },
  { to: 'orders', label: 'Orders', icon: ShoppingBag, perm: 'orders', section: 'Operations' },
  { to: 'subscriptions', label: 'Milk sheet', icon: RefreshCw, perm: 'subscriptions', section: 'Operations' },
  { to: 'missed-deliveries', label: 'Missed deliveries', icon: PackageX, perm: 'orders', section: 'Operations' },
  { to: 'delivery-partners', label: 'Delivery partners', icon: Bike, perm: 'delivery', section: 'Operations' },
  { to: 'products', label: 'Products', icon: Package, perm: 'products', section: 'Catalogue' },
  { to: 'categories', label: 'Categories', icon: FolderTree, perm: 'products', section: 'Catalogue' },
  { to: 'inventory', label: 'Inventory', icon: PackageSearch, perm: 'inventory', section: 'Catalogue' },
  { to: 'customers', label: 'Customers', icon: Users, perm: 'customers', section: 'People' },
  { to: 'reviews', label: 'Reviews', icon: Star, perm: 'reviews', section: 'People' },
  { to: 'tickets', label: 'Support tickets', icon: LifeBuoy, perm: 'tickets', section: 'People' },
  { to: 'coupons', label: 'Coupons & offers', icon: TicketPercent, perm: 'coupons', section: 'Marketing' },
  { to: 'banners', label: 'Banners', icon: Image, perm: 'banners', section: 'Marketing' },
  { to: 'notifications', label: 'Notifications', icon: Megaphone, perm: 'notifications', section: 'Marketing' },
  { to: 'billing', label: 'Overview', icon: Gauge, perm: 'memberships', section: 'Memberships & subscriptions' },
  { to: 'memberships', label: 'Memberships', icon: Crown, perm: 'memberships', section: 'Memberships & subscriptions' },
  { to: 'plan-subscriptions', label: 'Product subscriptions', icon: ListChecks, perm: 'subscriptions', section: 'Memberships & subscriptions' },
  { to: 'plans', label: 'Plans', icon: ClipboardCheck, perm: 'memberships', section: 'Memberships & subscriptions' },
  { to: 'payments', label: 'Payments & refunds', icon: CreditCard, perm: 'memberships', section: 'Memberships & subscriptions' },
  { to: 'requests', label: 'Approval requests', icon: ShieldCheck, perm: 'memberships', section: 'Memberships & subscriptions' },
  { to: 'reports', label: 'Sales reports', icon: BarChart3, perm: 'reports', section: 'Insights' },
  { to: 'subscription-reports', label: 'Subscription reports', icon: PieChart, perm: 'reports', section: 'Insights' },
]

const SUPER_NAV = [
  ...ADMIN_NAV,
  { to: 'admins', label: 'Admins & roles', icon: ShieldCheck, section: 'Owner' },
  { to: 'zones', label: 'Branches & zones', icon: Building2, section: 'Owner' },
  { to: 'financials', label: 'Financials & payouts', icon: IndianRupee, section: 'Owner' },
  { to: 'settings', label: 'Global settings', icon: Settings, section: 'Owner' },
  { to: 'billing-settings', label: 'Billing settings', icon: SlidersHorizontal, section: 'Owner' },
  { to: 'cms', label: 'CMS pages', icon: FileText, section: 'Owner' },
  { to: 'audit-logs', label: 'Audit logs', icon: ScrollText, section: 'Owner' },
  { to: 'system', label: 'System health', icon: HeartPulse, section: 'Owner' },
  { to: 'security', label: 'Security audit', icon: ShieldAlert, section: 'Owner' },
]

const withBase = (base, nav) => nav.map((n) => ({ ...n, to: n.to ? `${base}/${n.to}` : base }))

const DELIVERY_NAV = withBase('/delivery', [
  { to: '', label: 'Today', icon: Home, end: true },
  { to: 'orders', label: 'Deliveries', icon: ClipboardList },
  { to: 'map', label: 'Route map', icon: Map },
  { to: 'earnings', label: 'Earnings', icon: Wallet },
  { to: 'profile', label: 'Profile & KYC', icon: User },
  { to: 'support', label: 'Support', icon: Bell },
])

function adminRoutes() {
  return (
    <>
      <Route index element={<AdminDashboard />} />
      <Route path="orders" element={<RequirePerm perm="orders"><AdminOrders /></RequirePerm>} />
      <Route path="orders/:id" element={<RequirePerm perm="orders"><AdminOrderDetail /></RequirePerm>} />
      <Route path="subscriptions" element={<RequirePerm perm="subscriptions"><AdminSubscriptions /></RequirePerm>} />
      <Route path="products" element={<RequirePerm perm="products"><AdminProducts /></RequirePerm>} />
      <Route path="products/new" element={<RequirePerm perm="products"><ProductForm /></RequirePerm>} />
      <Route path="products/:id" element={<RequirePerm perm="products"><ProductForm /></RequirePerm>} />
      <Route path="categories" element={<RequirePerm perm="products"><AdminCategories /></RequirePerm>} />
      <Route path="inventory" element={<RequirePerm perm="inventory"><Inventory /></RequirePerm>} />
      <Route path="customers" element={<RequirePerm perm="customers"><Customers /></RequirePerm>} />
      <Route path="customers/:id" element={<RequirePerm perm="customers"><CustomerDetail /></RequirePerm>} />
      <Route path="delivery-partners" element={<RequirePerm perm="delivery"><Partners /></RequirePerm>} />
      <Route path="coupons" element={<RequirePerm perm="coupons"><Coupons /></RequirePerm>} />
      <Route path="banners" element={<RequirePerm perm="banners"><Banners /></RequirePerm>} />
      <Route path="reviews" element={<RequirePerm perm="reviews"><Reviews /></RequirePerm>} />
      <Route path="tickets" element={<RequirePerm perm="tickets"><Tickets /></RequirePerm>} />
      <Route path="notifications" element={<RequirePerm perm="notifications"><Notifications /></RequirePerm>} />
      <Route path="reports" element={<RequirePerm perm="reports"><Reports /></RequirePerm>} />
      <Route path="billing" element={<RequirePerm perm="memberships"><BillingOverview /></RequirePerm>} />
      <Route path="memberships" element={<RequirePerm perm="memberships"><AdminMemberships /></RequirePerm>} />
      <Route path="memberships/:id" element={<RequirePerm perm="memberships"><AdminMembershipDetail /></RequirePerm>} />
      <Route path="plan-subscriptions" element={<RequirePerm perm="subscriptions"><AdminPlanSubscriptions /></RequirePerm>} />
      <Route path="plan-subscriptions/:id" element={<RequirePerm perm="subscriptions"><AdminPlanSubscriptionDetail /></RequirePerm>} />
      <Route path="plans" element={<RequirePerm perm="memberships"><AdminPlans /></RequirePerm>} />
      <Route path="plans/new" element={<RequirePerm perm="memberships"><PlanEditor /></RequirePerm>} />
      <Route path="plans/:id" element={<RequirePerm perm="memberships"><PlanEditor /></RequirePerm>} />
      <Route path="payments" element={<RequirePerm perm="memberships"><AdminPayments /></RequirePerm>} />
      <Route path="invoices/:id" element={<RequirePerm perm="memberships"><AdminInvoice /></RequirePerm>} />
      <Route path="missed-deliveries" element={<RequirePerm perm="orders"><MissedDeliveries /></RequirePerm>} />
      <Route path="requests" element={<RequirePerm perm="memberships"><OverrideRequests /></RequirePerm>} />
      <Route path="subscription-reports" element={<RequirePerm perm="reports"><BillingReports /></RequirePerm>} />
    </>
  )
}

/** Restore the session on first load. */
function useBootstrapAuth() {
  const dispatch = useDispatch()
  const { data, isError, isSuccess } = useMeQuery()
  useEffect(() => {
    if (isSuccess && data.user) dispatch(setUser(data.user))
    else if (isSuccess) dispatch(loggedOut())
    else if (isError) dispatch(loggedOut())
  }, [data, isError, isSuccess, dispatch])
}

export default function App() {
  useBootstrapAuth()
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Customer store */}
          <Route element={<StoreLayout />}>
            <Route index element={<HomePage />} />
            <Route path="categories" element={<Categories />} />
            <Route path="c/:slug" element={<Listing mode="category" />} />
            <Route path="search" element={<Listing mode="search" />} />
            <Route path="products" element={<Navigate to="/search" replace />} />
            <Route path="offers" element={<Navigate to="/deals" replace />} />
            <Route path="faq" element={<Support />} />
            <Route path="our-story" element={<Navigate to="/about" replace />} />
            <Route path="deals" element={<Listing mode="deals" />} />
            <Route path="p/:slug" element={<ProductDetail />} />
            <Route path="cart" element={<Cart />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
            <Route path="order-success/:id" element={<RequireAuth><OrderSuccess /></RequireAuth>} />

            <Route path="plans" element={<PlansPage />} />
            <Route path="membership" element={<Navigate to="/plans?kind=membership" replace />} />
            <Route path="plans/payment/:id" element={<RequireAuth><PaymentResult /></RequireAuth>} />
            <Route path="plans/:slug" element={<PlanCheckout />} />
            <Route path="subscriptions" element={<MySubscriptions />} />
            <Route path="subscriptions/new" element={<RequireAuth><NewSubscription /></RequireAuth>} />
            <Route path="subscriptions/:id" element={<RequireAuth><ManageSubscription /></RequireAuth>} />

            <Route path="account" element={<RequireAuth><AccountLayout /></RequireAuth>}>
              <Route index element={<Profile />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="addresses" element={<Addresses />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="rewards" element={<Rewards />} />
              <Route path="settings" element={<AccountSettings />} />
              <Route path="membership" element={<MembershipPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="support" element={<Support />} />
            <Route path="support/tickets/:id" element={<RequireAuth><TicketDetail /></RequireAuth>} />

            <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="verify-otp" element={<Navigate to="/login?mode=otp" replace />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="delivery/register" element={<GuestOnly><DeliveryRegister /></GuestOnly>} />

            {['about', 'terms', 'privacy', 'refund-policy', 'shipping-policy'].map((slug) => (
              <Route key={slug} path={slug} element={<CmsPage slug={slug} />} />
            ))}
            <Route path="contact" element={<Contact />} />
            <Route path="careers" element={<Careers />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Printable invoice (no store chrome) */}
          <Route path="account/orders/:id/invoice" element={<RequireAuth><Invoice /></RequireAuth>} />
          <Route path="account/billing/invoices/:id" element={<RequireAuth><BillingInvoicePage /></RequireAuth>} />

          {/* Delivery partner panel */}
          <Route
            path="delivery"
            element={
              <RequireAuth roles={['delivery']}>
                <DashboardLayout panelName="Delivery partner" nav={DELIVERY_NAV} bottomTabs={DELIVERY_NAV.slice(0, 5)} />
              </RequireAuth>
            }
          >
            <Route index element={<DeliveryDashboard />} />
            <Route path="orders" element={<Deliveries />} />
            <Route path="orders/:id" element={<DeliveryOrder />} />
            <Route path="map" element={<RouteMap />} />
            <Route path="earnings" element={<Earnings />} />
            <Route path="profile" element={<DeliveryProfile />} />
            <Route path="support" element={<DeliverySupport />} />
            <Route path="*" element={<NotFound inPanel />} />
          </Route>

          {/* Admin panel */}
          <Route
            path="admin"
            element={
              <RequireAuth roles={['admin', 'superadmin']}>
                <DashboardLayout panelName="Admin" nav={withBase('/admin', ADMIN_NAV)} />
              </RequireAuth>
            }
          >
            {adminRoutes()}
            <Route path="*" element={<NotFound inPanel />} />
          </Route>

          {/* Super admin panel = every admin page + owner-only pages */}
          <Route
            path="superadmin"
            element={
              <RequireAuth roles={['superadmin']}>
                <DashboardLayout panelName="Super admin" nav={withBase('/superadmin', SUPER_NAV)} />
              </RequireAuth>
            }
          >
            {adminRoutes()}
            <Route path="admins" element={<Admins />} />
            <Route path="zones" element={<Zones />} />
            <Route path="financials" element={<Financials />} />
            <Route path="settings" element={<GlobalSettings />} />
            <Route path="cms" element={<CmsPages />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="system" element={<SystemHealth />} />
            <Route path="security" element={<Security />} />
            <Route path="billing-settings" element={<BillingSettings />} />
            <Route path="*" element={<NotFound inPanel />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
