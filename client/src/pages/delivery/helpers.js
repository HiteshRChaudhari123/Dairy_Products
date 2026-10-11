// Small helpers shared by the delivery partner pages.

export const addressText = (a = {}) =>
  [a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ')

export const navigateUrl = (a) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText(a))}`

export const routeUrl = (addresses) =>
  'https://www.google.com/maps/dir/' + addresses.map((a) => encodeURIComponent(addressText(a))).join('/')

/** Amount the rider must collect at the door (0 for prepaid orders). */
export const toCollect = (o) => (o.payment?.method === 'cod' && o.payment?.status !== 'paid' ? o.total : 0)

export const itemsSummary = (items = []) =>
  items.map((i) => `${i.qty}× ${i.name} (${i.variantLabel})`).join(', ')

/** Sort stops by pincode, then delivery slot. */
export const byStop = (a, b) =>
  (a.address?.pincode || '').localeCompare(b.address?.pincode || '') ||
  (a.slot?.date || '').localeCompare(b.slot?.date || '') ||
  (a.slot?.label || '').localeCompare(b.slot?.label || '')
