import { addToCart } from '../../features/cart/cartSlice'

/** Put an old order's items back in the cart. The server re-checks prices and stock at checkout. */
export function reorder(dispatch, order) {
  for (const item of order.items) {
    dispatch(
      addToCart({
        product: item.product,
        slug: item.product, // orders don't store the slug; /p/:id works too
        name: item.name,
        image: item.image,
        variantId: item.variantId,
        variantLabel: item.variantLabel,
        price: item.price,
        mrp: item.mrp,
        stock: 50,
        qty: item.qty,
      }),
    )
  }
}
