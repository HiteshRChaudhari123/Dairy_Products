// Every backend endpoint as an RTK Query hook. Auth uses httpOnly cookies; on a 401 we
// try /auth/refresh once and replay the request.
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { loggedOut, setUser } from '../features/auth/authSlice'

const rawBaseQuery = fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL || '/api', credentials: 'include' })

let refreshing = null
async function baseQuery(args, api, extra) {
  let result = await rawBaseQuery(args, api, extra)
  const url = typeof args === 'string' ? args : args.url
  if (result.error?.status === 401 && !url.startsWith('/auth/')) {
    refreshing ??= rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extra).finally(() => {
      setTimeout(() => (refreshing = null), 0)
    })
    const refreshed = await refreshing
    if (refreshed.data?.user) {
      api.dispatch(setUser(refreshed.data.user))
      result = await rawBaseQuery(args, api, extra)
    } else {
      api.dispatch(loggedOut())
    }
  }
  return result
}

/** Pull a readable message out of an RTK Query error. */
/**
 * A message a user can act on, from an RTK Query (or thrown) error. Server messages are already written for users;
 * server faults show a short apology with the reference id our logs use, never internal details.
 */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.status === 'FETCH_ERROR') return 'Cannot reach Gavyora right now. Check your internet connection and try again.'
  if (err?.status === 'TIMEOUT_ERROR') return 'The request took too long. Please try again.'
  if (err?.status === 'PARSING_ERROR') return 'The server sent an unexpected response. Please try again.'
  if (typeof err?.status === 'number' && err.status >= 500) {
    const ref = err.data?.requestId ? ` (reference ${err.data.requestId.slice(0, 8)})` : ''
    return `Something went wrong on our side. Please try again in a moment${ref}.`
  }
  return err?.data?.message || (err instanceof Error ? err.message : '') || fallback
}

const TAGS = [
  'Me',
  'Home',
  'Category',
  'Product',
  'Order',
  'MyOrder',
  'Subscription',
  'Wallet',
  'Ticket',
  'Coupon',
  'Banner',
  'Review',
  'Customer',
  'Partner',
  'Delivery',
  'Stats',
  'Admin',
  'Setting',
  'Zone',
  'Page',
  'Audit',
  'Finance',
  'Security',
  'Plan',
  'Membership',
  'Billing',
  'Notification',
  'AdminBilling',
  'Campaign',
]

