import { BadgeCheck, CheckCircle2, ChevronDown, Heart, MapPin, RefreshCw, ShoppingCart, Truck, XCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useAddReviewMutation, useLazyServiceabilityQuery, useProductQuery } from '../../app/api'
import { getPincode } from '../../components/PincodeModal'
import ProductCard from '../../components/ProductCard'
import ProductImage from '../../components/ProductImage'
import { useTheme } from '../../hooks/useTheme'
import { responsiveImage, themedImage } from '../../lib/images'
import { EmptyState, ErrorState, QtyStepper, Rating, Skeleton, Stars } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { addToCart, toCartLine } from '../../features/cart/cartSlice'
import { selectIsWished, toggleWishlist } from '../../features/wishlist/wishlistSlice'
import { discountPct, formatDate, formatINR } from '../../lib/format'
import { usePageMeta } from '../../lib/meta'
import { rememberViewed } from '../../lib/recent'

const FAQ = [
  ['How long does it stay fresh?', 'Check the shelf life in the details above. Fresh milk and curd should be refrigerated below 4°C and used within the shelf life printed on the pack.'],
  ['How should I store it?', 'Keep dairy refrigerated as soon as it arrives. Ghee can be stored at room temperature in a dry, airtight jar.'],
  ['When will it be delivered?', 'Orders placed before 9 PM are delivered in your chosen slot the next morning. Subscriptions arrive between 6 and 8 AM.'],
  ['Can I return it?', 'If there is any quality issue, raise a return within 24 hours of delivery and we refund to your Gavyora wallet.'],
]

