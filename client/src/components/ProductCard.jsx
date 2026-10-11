import { ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { addToCart, selectLineQty, toCartLine } from '../features/cart/cartSlice'
import { formatINR } from '../lib/format'
import ProductImage from './ProductImage'

/** One-line descriptor under the name, e.g. "100% Pure" or "High Protein". */
export const tagline = (p) => p.highlights?.[0] || p.category?.name || ''

export default function ProductCard({ product }) {
  const dispatch = useDispatch()
  // Cards show the first pack size; other sizes are chosen on the product page.
  const variant = product.variants?.[0]
  const qty = useSelector(selectLineQty(product._id, variant?._id))
  if (!variant) return null
  const outOfStock = variant.stock <= 0 || qty >= variant.stock

  const add = () => {
    dispatch(addToCart(toCartLine(product, variant)))
    toast.success(`${product.name} added to cart`)
  }

  return (
    <div className="card lift group flex h-full flex-col p-3">
      <Link to={`/p/${product.slug}`} className="block overflow-hidden rounded-xl">
        <ProductImage product={product} rounded="rounded-xl" className="transition duration-500 group-hover:scale-[1.03]" />
      </Link>
      <div className="mt-3 flex flex-1 flex-col px-0.5">
        <Link to={`/p/${product.slug}`} className="line-clamp-1 text-[15px] font-medium text-ink hover:text-accent">
          {product.name}
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-muted">{tagline(product)}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="leading-tight">
            <p className="text-base font-semibold text-brand">{formatINR(variant.price)}</p>
            {product.variants.length > 1 && <p className="text-[11px] text-subtle">{variant.label}</p>}
          </div>
          <button
            className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-dark disabled:opacity-40"
            onClick={add}
            disabled={outOfStock}
            aria-label={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
            title={outOfStock ? 'Out of stock' : 'Add to cart'}
          >
            <ShoppingCart className="size-4" strokeWidth={1.5} />
            {qty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full border border-surface bg-accent text-[10px] font-semibold text-surface">
                {qty}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProductGrid({ products, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 ${className}`}>
      {products.map((p) => (
        <ProductCard key={p._id} product={p} />
      ))}
    </div>
  )
}
