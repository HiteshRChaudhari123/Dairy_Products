import { Bookmark, ShoppingCart, Trash2, Truck } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { useSettingsQuery } from '../../app/api'
import ProductImage from '../../components/ProductImage'
import { EmptyState, QtyStepper } from '../../components/ui'
import {
  moveToCart,
  removeFromCart,
  removeSaved,
  saveForLater,
  selectCart,
  selectCartCount,
  selectCartSubtotal,
  setQty,
} from '../../features/cart/cartSlice'
import { discountPct, formatINR } from '../../lib/format'

export default function Cart() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { items, saved } = useSelector(selectCart)
  const count = useSelector(selectCartCount)
  const subtotal = useSelector(selectCartSubtotal)
  const { data: settings } = useSettingsQuery()


  const mrpTotal = items.reduce((s, i) => s + i.mrp * i.qty, 0)
  const freeAbove = settings?.freeDeliveryAbove ?? 299
  const fee = subtotal >= freeAbove ? 0 : (settings?.deliveryFee ?? 25)
  const minOrder = settings?.minOrderValue ?? 0
  const belowMin = subtotal < minOrder
  const total = subtotal + fee
  const progress = Math.min(100, (subtotal / freeAbove) * 100)
  const ids = (l) => ({ product: l.product, variantId: l.variantId })

  const savedList = saved.length > 0 && (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold">Saved for later ({saved.length})</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {saved.map((l) => (
          <div key={`${l.product}:${l.variantId}`} className="card flex gap-3 p-3">
            <Link to={`/p/${l.slug}`} className="w-16 shrink-0">
              <ProductImage src={l.image} icon={l.icon} name={l.name} size="text-2xl" rounded="rounded-lg" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.name}</p>
              <p className="text-xs text-muted">
                {l.variantLabel} · {formatINR(l.price)}
              </p>
              <div className="mt-2 flex gap-2">
                <button className="btn-outline btn-sm" onClick={() => dispatch(moveToCart(ids(l)))}>
                  Move to cart
                </button>
                <button className="btn-ghost btn-sm text-error" onClick={() => dispatch(removeSaved(ids(l)))}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  if (!items.length)
    return (
      <div className="container-page py-6">
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          text="Fresh milk, curd, paneer and more are just a tap away."
          action={
            <Link to="/" className="btn-primary">
              Start shopping
            </Link>
          }
        />
        {savedList}
      </div>
    )

  return (
    <div className="container-page py-6 pb-40 md:pb-6">
      <h1 className="mb-5 text-2xl font-bold">
        My cart <span className="text-base font-normal text-muted">({count} items)</span>
      </h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="card mb-4 p-4">
            <p className="flex items-center gap-2 text-sm">
              <Truck className="size-4 text-brand" />
              {fee === 0 ? (
                <span className="font-medium text-brand">Yay! You get FREE delivery.</span>
              ) : (
                <span>
                  Add <b>{formatINR(freeAbove - subtotal)}</b> more for <b>free delivery</b>
                </span>
              )}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <ul className="card divide-y divide-line">
            {items.map((l) => {
              const off = discountPct(l.price, l.mrp)
              return (
                <li key={`${l.product}:${l.variantId}`} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link to={`/p/${l.slug}`} className="w-20 shrink-0 sm:w-24">
                    <ProductImage src={l.image} icon={l.icon} name={l.name} size="text-3xl" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/p/${l.slug}`} className="line-clamp-2 text-sm font-medium hover:text-accent sm:text-base">
                      {l.name}
                    </Link>
                    <p className="text-xs text-muted">{l.variantLabel}</p>
                    <p className="mt-1 flex items-center gap-2">
                      <b>{formatINR(l.price)}</b>
                      {off > 0 && (
                        <>
                          <span className="text-xs text-muted line-through">{formatINR(l.mrp)}</span>
                          <span className="text-xs font-semibold text-success">{off}% off</span>
                        </>
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <QtyStepper small value={l.qty} max={l.stock ?? 50} onChange={(qty) => dispatch(setQty({ ...ids(l), qty }))} />
                      <button className="btn-ghost btn-sm" onClick={() => dispatch(saveForLater(ids(l)))}>
                        <Bookmark className="size-4" /> <span className="hidden xs:inline">Save for later</span>
                      </button>
                      <button className="btn-ghost btn-sm text-error" onClick={() => dispatch(removeFromCart(ids(l)))} aria-label="Remove">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <p className="hidden font-semibold sm:block">{formatINR(l.price * l.qty)}</p>
                </li>
              )
            })}
          </ul>
          {savedList}
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold">Price details</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">MRP ({count} items)</dt>
                <dd>{formatINR(mrpTotal)}</dd>
              </div>
              {mrpTotal > subtotal && (
                <div className="flex justify-between">
                  <dt className="text-muted">Discount on MRP</dt>
                  <dd className="text-success">−{formatINR(mrpTotal - subtotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Delivery fee</dt>
                <dd>{fee ? formatINR(fee) : <span className="text-success">FREE</span>}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatINR(total)}</dd>
              </div>
            </dl>
            {mrpTotal - subtotal > 0 && (
              <p className="mt-3 rounded-lg bg-primary-soft p-2 text-center text-xs font-medium text-brand">
                You save {formatINR(mrpTotal - subtotal)} on this order 🎉
              </p>
            )}
            {belowMin && (
              <p className="mt-3 rounded-lg bg-secondary-soft p-2 text-center text-xs">
                Minimum order is {formatINR(minOrder)}. Add {formatINR(minOrder - subtotal)} more.
              </p>
            )}
            <button className="btn-primary mt-4 hidden w-full md:flex" disabled={belowMin} onClick={() => navigate('/checkout')}>
              Proceed to checkout
            </button>
            <p className="mt-3 text-center text-xs text-muted">Coupons can be applied at checkout</p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="mr-auto leading-tight">
          <p className="font-heading font-bold">{formatINR(total)}</p>
          <p className="text-xs text-muted">{count} items</p>
        </div>
        <button className="btn-primary" disabled={belowMin} onClick={() => navigate('/checkout')}>
          <ShoppingCart className="size-4" /> Checkout
        </button>
      </div>
    </div>
  )
}