const q = (params) => {
  if (!params) return ''
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false),
  ).toString()
  return s ? `?${s}` : ''
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: TAGS,
  endpoints: (b) => ({
    // ── Auth ──
    // Session check on page load: 200 with { user } or { user: null } (refreshes an expired token server-side).
    me: b.query({ query: () => ({ url: '/auth/session', method: 'POST' }), providesTags: ['Me'] }),
    login: b.mutation({ query: (body) => ({ url: '/auth/login', method: 'POST', body }) }),
    register: b.mutation({ query: (body) => ({ url: '/auth/register', method: 'POST', body }) }),
    sendOtp: b.mutation({ query: (body) => ({ url: '/auth/otp/send', method: 'POST', body }) }),
    verifyOtp: b.mutation({ query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }) }),
    logout: b.mutation({ query: () => ({ url: '/auth/logout', method: 'POST' }) }),
    logoutAll: b.mutation({ query: () => ({ url: '/auth/logout-all', method: 'POST' }) }),
    forgotPassword: b.mutation({ query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }) }),
    resetPassword: b.mutation({ query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }) }),
    registerDelivery: b.mutation({ query: (body) => ({ url: '/auth/delivery/register', method: 'POST', body }) }),

    // ── Storefront ──
    home: b.query({ query: () => '/home', providesTags: ['Home'] }),
    settings: b.query({ query: () => '/settings', providesTags: ['Setting'] }),
    page: b.query({ query: (slug) => `/pages/${slug}`, providesTags: (_r, _e, slug) => [{ type: 'Page', id: slug }] }),
    categories: b.query({ query: (params) => `/categories${q(params)}`, providesTags: ['Category'] }),
    products: b.query({ query: (params) => `/products${q(params)}`, providesTags: ['Product'] }),
    suggest: b.query({ query: (text) => `/products/suggest${q({ q: text })}` }),
    product: b.query({ query: (slug) => `/products/${slug}`, providesTags: ['Product', 'Review'] }),
    addReview: b.mutation({
      query: ({ productId, ...body }) => ({ url: `/products/${productId}/reviews`, method: 'POST', body }),
      invalidatesTags: ['Review', 'Product'],
    }),
    serviceability: b.query({ query: (pincode) => `/account/serviceability/${pincode}` }),
    availableCoupons: b.query({ query: () => '/coupons/available', providesTags: ['Coupon'] }),

    // ── Account ──
    updateProfile: b.mutation({ query: (body) => ({ url: '/account/profile', method: 'PATCH', body }), invalidatesTags: ['Me'] }),
    changePassword: b.mutation({ query: (body) => ({ url: '/account/password', method: 'PATCH', body }) }),
    addAddress: b.mutation({ query: (body) => ({ url: '/account/addresses', method: 'POST', body }), invalidatesTags: ['Me'] }),
    updateAddress: b.mutation({
      query: ({ id, ...body }) => ({ url: `/account/addresses/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Me'],
    }),
    deleteAddress: b.mutation({ query: (id) => ({ url: `/account/addresses/${id}`, method: 'DELETE' }), invalidatesTags: ['Me'] }),
    wallet: b.query({ query: () => '/account/wallet', providesTags: ['Wallet'] }),
    topupWallet: b.mutation({
      query: (body) => ({ url: '/account/wallet/topup', method: 'POST', body }),
      invalidatesTags: ['Wallet', 'Me'],
    }),
    verifyWalletTopup: b.mutation({
      query: (body) => ({ url: '/account/wallet/topup/verify', method: 'POST', body }),
      invalidatesTags: ['Wallet', 'Me'],
    }),
    myTickets: b.query({ query: () => '/account/tickets', providesTags: ['Ticket'] }),
    myTicket: b.query({ query: (id) => `/account/tickets/${id}`, providesTags: ['Ticket'] }),
    createTicket: b.mutation({ query: (body) => ({ url: '/account/tickets', method: 'POST', body }), invalidatesTags: ['Ticket'] }),
    replyMyTicket: b.mutation({
      query: ({ id, text }) => ({ url: `/account/tickets/${id}/reply`, method: 'POST', body: { text } }),
      invalidatesTags: ['Ticket'],
    }),

    // ── Orders (customer) ──
    quote: b.mutation({ query: (body) => ({ url: '/orders/quote', method: 'POST', body }) }),
    placeOrder: b.mutation({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      invalidatesTags: ['MyOrder', 'Wallet', 'Me', 'Product'],
    }),
    verifyPayment: b.mutation({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/verify-payment`, method: 'POST', body }),
      invalidatesTags: ['MyOrder'],
    }),
    myOrders: b.query({ query: (params) => `/orders/mine${q(params)}`, providesTags: ['MyOrder'] }),
    myOrder: b.query({ query: (id) => `/orders/mine/${id}`, providesTags: ['MyOrder'] }),
    cancelOrder: b.mutation({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['MyOrder', 'Wallet', 'Me'],
    }),
    returnOrder: b.mutation({
      query: ({ id, reason }) => ({ url: `/orders/${id}/return`, method: 'POST', body: { reason } }),
      invalidatesTags: ['MyOrder'],
    }),

    // ── Subscriptions (customer) ──
    mySubscriptions: b.query({ query: () => '/subscriptions', providesTags: ['Subscription'] }),
    subscription: b.query({ query: (id) => `/subscriptions/${id}`, providesTags: ['Subscription'] }),
    subscriptionHistory: b.query({ query: () => '/subscriptions/history', providesTags: ['Subscription'] }),
    subscriptionBilling: b.query({ query: (id) => `/subscriptions/${id}/billing`, providesTags: ['Subscription', 'Billing'] }),
    subscriptionChangeQuote: b.mutation({ query: ({ id, ...body }) => ({ url: `/subscriptions/${id}/change-quote`, method: 'POST', body }) }),
    topupSubscription: b.mutation({
      query: ({ id, ...body }) => ({ url: `/subscriptions/${id}/topup`, method: 'POST', body }),
      invalidatesTags: ['Subscription', 'Billing', 'Wallet', 'Me'],
    }),
    cancelSubscription: b.mutation({
      query: ({ id, reason }) => ({ url: `/subscriptions/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Subscription', 'Billing', 'Wallet', 'Me'],
    }),
    updateSubscription: b.mutation({
      query: ({ id, ...body }) => ({ url: `/subscriptions/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Subscription'],
    }),
    subscriptionVacation: b.mutation({
      query: ({ id, ...body }) => ({ url: `/subscriptions/${id}/vacation`, method: 'POST', body }),
      invalidatesTags: ['Subscription'],
    }),
    subscriptionOverride: b.mutation({
      query: ({ id, ...body }) => ({ url: `/subscriptions/${id}/override`, method: 'POST', body }),
      invalidatesTags: ['Subscription'],
    }),

    // ── Plans, membership and billing (customer) ──
    plans: b.query({ query: (kind) => `/plans${q({ kind })}`, providesTags: ['Plan'] }),
    plan: b.query({ query: (slug) => `/plans/${slug}`, providesTags: ['Plan'] }),
    planQuote: b.mutation({ query: ({ slug, ...body }) => ({ url: `/plans/${slug}/quote`, method: 'POST', body }) }),
    planCheckout: b.mutation({
      query: ({ slug, ...body }) => ({ url: `/plans/${slug}/checkout`, method: 'POST', body }),
      invalidatesTags: ['Membership', 'Subscription', 'Billing', 'Wallet', 'Me', 'Notification'],
    }),
    myMembership: b.query({ query: () => '/billing/membership', providesTags: ['Membership'] }),
    membershipEvents: b.query({ query: (id) => `/billing/membership/${id}/events`, providesTags: ['Membership'] }),
    renewalQuote: b.query({ query: (id) => `/billing/membership/${id}/renewal-quote`, providesTags: ['Membership', 'Wallet'] }),
    cancelMembership: b.mutation({
      query: ({ id, reason }) => ({ url: `/billing/membership/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Membership', 'Billing', 'Wallet', 'Me', 'Notification'],
    }),
    undoMembershipCancel: b.mutation({
      query: (id) => ({ url: `/billing/membership/${id}/undo-cancel`, method: 'POST', body: {} }),
      invalidatesTags: ['Membership', 'Notification'],
    }),
    setMembershipAutoRenew: b.mutation({
      query: ({ id, autoRenew }) => ({ url: `/billing/membership/${id}/auto-renew`, method: 'PATCH', body: { autoRenew } }),
      invalidatesTags: ['Membership'],
    }),
    changeMembershipPlan: b.mutation({
      query: ({ id, slug }) => ({ url: `/billing/membership/${id}/change-plan`, method: 'POST', body: { slug } }),
      invalidatesTags: ['Membership'],
    }),
    renewMembership: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/membership/${id}/renew`, method: 'POST', body }),
      invalidatesTags: ['Membership', 'Billing', 'Wallet', 'Me', 'Notification'],
    }),
    myTransactions: b.query({ query: (page) => `/billing/transactions${q({ page })}`, providesTags: ['Billing'] }),
    myTransaction: b.query({ query: (id) => `/billing/transactions/${id}`, providesTags: ['Billing'] }),
    verifyTransaction: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/transactions/${id}/verify`, method: 'POST', body }),
      invalidatesTags: ['Billing', 'Membership', 'Subscription', 'Notification'],
    }),
    retryFulfilment: b.mutation({
      query: (id) => ({ url: `/billing/transactions/${id}/retry`, method: 'POST', body: {} }),
      invalidatesTags: ['Billing', 'Membership', 'Subscription'],
    }),
    myRefunds: b.query({ query: () => '/billing/refunds', providesTags: ['Billing'] }),
    myInvoices: b.query({ query: () => '/billing/invoices', providesTags: ['Billing'] }),
    myInvoice: b.query({ query: (id) => `/billing/invoices/${id}`, providesTags: ['Billing'] }),
    notifications: b.query({ query: () => '/billing/notifications', providesTags: ['Notification'] }),
    markNotificationsRead: b.mutation({
      query: (ids) => ({ url: '/billing/notifications/read', method: 'POST', body: ids ? { ids } : {} }),
      invalidatesTags: ['Notification'],
    }),

    // ── Admin: memberships, subscriptions, payments (/admin/billing) ──
    billingOverview: b.query({ query: (params) => `/admin/billing/overview${q(params)}`, providesTags: ['AdminBilling'] }),
    adminPlans: b.query({ query: (params) => `/admin/billing/plans${q(params)}`, providesTags: ['Plan'] }),
    adminPlan: b.query({ query: (id) => `/admin/billing/plans/${id}`, providesTags: ['Plan'] }),
    createPlan: b.mutation({ query: (body) => ({ url: '/admin/billing/plans', method: 'POST', body }), invalidatesTags: ['Plan'] }),
    updatePlan: b.mutation({ query: ({ id, ...body }) => ({ url: `/admin/billing/plans/${id}`, method: 'PUT', body }), invalidatesTags: ['Plan'] }),
    publishPlan: b.mutation({
      query: ({ id, note }) => ({ url: `/admin/billing/plans/${id}/publish`, method: 'POST', body: note ? { note } : {} }),
      invalidatesTags: ['Plan'],
    }),
    setPlanStatus: b.mutation({
      query: ({ id, status }) => ({ url: `/admin/billing/plans/${id}/status`, method: 'POST', body: { status } }),
      invalidatesTags: ['Plan'],
    }),
    adminMemberships: b.query({ query: (params) => `/admin/billing/memberships${q(params)}`, providesTags: ['AdminBilling'] }),
    adminMembership: b.query({ query: (id) => `/admin/billing/memberships/${id}`, providesTags: ['AdminBilling'] }),
    membershipAction: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/billing/memberships/${id}/action`, method: 'POST', body }),
      invalidatesTags: ['AdminBilling'],
    }),
    adminPlanSubscriptions: b.query({ query: (params) => `/admin/billing/subscriptions${q(params)}`, providesTags: ['AdminBilling', 'Subscription'] }),
    adminPlanSubscription: b.query({ query: (id) => `/admin/billing/subscriptions/${id}`, providesTags: ['AdminBilling', 'Subscription'] }),
    subscriptionAction: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/billing/subscriptions/${id}/action`, method: 'POST', body }),
      invalidatesTags: ['AdminBilling', 'Subscription'],
    }),
    overrideRequests: b.query({ query: (status) => `/admin/billing/requests${q({ status })}`, providesTags: ['AdminBilling'] }),
    decideRequest: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/billing/requests/${id}/decide`, method: 'POST', body }),
      invalidatesTags: ['AdminBilling', 'Subscription'],
    }),
    adminTransactions: b.query({ query: (params) => `/admin/billing/transactions${q(params)}`, providesTags: ['AdminBilling'] }),
    adminInvoice: b.query({ query: (id) => `/admin/billing/invoices/${id}` }),
    adminRefunds: b.query({ query: (status) => `/admin/billing/refunds${q({ status })}`, providesTags: ['AdminBilling'] }),
    createRefund: b.mutation({ query: (body) => ({ url: '/admin/billing/refunds', method: 'POST', body }), invalidatesTags: ['AdminBilling'] }),
    decideRefund: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/billing/refunds/${id}/decide`, method: 'POST', body }),
      invalidatesTags: ['AdminBilling'],
    }),
    missedDeliveries: b.query({ query: () => '/admin/billing/missed-deliveries', providesTags: ['AdminBilling', 'Order'] }),
    resolveMissed: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/billing/missed-deliveries/${id}/resolve`, method: 'POST', body }),
      invalidatesTags: ['AdminBilling', 'Order', 'Stats'],
    }),
    billingReports: b.query({ query: (params) => `/admin/billing/reports${q(params)}`, providesTags: ['AdminBilling'] }),
    billingSettings: b.query({ query: () => '/admin/billing/settings', providesTags: ['Setting'] }),
    updateBillingSettings: b.mutation({ query: (body) => ({ url: '/admin/billing/settings', method: 'PUT', body }), invalidatesTags: ['Setting'] }),
    billingJobs: b.query({ query: () => '/admin/billing/jobs', providesTags: ['AdminBilling'] }),
    runBillingJob: b.mutation({ query: (name) => ({ url: `/admin/billing/jobs/${name}/run`, method: 'POST', body: {} }), invalidatesTags: ['AdminBilling'] }),

    // ── Delivery partner ──
    deliverySummary: b.query({ query: () => '/delivery/summary', providesTags: ['Delivery'] }),
    deliveryOrders: b.query({ query: (scope = 'active') => `/delivery/orders?scope=${scope}`, providesTags: ['Delivery'] }),
    deliveryOrder: b.query({ query: (id) => `/delivery/orders/${id}`, providesTags: ['Delivery'] }),
    deliveryStatus: b.mutation({
      query: ({ id, ...body }) => ({ url: `/delivery/orders/${id}/status`, method: 'PATCH', body }),
      invalidatesTags: ['Delivery'],
    }),
    uploadProof: b.mutation({
      query: ({ id, image }) => ({ url: `/delivery/orders/${id}/proof`, method: 'POST', body: { image } }),
      invalidatesTags: ['Delivery', 'Order', 'MyOrder'],
    }),
    // Delivery photo proof as a local object URL (`path` is the API path of the image for the caller's role).
    proofImage: b.query({
      query: (path) => ({ url: path, responseHandler: async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : r.json()) }),
      keepUnusedDataFor: 30,
    }),
    deliveryOnline: b.mutation({
      query: (isOnline) => ({ url: '/delivery/online', method: 'PATCH', body: { isOnline } }),
      invalidatesTags: ['Delivery', 'Me'],
    }),
    deliveryProfile: b.mutation({
      query: (body) => ({ url: '/delivery/profile', method: 'PATCH', body }),
      invalidatesTags: ['Me', 'Delivery'],
    }),
    deliveryEarnings: b.query({ query: () => '/delivery/earnings', providesTags: ['Delivery'] }),

    // ── Admin: catalogue ──
    adminProducts: b.query({ query: (params) => `/products/admin/list${q(params)}`, providesTags: ['Product'] }),
    adminProduct: b.query({ query: (id) => `/products/${id}`, providesTags: ['Product'] }),
    createProduct: b.mutation({ query: (body) => ({ url: '/products', method: 'POST', body }), invalidatesTags: ['Product', 'Home', 'Category'] }),
    updateProduct: b.mutation({
      query: ({ id, ...body }) => ({ url: `/products/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Product', 'Home', 'Stats'],
    }),
    deleteProduct: b.mutation({ query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }), invalidatesTags: ['Product', 'Home', 'Category'] }),
    setStock: b.mutation({
      query: ({ id, ...body }) => ({ url: `/products/${id}/stock`, method: 'PATCH', body }),
      invalidatesTags: ['Product', 'Stats'],
    }),
    addBatch: b.mutation({
      query: ({ id, ...body }) => ({ url: `/products/${id}/batches`, method: 'POST', body }),
      invalidatesTags: ['Product', 'Stats'],
    }),
    deleteBatch: b.mutation({
      query: ({ id, batchId }) => ({ url: `/products/${id}/batches/${batchId}`, method: 'DELETE' }),
      invalidatesTags: ['Product', 'Stats'],
    }),
    createCategory: b.mutation({ query: (body) => ({ url: '/categories', method: 'POST', body }), invalidatesTags: ['Category', 'Home'] }),
    updateCategory: b.mutation({
      query: ({ id, ...body }) => ({ url: `/categories/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Category', 'Home'],
    }),
    deleteCategory: b.mutation({ query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }), invalidatesTags: ['Category', 'Home'] }),
    adminReviews: b.query({ query: (params) => `/reviews${q(params)}`, providesTags: ['Review'] }),
    moderateReview: b.mutation({
      query: ({ id, isApproved }) => ({ url: `/reviews/${id}`, method: 'PATCH', body: { isApproved } }),
      invalidatesTags: ['Review', 'Product'],
    }),
    deleteReview: b.mutation({ query: (id) => ({ url: `/reviews/${id}`, method: 'DELETE' }), invalidatesTags: ['Review', 'Product'] }),
    adminBanners: b.query({ query: () => '/banners', providesTags: ['Banner'] }),
    createBanner: b.mutation({ query: (body) => ({ url: '/banners', method: 'POST', body }), invalidatesTags: ['Banner', 'Home'] }),
    updateBanner: b.mutation({
      query: ({ id, ...body }) => ({ url: `/banners/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Banner', 'Home'],
    }),
    deleteBanner: b.mutation({ query: (id) => ({ url: `/banners/${id}`, method: 'DELETE' }), invalidatesTags: ['Banner', 'Home'] }),

    // ── Admin: orders, coupons, subscriptions ──
    adminOrders: b.query({ query: (params) => `/orders${q(params)}`, providesTags: ['Order'] }),
    adminOrder: b.query({ query: (id) => `/orders/${id}`, providesTags: ['Order'] }),
    setOrderStatus: b.mutation({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body }),
      invalidatesTags: ['Order', 'Stats', 'Product'],
    }),
    assignOrder: b.mutation({
      query: ({ id, deliveryPartner }) => ({ url: `/orders/${id}/assign`, method: 'PATCH', body: { deliveryPartner } }),
      invalidatesTags: ['Order', 'Stats', 'Partner'],
    }),
    adminCoupons: b.query({ query: () => '/coupons', providesTags: ['Coupon'] }),
    createCoupon: b.mutation({ query: (body) => ({ url: '/coupons', method: 'POST', body }), invalidatesTags: ['Coupon'] }),
    updateCoupon: b.mutation({
      query: ({ id, ...body }) => ({ url: `/coupons/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Coupon'],
    }),
    deleteCoupon: b.mutation({ query: (id) => ({ url: `/coupons/${id}`, method: 'DELETE' }), invalidatesTags: ['Coupon'] }),
    adminSubscriptions: b.query({ query: (params) => `/subscriptions/admin/list${q(params)}`, providesTags: ['Subscription'] }),
    milkSheet: b.query({ query: (date) => `/subscriptions/admin/sheet${q({ date })}`, providesTags: ['Subscription'] }),
    generateSubscriptionOrders: b.mutation({
      query: (body) => ({ url: '/subscriptions/admin/generate', method: 'POST', body }),
      invalidatesTags: ['Order', 'Subscription', 'Stats'],
    }),

    // ── Admin: people, stats, support, reports ──
    stats: b.query({ query: (days) => `/admin/stats${q({ days })}`, providesTags: ['Stats'] }),
    customers: b.query({ query: (params) => `/admin/customers${q(params)}`, providesTags: ['Customer'] }),
    customer: b.query({ query: (id) => `/admin/customers/${id}`, providesTags: ['Customer'] }),
    blockUser: b.mutation({
      query: ({ id, isBlocked }) => ({ url: `/admin/users/${id}/block`, method: 'PATCH', body: { isBlocked } }),
      invalidatesTags: ['Customer', 'Partner'],
    }),
    adjustWallet: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/customers/${id}/wallet`, method: 'POST', body }),
      invalidatesTags: ['Customer'],
    }),
    partners: b.query({ query: (params) => `/admin/delivery-partners${q(params)}`, providesTags: ['Partner'] }),
    updatePartner: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/delivery-partners/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Partner', 'Stats'],
    }),
    adminTickets: b.query({ query: (params) => `/admin/tickets${q(params)}`, providesTags: ['Ticket'] }),
    adminTicket: b.query({ query: (id) => `/admin/tickets/${id}`, providesTags: ['Ticket'] }),
    replyTicket: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/tickets/${id}/reply`, method: 'POST', body }),
      invalidatesTags: ['Ticket', 'Stats'],
    }),
    setTicketStatus: b.mutation({
      query: ({ id, status }) => ({ url: `/admin/tickets/${id}`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['Ticket', 'Stats'],
    }),
    salesReport: b.query({ query: (params) => `/admin/reports/sales${q(params)}` }),
    zones: b.query({ query: () => '/admin/zones', providesTags: ['Zone'] }),
    campaigns: b.query({ query: () => '/admin/campaigns', providesTags: ['Campaign'] }),
    campaignAudience: b.query({ query: ({ audience, zone }) => ({ url: '/admin/campaigns/audience', params: { audience, ...(zone ? { zone } : {}) } }) }),
    createCampaign: b.mutation({ query: (body) => ({ url: '/admin/campaigns', method: 'POST', body }), invalidatesTags: ['Campaign', 'Notification'] }),
    cancelCampaign: b.mutation({ query: (id) => ({ url: `/admin/campaigns/${id}/cancel`, method: 'POST', body: {} }), invalidatesTags: ['Campaign'] }),

    // ── Super admin ──
    permissions: b.query({ query: () => '/admin/permissions' }),
    admins: b.query({ query: () => '/admin/admins', providesTags: ['Admin'] }),
    createAdmin: b.mutation({ query: (body) => ({ url: '/admin/admins', method: 'POST', body }), invalidatesTags: ['Admin'] }),
    updateAdmin: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/admins/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Admin'],
    }),
    deleteAdmin: b.mutation({ query: (id) => ({ url: `/admin/admins/${id}`, method: 'DELETE' }), invalidatesTags: ['Admin'] }),
    adminSettings: b.query({ query: () => '/admin/settings', providesTags: ['Setting'] }),
    updateSettings: b.mutation({ query: (body) => ({ url: '/admin/settings', method: 'PUT', body }), invalidatesTags: ['Setting'] }),
    createZone: b.mutation({ query: (body) => ({ url: '/admin/zones', method: 'POST', body }), invalidatesTags: ['Zone'] }),
    updateZone: b.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/zones/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Zone'],
    }),
    deleteZone: b.mutation({ query: (id) => ({ url: `/admin/zones/${id}`, method: 'DELETE' }), invalidatesTags: ['Zone', 'Partner'] }),
    financials: b.query({ query: (months) => `/admin/financials${q({ months })}`, providesTags: ['Finance'] }),
    recordPayout: b.mutation({
      query: ({ id, amount }) => ({ url: `/admin/payouts/${id}`, method: 'POST', body: { amount } }),
      invalidatesTags: ['Finance', 'Partner'],
    }),
    auditLogs: b.query({ query: (params) => `/admin/audit-logs${q(params)}`, providesTags: ['Audit'] }),
    cmsPages: b.query({ query: () => '/admin/pages', providesTags: ['Page'] }),
    savePage: b.mutation({
      query: ({ slug, ...body }) => ({ url: `/admin/pages/${slug}`, method: 'PUT', body }),
      invalidatesTags: ['Page'],
    }),
    systemHealth: b.query({ query: () => '/admin/system' }),
    securityAudit: b.query({ query: () => '/security/audit', providesTags: ['Security'] }),
    runSecurityAudit: b.mutation({ query: () => ({ url: '/security/audit', method: 'POST' }), invalidatesTags: ['Security', 'Audit'] }),
  }),
})

