const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const formatINR = (n) => inr.format(Math.round(n || 0))

export const discountPct = (price, mrp) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0)

export const formatDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString('en-IN', opts) : '—'

export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—'

/** YYYY-MM-DD in local time. */
export const dateKey = (d = new Date()) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const dayName = (dateStr, style = 'short') =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: style })

export const ORDER_STEPS = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered']

export const STATUS_LABEL = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  active: 'Active',
  paused: 'Paused',
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  approved: 'Approved',
  rejected: 'Rejected',
  open: 'Open',
  resolved: 'Resolved',
  none: 'Not submitted',
  undelivered: 'Undelivered',
  pending_payment: 'Awaiting payment',
  past_due: 'Past due',
  suspended: 'Suspended',
  cancellation_pending: 'Ends at term end',
  expired: 'Expired',
  created: 'Awaiting payment',
  partially_refunded: 'Partly refunded',
  requested: 'Requested',
  processing: 'Processing',
  succeeded: 'Succeeded',
  draft: 'Draft',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
  superseded: 'Superseded',
  running: 'Running',
  done: 'Done',
}

export const PAYMENT_LABEL = { cod: 'Cash on delivery', wallet: 'Gavyora wallet', online: 'UPI / Card (online)', prepaid: 'Subscription balance' }

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const FREQUENCY_LABEL = { daily: 'Every day', alternate: 'Alternate days', weekly: 'Once a week', custom: 'Selected days' }

/** tel: link for a displayed phone number, e.g. "+91 98765 43210" or "9876543210" → "tel:+919876543210". */
export const telHref = (phone = '') => {
  const digits = String(phone).replace(/[^\d+]/g, '')
  return `tel:${/^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : digits}`
}