function Gallery({ product }) {
  const images = product.images || []
  const [active, setActive] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [theme] = useTheme()
  const src = images[active]
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {images.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto sm:flex-col">
          {images.map((img, i) => (
            <button
              key={img}
              onClick={() => setActive(i)}
              className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? 'border-gold' : 'border-transparent'}`}
            >
              <ProductImage src={img} name={product.name} rounded="rounded-md" sizes="64px" />
            </button>
          ))}
        </div>
      )}
      <div
        className="relative flex-1 overflow-hidden rounded-2xl border border-line"
        onMouseMove={(e) => {
          if (!src) return
          const r = e.currentTarget.getBoundingClientRect()
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
        }}
        onMouseLeave={() => setZoom(null)}
      >
        <ProductImage product={product} src={src ?? null} size="text-9xl" rounded="rounded-2xl" sizes="(min-width: 768px) 50vw, 100vw" eager />
        {zoom && src && (
          <div
            className="pointer-events-none absolute inset-0 hidden bg-no-repeat md:block"
            style={{ backgroundImage: `url(${responsiveImage(themedImage(src, theme)).src})`, backgroundSize: '200%', backgroundPosition: `${zoom.x}% ${zoom.y}%` }}
          />
        )}
      </div>
    </div>
  )
}

function PincodeCheck() {
  const [pin, setPin] = useState(getPincode())
  const [check, { data, isFetching }] = useLazyServiceabilityQuery()
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <MapPin className="size-4 text-brand" /> Check delivery
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (/^\d{6}$/.test(pin)) check(pin)
        }}
      >
        <input
          className="input"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter pincode"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          aria-label="Pincode"
        />
        <button className="btn-outline" disabled={pin.length !== 6 || isFetching}>
          Check
        </button>
      </form>
      {data &&
        (data.serviceable ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-brand">
            <CheckCircle2 className="size-4" /> Delivered tomorrow morning to {pin}
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-error">
            <XCircle className="size-4" /> We don't deliver here yet
          </p>
        ))}
    </div>
  )
}

function Reviews({ product, reviews }) {
  const user = useSelector(selectUser)
  const [addReview, { isLoading }] = useAddReviewMutation()
  const [form, setForm] = useState({ rating: 0, title: '', comment: '' })
  const [open, setOpen] = useState(false)
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: reviews.filter((r) => r.rating === s).length }))
  const max = Math.max(1, ...dist.map((d) => d.n))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.rating) return toast.error('Please choose a star rating')
    try {
      await addReview({ productId: product._id, ...form }).unwrap()
      toast.success('Thanks for your review!')
      setForm({ rating: 0, title: '', comment: '' })
      setOpen(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <section id="reviews" className="mt-12">
      <h2 className="mb-4 text-xl font-bold">Ratings &amp; reviews</h2>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <p className="font-heading text-4xl font-bold">{Number(product.rating || 0).toFixed(1)}</p>
            <div>
              <Stars value={Math.round(product.rating)} size="size-4" />
              <p className="text-xs text-muted">{product.numReviews} reviews</p>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {dist.map(({ s, n }) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className="w-6">{s}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <span className="w-5 text-right text-muted">{n}</span>
              </div>
            ))}
          </div>
          {user ? (
            <button className="btn-outline mt-5 w-full" onClick={() => setOpen((o) => !o)}>
              Write a review
            </button>
          ) : (
            <Link to={`/login?next=/p/${product.slug}`} className="btn-outline mt-5 w-full">
              Log in to write a review
            </Link>
          )}
        </div>
        <div>
          {open && (
            <form onSubmit={submit} className="card mb-6 space-y-3 p-4">
              <Stars value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
              <input className="input" placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea
                className="input min-h-24"
                placeholder="What did you like or dislike?"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn-primary" disabled={isLoading}>Submit review</button>
              </div>
            </form>
          )}
          {reviews.length === 0 ? (
            <p className="text-sm text-muted">No reviews yet. Be the first to review this product.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reviews.map((r) => (
                <li key={r._id} className="py-4 first:pt-0">
                  <div className="flex items-center gap-2">
                    <Rating value={r.rating} />
                    {r.title && <p className="text-sm font-semibold">{r.title}</p>}
                  </div>
                  {r.comment && <p className="mt-1.5 text-sm">{r.comment}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {r.name} · {formatDate(r.createdAt)}
                    {r.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-brand">
                        <BadgeCheck className="size-3.5" /> Verified purchase
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function BoughtTogether({ product, others }) {
  const dispatch = useDispatch()
  const all = [product, ...others].filter((p) => p.variants?.[0])
  const total = all.reduce((s, p) => s + p.variants[0].price, 0)
  const addAll = () => {
    all.forEach((p) => p.variants[0].stock > 0 && dispatch(addToCart(toCartLine(p, p.variants[0]))))
    toast.success(`${all.length} items added to cart`)
  }
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold">Frequently bought together</h2>
      <div className="card flex flex-col gap-5 p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {all.map((p, i) => (
            <div key={p._id} className="flex items-center gap-2">
              {i > 0 && <span className="text-xl text-muted">+</span>}
              <Link to={`/p/${p.slug}`} className="w-24 shrink-0 text-center sm:w-28">
                <ProductImage product={p} size="text-3xl" />
                <p className="mt-1 line-clamp-2 text-xs">{p.name}</p>
                <p className="text-xs font-semibold">{formatINR(p.variants[0].price)}</p>
              </Link>
            </div>
          ))}
        </div>
        <div className="md:w-56">
          <p className="text-sm text-muted">Total for {all.length} items</p>
          <p className="font-heading text-2xl font-bold">{formatINR(total)}</p>
          <button className="btn-secondary mt-3 w-full" onClick={addAll}>
            Add all to cart
          </button>
        </div>
      </div>
    </section>
  )
}

export default function ProductDetail() {
  const { slug } = useParams()
  const { data, isLoading, error, refetch } = useProductQuery(slug)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [variantId, setVariantId] = useState(null)
  const [qty, setQty] = useState(1)
  const [faq, setFaq] = useState(null)
  const product = data?.product
  const wished = useSelector(selectIsWished(product?._id))
  usePageMeta(product?.name, product && `${product.name}${product.variants?.[0] ? ` from ₹${product.price}` : ''}. ${product.description || ''}`.slice(0, 160))

  useEffect(() => {
    if (!product) return
    rememberViewed(product)
    setVariantId(product.variants[0]?._id)
    setQty(1)
  }, [product])

  if (isLoading)
    return (
      <div className="container-page grid gap-8 py-6 md:grid-cols-2">
        <Skeleton className="aspect-square" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-12" />
        </div>
      </div>
    )
  if (error?.status === 404)
    return (
      <EmptyState
        icon="🔍"
        title="This product isn't available"
        text="It may have been removed or is out of season. Have a look at our other fresh dairy."
        action={
          <Link to="/categories" className="btn-primary">
            Browse categories
          </Link>
        }
      />
    )
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const variant = product.variants.find((v) => v._id === variantId) || product.variants[0]
  const off = discountPct(variant.price, variant.mrp)
  const inStock = variant.stock > 0

  const add = () => {
    dispatch(addToCart({ ...toCartLine(product, variant), qty }))
    toast.success(`${product.name} added to cart`)
  }
  const buyNow = () => {
    dispatch(addToCart({ ...toCartLine(product, variant), qty }))
    navigate('/checkout')
  }

  const details = [
    ['Brand', product.brand],
    ['Category', product.category?.name],
    product.fatPercent != null && ['Fat', `${product.fatPercent}%`],
    product.shelfLifeDays && ['Shelf life', `${product.shelfLifeDays} day${product.shelfLifeDays > 1 ? 's' : ''}`],
    ['Pack size', variant.label],
    variant.sku && ['SKU', variant.sku],
  ].filter(Boolean)

  return (
    <div className="container-page py-6 pb-32 md:pb-6">
      <nav className="mb-4 text-xs text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-accent">Home</Link> /{' '}
        <Link to={`/c/${product.category?.slug}`} className="hover:text-accent">{product.category?.name}</Link> /{' '}
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
        <div className="md:sticky md:top-36 md:self-start">
          <div className="relative">
            <Gallery product={product} />
            <button
              onClick={() => {
                dispatch(toggleWishlist(product))
                toast.success(wished ? 'Removed from your wishlist' : 'Saved to your wishlist')
              }}
              className="absolute top-3 right-3 rounded-full bg-surface p-2.5 shadow"
              aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart className={`size-5 ${wished ? 'fill-error text-error' : 'text-muted'}`} />
            </button>
          </div>
        </div>

        <div>
          <p className="eyebrow">{product.brand}</p>
          <h1 className="mt-2 font-heading text-[34px] leading-[1.08] sm:text-[44px]">{product.name}</h1>
          {product.highlights?.[0] && <p className="mt-1 text-sm text-muted">{product.highlights[0]}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {product.numReviews > 0 ? (
              <a href="#reviews" className="flex items-center gap-2">
                <Rating value={product.rating} />
                <span className="text-xs text-muted">{product.numReviews} ratings</span>
              </a>
            ) : (
              <span className="text-xs text-muted">No ratings yet</span>
            )}
            {product.isVeg && <span className="badge border border-success/40 text-success">● Veg</span>}
            {product.isOrganic && <span className="badge-organic">Organic</span>}
            {product.isA2 && <span className="badge-premium">A2 · Premium</span>}
          </div>

          <div className="mt-5 flex items-end gap-3">
            <p className="text-[28px] leading-none font-semibold">{formatINR(variant.price)}</p>
            {off > 0 && (
              <>
                <p className="text-sm text-subtle line-through">MRP {formatINR(variant.mrp)}</p>
                <span className="badge-premium mb-0.5">{off}% off</span>
              </>
            )}
          </div>
          <p className="text-xs text-muted">Inclusive of all taxes</p>

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-subtle uppercase">Size</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v._id}
                  onClick={() => {
                    setVariantId(v._id)
                    setQty(1)
                  }}
                  className={`min-h-11 rounded-[9px] border px-4 py-2 text-left text-sm transition-colors ${
                    v._id === variant._id ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface hover:border-accent'
                  } ${v.stock <= 0 ? 'opacity-50' : ''}`}
                >
                  <span className="block font-semibold">{v.label}</span>
                  <span className="block text-xs opacity-70">{formatINR(v.price)}</span>
                </button>
              ))}
            </div>
          </div>

          <p className={`mt-4 text-sm font-medium ${inStock ? (variant.stock <= 10 ? 'text-warning' : 'text-success') : 'text-error'}`}>
            {!inStock ? 'Out of stock' : variant.stock <= 10 ? `Hurry, only ${variant.stock} left!` : 'In stock'}
          </p>

          {inStock && (
            <div className="mt-4 hidden flex-wrap items-center gap-3 md:flex">
              <QtyStepper value={qty} max={variant.stock} onChange={(n) => setQty(Math.max(1, n))} />
              <button className="btn-primary flex-1" onClick={add}>
                <ShoppingCart className="size-4" /> Add to cart
              </button>
              <button className="btn-secondary flex-1" onClick={buyNow}>
                <Zap className="size-4" /> Buy now
              </button>
            </div>
          )}

          {product.isSubscribable && (
            <Link
              to={`/subscriptions/new?product=${product._id}&variant=${variant._id}`}
              className="mt-5 flex items-center gap-3 rounded-[12px] border border-gold-line bg-elevated p-4 transition-colors hover:border-gold"
            >
              <RefreshCw className="size-6 shrink-0 text-accent" strokeWidth={1.5} />
              <span className="flex-1">
                <span className="block font-heading text-lg font-semibold">Subscribe &amp; get it every morning</span>
                <span className="block text-xs text-muted">Daily, alternate or custom days. Pause anytime.</span>
              </span>
              <span className="btn-primary btn-sm">Subscribe</span>
            </Link>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PincodeCheck />
            <div className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm">
              <Truck className="size-5 shrink-0 text-brand" />
              <div>
                <p className="font-semibold">Morning delivery</p>
                <p className="text-xs text-muted">Order by 9 PM, get it by 8 AM. Easy 24-hour returns.</p>
              </div>
            </div>
          </div>

          {product.highlights?.length > 0 && (
            <ul className="mt-6 grid grid-cols-2 gap-2">
              {product.highlights.map((h) => (
                <li key={h} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-brand" /> {h}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <h2 className="mb-2 font-semibold">Product details</h2>
            <table className="w-full text-sm">
              <tbody>
                {details.map(([k, v]) => (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="w-32 py-2 text-muted">{k}</td>
                    <td className="py-2">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {product.description && <p className="mt-4 text-sm leading-relaxed text-muted">{product.description}</p>}
          </div>
        </div>
      </div>

      {data.boughtTogether?.length > 0 && <BoughtTogether product={product} others={data.boughtTogether} />}

      <Reviews product={product} reviews={data.reviews} />

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold">Questions &amp; answers</h2>
        <div className="card divide-y divide-line">
          {FAQ.map(([q, a], i) => (
            <div key={q}>
              <button className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}>
                {q}
                <ChevronDown className={`size-4 shrink-0 transition ${faq === i ? 'rotate-180' : ''}`} />
              </button>
              {faq === i && <p className="px-4 pb-4 text-sm text-muted">{a}</p>}
            </div>
          ))}
        </div>
      </section>

      {data.similar?.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">Similar products</h2>
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
            {data.similar.map((p) => (
              <div key={p._id} className="w-40 shrink-0 snap-start sm:w-48 lg:w-52">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mobile sticky buy bar, above the bottom tab bar */}
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
        {inStock ? (
          <div className="flex items-center gap-2">
            <div className="mr-auto leading-tight">
              <p className="font-heading font-bold">{formatINR(variant.price * qty)}</p>
              <p className="text-xs text-muted">{variant.label} × {qty}</p>
            </div>
            <button className="btn-primary px-4" onClick={add}>
              <ShoppingCart className="size-4" /> Add
            </button>
            <button className="btn-secondary px-4" onClick={buyNow}>
              Buy now
            </button>
          </div>
        ) : (
          <p className="py-2 text-center text-sm font-medium text-error">Out of stock</p>
        )}
      </div>
    </div>
  )
}