export const {
  useMeQuery,
  useLoginMutation,
  useRegisterMutation,
  useSendOtpMutation,
  useVerifyOtpMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useRegisterDeliveryMutation,
  useHomeQuery,
  useSettingsQuery,
  usePageQuery,
  useCategoriesQuery,
  useProductsQuery,
  useSuggestQuery,
  useProductQuery,
  useAddReviewMutation,
  useLazyServiceabilityQuery,
  useAvailableCouponsQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useAddAddressMutation,
  useUpdateAddressMutation,
  useDeleteAddressMutation,
  useWalletQuery,
  useTopupWalletMutation,
  useVerifyWalletTopupMutation,
  useMyTicketsQuery,
  useMyTicketQuery,
  useCreateTicketMutation,
  useReplyMyTicketMutation,
  useQuoteMutation,
  usePlaceOrderMutation,
  useVerifyPaymentMutation,
  useMyOrdersQuery,
  useMyOrderQuery,
  useCancelOrderMutation,
  useReturnOrderMutation,
  useMySubscriptionsQuery,
  useSubscriptionQuery,
  useUpdateSubscriptionMutation,
  useSubscriptionVacationMutation,
  useSubscriptionOverrideMutation,
  useDeliverySummaryQuery,
  useDeliveryOrdersQuery,
  useDeliveryOrderQuery,
  useDeliveryStatusMutation,
  useUploadProofMutation,
  useProofImageQuery,
  useDeliveryOnlineMutation,
  useDeliveryProfileMutation,
  useDeliveryEarningsQuery,
  useAdminProductsQuery,
  useAdminProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useSetStockMutation,
  useAddBatchMutation,
  useDeleteBatchMutation,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useAdminReviewsQuery,
  useModerateReviewMutation,
  useDeleteReviewMutation,
  useAdminBannersQuery,
  useCreateBannerMutation,
  useUpdateBannerMutation,
  useDeleteBannerMutation,
  useAdminOrdersQuery,
  useAdminOrderQuery,
  useSetOrderStatusMutation,
  useAssignOrderMutation,
  useAdminCouponsQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
  useAdminSubscriptionsQuery,
  useMilkSheetQuery,
  useGenerateSubscriptionOrdersMutation,
  useStatsQuery,
  useCustomersQuery,
  useCustomerQuery,
  useBlockUserMutation,
  useAdjustWalletMutation,
  usePartnersQuery,
  useUpdatePartnerMutation,
  useAdminTicketsQuery,
  useAdminTicketQuery,
  useReplyTicketMutation,
  useSetTicketStatusMutation,
  useSalesReportQuery,
  useLazySalesReportQuery,
  useZonesQuery,
  useCampaignsQuery,
  useCampaignAudienceQuery,
  useCreateCampaignMutation,
  useCancelCampaignMutation,
  usePermissionsQuery,
  useAdminsQuery,
  useCreateAdminMutation,
  useUpdateAdminMutation,
  useDeleteAdminMutation,
  useAdminSettingsQuery,
  useUpdateSettingsMutation,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useDeleteZoneMutation,
  useFinancialsQuery,
  useRecordPayoutMutation,
  useAuditLogsQuery,
  useCmsPagesQuery,
  useSavePageMutation,
  useSystemHealthQuery,
  useSecurityAuditQuery,
  useRunSecurityAuditMutation,
} = api

