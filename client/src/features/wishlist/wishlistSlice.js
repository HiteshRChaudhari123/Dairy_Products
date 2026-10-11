import { createSlice } from '@reduxjs/toolkit'
import { load } from '../../lib/storage'

// Stores a lightweight snapshot of each product so the wishlist renders without a request.
const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState: load('gv_wishlist', { items: [] }),
  reducers: {
    toggleWishlist(state, { payload: product }) {
      const i = state.items.findIndex((p) => p._id === product._id)
      if (i >= 0) state.items.splice(i, 1)
      else
        state.items.unshift({
          _id: product._id,
          slug: product.slug,
          name: product.name,
          images: product.images,
          category: product.category,
          variants: product.variants,
          price: product.price,
          mrp: product.mrp,
          rating: product.rating,
          numReviews: product.numReviews,
        })
    },
  },
})

export const { toggleWishlist } = wishlistSlice.actions
export default wishlistSlice.reducer
export const selectWishlist = (s) => s.wishlist.items
export const selectIsWished = (id) => (s) => s.wishlist.items.some((p) => p._id === id)
