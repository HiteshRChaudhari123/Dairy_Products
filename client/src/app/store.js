import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../features/auth/authSlice'
import cartReducer from '../features/cart/cartSlice'
import wishlistReducer from '../features/wishlist/wishlistSlice'
import { save } from '../lib/storage'
import { api } from './api'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    wishlist: wishlistReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),
})

// Persist cart + wishlist across visits.
let prev = {}
store.subscribe(() => {
  const { cart, wishlist } = store.getState()
  if (cart !== prev.cart) save('gv_cart', cart)
  if (wishlist !== prev.wishlist) save('gv_wishlist', wishlist)
  prev = { cart, wishlist }
})