export const {
  useSubscriptionHistoryQuery,
  useSubscriptionBillingQuery,
  useSubscriptionChangeQuoteMutation,
  useTopupSubscriptionMutation,
  useCancelSubscriptionMutation,
  usePlansQuery,
  usePlanQuery,
  usePlanQuoteMutation,
  usePlanCheckoutMutation,
  useMyMembershipQuery,
  useMembershipEventsQuery,
  useRenewalQuoteQuery,
  useCancelMembershipMutation,
  useUndoMembershipCancelMutation,
  useSetMembershipAutoRenewMutation,
  useChangeMembershipPlanMutation,
  useRenewMembershipMutation,
  useMyTransactionsQuery,
  useMyTransactionQuery,
  useVerifyTransactionMutation,
  useRetryFulfilmentMutation,
  useMyRefundsQuery,
  useMyInvoicesQuery,
  useMyInvoiceQuery,
  useNotificationsQuery,
  useMarkNotificationsReadMutation,
  useBillingOverviewQuery,
  useAdminPlansQuery,
  useAdminPlanQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  usePublishPlanMutation,
  useSetPlanStatusMutation,
  useAdminMembershipsQuery,
  useAdminMembershipQuery,
  useMembershipActionMutation,
  useAdminPlanSubscriptionsQuery,
  useAdminPlanSubscriptionQuery,
  useSubscriptionActionMutation,
  useOverrideRequestsQuery,
  useDecideRequestMutation,
  useAdminTransactionsQuery,
  useAdminInvoiceQuery,
  useAdminRefundsQuery,
  useCreateRefundMutation,
  useDecideRefundMutation,
  useMissedDeliveriesQuery,
  useResolveMissedMutation,
  useBillingReportsQuery,
  useBillingSettingsQuery,
  useUpdateBillingSettingsMutation,
  useBillingJobsQuery,
  useRunBillingJobMutation,
} = api
