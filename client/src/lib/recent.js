// "Recently viewed" products, kept in this browser. Entries are keyed by slug (stable across reseeds) and the home
// page refreshes them from the API, so a changed photo, price or stock never shows stale data.
import { loadList, save } from './storage'

const KEY = 'gv_recent'
const MAX = 10

const snapshot = (p) => ({
  _id: p._id,
  slug: p.slug,
  name: p.name,
  images: p.images,
  category: p.category,
  variants: p.variants,
  highlights: p.highlights,
  price: p.price,
  mrp: p.mrp,
  rating: p.rating,
  numReviews: p.numReviews,
  isSubscribable: p.isSubscribable,
})

export const loadRecent = () => loadList(KEY).filter((p) => p?.slug)

export function rememberViewed(p) {
  save(KEY, [snapshot(p), ...loadRecent().filter((x) => x.slug !== p.slug)].slice(0, MAX))
}

/** Replace the saved list with fresh products (in viewing order); products no longer sold have already dropped out. */
export const saveRecent = (products) => save(KEY, products.map(snapshot))
