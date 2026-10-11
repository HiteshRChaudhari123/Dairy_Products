import { createSlice } from '@reduxjs/toolkit'
import { load } from '../../lib/storage'

// Cart line: { product, slug, name, image, icon, variantId, variantLabel, price, mrp, stock, qty }
const key = (l) => `${l.product}:${l.variantId}`

const cartSlice = createSlice({
  name: 'cart',
  initialState: load('gv_cart', { items: [], saved: [], coupon: '' }),
  reducers: {
    addToCart(state, { payload }) {
      const { qty = 1, ...line } = payload
      const existing = state.items.find((i) => key(i) === key(line))
      if (existing) existing.qty = Math.min(existing.qty + qty, line.stock ?? 50, 50)
      else state.items.push({ ...line, qty: Math.min(qty, line.stock ?? 50) })
    },
    setQty(state, { payload: { product, variantId, qty } }) {
      const line = state.items.find((i) => key(i) === `${product}:${variantId}`)
      if (!line) return
      if (qty <= 0) state.items = state.items.filter((i) => i !== line)
      else line.qty = Math.min(qty, line.stock ?? 50, 50)
    },
    removeFromCart(state, { payload: { product, variantId } }) {
      state.items = state.items.filter((i) => key(i) !== `${product}:${variantId}`)
    },
    saveForLater(state, { payload: { product, variantId } }) {
      const line = state.items.find((i) => key(i) === `${product}:${variantId}`)
      if (!line) return
      state.items = state.items.filter((i) => i !== line)
      if (!state.saved.some((s) => key(s) === key(line))) state.saved.push(line)
    },
    moveToCart(state, { payload: { product, variantId } }) {
      const line = state.saved.find((i) => key(i) === `${product}:${variantId}`)
      if (!line) return
      state.saved = state.saved.filter((i) => i !== line)
      const existing = state.items.find((i) => key(i) === key(line))
      if (existing) existing.qty += line.qty
      else state.items.push(line)
    },
    removeSaved(state, { payload: { product, variantId } }) {
      state.saved = state.saved.filter((i) => key(i) !== `${product}:${variantId}`)
    },
    setCoupon(state, { payload }) {
      state.coupon = payload || ''
    },
    clearCart(state) {
      state.items = []
      state.coupon = ''
    },
  },
})

export const { addToCart, setQty, removeFromCart, saveForLater, moveToCart, removeSaved, setCoupon, clearCart } =
  cartSlice.actions
export default cartSlice.reducer

export const selectCart = (s) => s.cart
export const selectCartCount = (s) => s.cart.items.reduce((n, i) => n + i.qty, 0)
export const selectCartSubtotal = (s) => s.cart.items.reduce((n, i) => n + i.price * i.qty, 0)
export const selectLineQty = (product, variantId) => (s) =>
  s.cart.items.find((i) => i.product === product && i.variantId === variantId)?.qty || 0

/** Build a cart line from a product document + chosen variant. */
export const toCartLine = (product, variant) => ({
  product: product._id,
  slug: product.slug,
  name: product.name,
  image: product.images?.[0],
  icon: product.category?.icon,
  variantId: variant._id,
  variantLabel: variant.label,
  price: variant.price,
  mrp: variant.mrp,
  stock: variant.stock,
})
