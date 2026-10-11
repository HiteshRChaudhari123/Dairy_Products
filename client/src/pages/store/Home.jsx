import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  History,
  PauseCircle,
  Quote,
  ShieldCheck,
  Snowflake,
  Sprout,
  Star,
  Sunrise,
  Truck,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useHomeQuery, useProductsQuery, useSettingsQuery } from '../../app/api'
import ProductCard from '../../components/ProductCard'
import ProductImage from '../../components/ProductImage'
import Reveal from '../../components/Reveal'
import { ErrorState, Skeleton } from '../../components/ui'
import { discountPct, formatINR } from '../../lib/format'
import { useTheme } from '../../hooks/useTheme'
import { BANNER_POSITION, categoryImage, isDarkPhoto, PHOTOS, responsiveImage } from '../../lib/images'
import { loadRecent, saveRecent } from '../../lib/recent'

// ───────────────────────── helpers ─────────────────────────

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(reducedMotionQuery)
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => !!window.matchMedia?.(reducedMotionQuery).matches,
  )
}

/** "Pure Goodness, Naturally." → ["Pure Goodness,", "Naturally."]; the second line is set in italic. */
function splitTitle(title = '') {
  const comma = title.indexOf(',')
  if (comma > 0 && comma < title.length - 1) return [title.slice(0, comma + 1), title.slice(comma + 1).trim()]
  const words = title.split(' ')
  if (words.length < 3) return [title, '']
  const joiner = words.findIndex((w, i) => i > 0 && ['from', 'in', 'for', 'of', 'with', 'every'].includes(w.toLowerCase()))
  const cut = joiner > 0 ? joiner : Math.ceil(words.length / 2)
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
}

/**
 * Banner photo with an optional dark-mode version. Only the one for the current theme is rendered, so the browser
 * downloads a single image. The first slide is the page's main image: loaded eagerly with high priority.
 */
function ThemedImage({ light, dark, className, eager }) {
  const [theme] = useTheme()
  const src = theme === 'dark' && dark ? dark : light
  return (
    <img
      {...responsiveImage(src, '(min-width: 768px) 66vw, 100vw')}
      alt=""
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding={eager ? 'sync' : 'async'}
      {...(eager ? { fetchPriority: 'high' } : {})}
    />
  )
}

function SectionHeader({ eyebrow, title, text, link, linkLabel = 'View all' }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="h-section mt-1.5">{title}</h2>
        {text && <p className="mt-1.5 text-sm text-muted">{text}</p>}
      </div>
      {link && (
        <Link to={link} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:text-accent">
          {linkLabel} <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      )}
    </div>
  )
}

/** Horizontal, snap-scrolling product row on phones; a regular grid from `md` up. */
function ProductRow({ products, cols = 'md:grid-cols-4' }) {
  return (
    <div className={`scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-5 sm:px-0 md:grid md:content-start md:overflow-visible md:pb-0 ${cols}`}>
      {products.map((p) => (
        <div key={p._id} className="w-[46%] shrink-0 snap-start sm:w-[31%] md:w-auto">
          <ProductCard product={p} />
        </div>
      ))}
    </div>
  )
}

// ───────────────────────── hero ─────────────────────────

// Theme-aware, like the brand reference: a pale blue-white panel with navy text in light mode and a deep navy panel
// in dark mode (both from the --color-hero token). The photo is shown in full, untinted: on phones as a band above the
// copy, from md as the right half of the panel with only a thin blend on its left edge (the copy keeps to the left half).
const edgeBlend = 'bg-[linear-gradient(90deg,var(--color-hero)_0%,transparent_12%)]'

function HeroSlide({ banner: b, active, first }) {
  const [l1, l2] = splitTitle(b.title)
  const Heading = first ? 'h1' : 'h2'
  return (
    <div
      className="relative flex w-full shrink-0 flex-col bg-hero md:min-h-[480px] md:justify-center lg:min-h-[520px]"
      role="group"
      aria-roledescription="slide"
      aria-hidden={!active}
      inert={!active}
    >
      {b.image && (
        <div className="relative h-60 sm:h-80 md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-1/2">
          {/* The banner's imagePosition decides which part of the photo survives the crop (see BANNER_POSITION). */}
          <ThemedImage
            light={b.image}
            dark={b.imageDark}
            eager={first}
            className={`absolute inset-0 size-full object-cover ${BANNER_POSITION[b.imagePosition] || BANNER_POSITION.center}`}
          />
          <div className={`absolute inset-0 hidden md:block ${edgeBlend}`} />
        </div>
      )}
      <div className="relative max-w-xl px-6 pt-6 pb-24 sm:px-10 md:max-w-[50%] md:py-20 lg:px-16">
        {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
        <Heading className="mt-3 font-heading text-[34px] leading-[1.1] font-medium text-ink sm:text-[46px] lg:text-[54px]">
          {l1}
          {l2 && (
            <>
              <br />
              {l2}
            </>
          )}
        </Heading>
        {b.subtitle && <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted sm:text-base">{b.subtitle}</p>}
        {/* Product facts as chips under the copy, so nothing covers the photo. */}
        {b.highlights?.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Highlights">
            {b.highlights.slice(0, 3).map((h) => (
              <li key={h} className="flex items-center gap-1.5 rounded-full border border-line bg-surface/70 py-1 pr-3 pl-1.5 text-[13px] font-medium text-ink">
                <BadgeCheck className="size-4 text-brand" strokeWidth={1.75} aria-hidden /> {h}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to={b.link || '/'} className="btn-primary">
            {b.cta || 'Shop now'} <ArrowRight className="size-4" />
          </Link>
          <Link to="/about" className="btn-outline bg-surface/40 backdrop-blur-sm">
            Our Story
          </Link>
        </div>
      </div>
    </div>
  )
}

function Hero({ banners }) {
  const [i, setI] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const touchX = useRef(null)
  const n = banners.length
  const go = (to) => setI(((to % n) + n) % n)
  const autoplay = n > 1 && !reduced

  if (!n) return null

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-line bg-hero ${hovered || focused ? 'hero-paused' : ''}`}
      aria-roledescription="carousel"
      aria-label="Featured offers"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(i + 1)
        if (e.key === 'ArrowLeft') go(i - 1)
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1))
        touchX.current = null
      }}
    >
      <div className="flex transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
        {banners.map((b, idx) => (
          <HeroSlide key={b._id} banner={b} active={idx === i} first={idx === 0} />
        ))}
      </div>

      {n > 1 && (
        <div className="absolute inset-x-6 bottom-12 flex items-center justify-between gap-4 sm:inset-x-10 lg:inset-x-16">
          <div className="flex items-center gap-2">
            {banners.map((b, idx) => (
              <button
                key={b._id}
                onClick={() => go(idx)}
                className="group flex h-6 items-center"
                aria-label={`Show slide ${idx + 1} of ${n}: ${b.title}`}
                aria-current={idx === i}
              >
                <span
                  className={`relative block h-1 overflow-hidden rounded-full transition-all duration-300 ${
                    idx === i ? 'w-10 bg-line-strong' : 'w-4 bg-line-strong group-hover:bg-accent'
                  }`}
                >
                  {idx === i && (
                    <span
                      key={i}
                      className={`absolute inset-0 rounded-full bg-primary ${autoplay ? 'hero-progress' : ''}`}
                      onAnimationEnd={() => go(i + 1)}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="hidden gap-2 sm:flex">
            <button onClick={() => go(i - 1)} className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface/70 text-ink backdrop-blur-sm hover:border-accent" aria-label="Previous slide">
              <ChevronLeft className="size-5" />
            </button>
            <button onClick={() => go(i + 1)} className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface/70 text-ink backdrop-blur-sm hover:border-accent" aria-label="Next slide">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ───────────────────────── sections ─────────────────────────

function Benefits() {
  const { data: s } = useSettingsQuery()
  const items = [
    [Sunrise, 'Morning delivery', 'At your door by 7 AM'],
    [Truck, 'Free delivery', `On orders above ${formatINR(s?.freeDeliveryAbove ?? 299)}`],
    [PauseCircle, 'Pause anytime', 'Vacation mode in one tap'],
    [ShieldCheck, 'Easy returns', 'Within 24 hours, refund to wallet'],
  ]
  return (
    <section className="card relative z-10 mx-3 -mt-8 grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:mx-8 sm:p-6 lg:grid-cols-4 lg:divide-x lg:divide-line lg:gap-0">
      {items.map(([Icon, title, text]) => (
        <div key={title} className="flex items-center gap-3 lg:justify-center lg:px-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-brand">
            <Icon className="size-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted">{text}</p>
          </div>
        </div>
      ))}
    </section>
  )
}

function CategoryStrip({ categories }) {
  const [theme] = useTheme()
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible">
      {categories.map((c) => {
        const img = categoryImage(c, theme)
        return (
          <Link
            key={c._id}
            to={`/c/${c.slug}`}
            className="group flex w-36 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line bg-surface sm:w-44 lg:w-auto"
          >
            {/* The photo is shown in full (no overlay); the name sits on a solid strip below it. */}
            <span className="relative block aspect-[4/5] overflow-hidden" style={{ background: c.color }}>
              {img ? (
                <img
                  {...responsiveImage(img, '(min-width: 1024px) 20vw, 176px')}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105 ${isDarkPhoto(img) ? 'no-dim' : ''}`}
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-6xl">{c.icon}</span>
              )}
            </span>
            <span className="block px-3 py-2.5">
              <span className="block truncate text-[15px] font-medium text-ink">{c.name}</span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted group-hover:text-accent">
                Shop now <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function useCountdownToMidnight() {
  const calc = () => {
    const end = new Date()
    end.setHours(24, 0, 0, 0)
    return Math.max(0, Math.floor((end - Date.now()) / 1000))
  }
  const [left, setLeft] = useState(calc)
  useEffect(() => {
    const t = setInterval(() => setLeft(calc()), 1000)
    return () => clearInterval(t)
  }, [])
  return [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map((n) => String(n).padStart(2, '0'))
}

function Deals({ deals }) {
  const [h, m, s] = useCountdownToMidnight()
  const best = Math.max(0, ...deals.map((p) => discountPct(p.variants?.[0]?.price, p.variants?.[0]?.mrp)))
  return (
    // items-center: the product row keeps its natural height beside the taller deals panel instead of stretching
    // its cards to match (which left a big empty gap inside each card).
    <div className="grid gap-5 lg:grid-cols-[300px_1fr] lg:items-center">
      <div className="flex flex-col overflow-hidden rounded-2xl bg-night text-on-night">
        {/* Photo in full on top; the copy sits below it on the navy panel instead of over it. */}
        <img
          {...responsiveImage(PHOTOS.milkGlass, '(min-width: 1024px) 300px, 100vw')}
          alt="A glass of fresh milk"
          loading="lazy"
          decoding="async"
          className="no-dim h-44 w-full object-cover sm:h-56 lg:h-44"
        />
        <div className="p-6">
          <p className="text-[11px] font-medium tracking-[0.18em] text-platinum uppercase">Deals of the day</p>
          <p className="mt-2 font-heading text-3xl leading-tight font-semibold">{best > 0 ? `Up to ${best}% off` : "Today's best prices"}</p>
          <p className="mt-1 text-sm text-on-night-muted">Fresh offers every day. These prices end at midnight.</p>
          <div className="mt-4 flex gap-2" role="timer" aria-label={`Deals end in ${h} hours ${m} minutes`}>
            {[
              [h, 'hrs'],
              [m, 'min'],
              [s, 'sec'],
            ].map(([v, l]) => (
              <span key={l} className="flex w-14 flex-col items-center rounded-xl border border-white/15 bg-white/[0.08] py-1.5">
                <span className="text-lg font-semibold tabular-nums">{v}</span>
                <span className="text-[10px] text-on-night-muted uppercase">{l}</span>
              </span>
            ))}
          </div>
          <Link to="/deals" className="btn-premium mt-5 w-full">
            See all deals <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <ProductRow products={deals.slice(0, 4)} />
    </div>
  )
}

const SUB_STEPS = [
  ['Pick your milk', 'Toned, full cream, A2 or curd, in the quantity you need.'],
  ['Choose your days', 'Every day, alternate days or only selected weekdays.'],
  ['Auto-pay, zero hassle', 'Paid from your wallet each night. Pause anytime.'],
]

const SUB_PERKS = [
  [Sunrise, 'At your door by 7 AM'],
  [PauseCircle, 'Pause or skip any day'],
  [Wallet, 'Wallet auto-pay'],
]

/**
 * Subscribe & save: a fixed midnight-navy panel (same in both themes, like the deals panel) with a still life of
 * milk in crystal glassware on black. The photo's black background melts into the navy, so it reads as one piece.
 */
function Subscribe({ products }) {
  const picks = products.filter((p) => p.variants?.[0]).slice(0, 4)
  return (
    <div className="relative overflow-hidden rounded-3xl bg-night text-on-night ring-1 ring-night-line">
      {/* A faint platinum glow behind the copy adds depth to the flat navy. */}
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-platinum/10 blur-3xl" aria-hidden />

      <div className="relative">
        {/* Photo: a top band on phones, the right half of the panel from lg (above the product strip). */}
        <div className="relative h-64 sm:h-80 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[48%]">
          <img
            {...responsiveImage(PHOTOS.milkCrystal, '(min-width: 1024px) 48vw, 100vw')}
            alt="Fresh milk in a glass bottle and crystal glasses"
            loading="lazy"
            decoding="async"
            className="no-dim absolute inset-0 size-full object-cover object-[50%_58%]"
          />
          {/* Shown in full; only a thin blend where the photo meets the copy on wide screens. */}
          <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,var(--color-night)_0%,transparent_14%)] lg:block" />
        </div>

        <div className="relative px-6 pt-7 pb-8 sm:px-10 lg:max-w-[52%] lg:px-14 lg:pt-14 lg:pb-12">
          <p className="flex items-center gap-3 text-[11px] font-medium tracking-[0.24em] text-platinum uppercase">
            <span className="h-px w-8 bg-platinum/60" aria-hidden /> Subscribe &amp; save
          </p>
          <h2 className="mt-4 font-heading text-[32px] leading-[1.1] font-medium sm:text-[44px]">
            Fresh milk,
            <br />
            <span className="text-platinum italic">without ever reordering</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-on-night-muted">
            Set it once and wake up to farm-fresh dairy every morning. Change, skip or pause whenever you like.
          </p>

          <ol className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-6">
            {SUB_STEPS.map(([title, text], idx) => (
              <li key={title} className="border-t border-white/15 pt-4">
                <span className="font-heading text-2xl text-platinum italic">{String(idx + 1).padStart(2, '0')}</span>
                <span className="mt-1 block text-[15px] font-medium">{title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-on-night-muted">{text}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to="/subscriptions" className="btn-premium">
              Start a subscription <ArrowRight className="size-4" />
            </Link>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-on-night-muted">
              {SUB_PERKS.map(([Icon, label]) => (
                <li key={label} className="flex items-center gap-1.5">
                  <Icon className="size-4 text-platinum" strokeWidth={1.5} /> {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {picks.length > 0 && (
        <div className="relative border-t border-white/10 bg-white/[0.03] px-6 py-6 backdrop-blur-sm sm:px-10 lg:px-14">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-heading text-xl font-medium">Popular on subscription</h3>
            <p className="text-xs text-on-night-muted">Prices per delivery. Orders for tomorrow lock at 9 PM.</p>
          </div>
          <ul className="scrollbar-none -mx-6 flex snap-x gap-3 overflow-x-auto px-6 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {picks.map((p) => {
              const v = p.variants[0]
              return (
                <li key={p._id} className="flex w-[78%] shrink-0 snap-start items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 transition-colors hover:border-platinum/40 sm:w-auto">
                  <Link to={`/p/${p.slug}`} className="w-14 shrink-0">
                    <ProductImage product={p} size="text-2xl" rounded="rounded-xl" className="no-dim ring-white/10" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/p/${p.slug}`} className="block truncate text-sm font-medium hover:text-platinum">
                      {p.name}
                    </Link>
                    <p className="text-xs text-on-night-muted">
                      {v.label} · {formatINR(v.price)}
                    </p>
                  </div>
                  <Link
                    to={`/subscriptions/new?product=${p._id}&variant=${v._id}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-on-night transition-colors hover:border-platinum hover:bg-white/10"
                    aria-label={`Subscribe to ${p.name}`}
                    title="Subscribe"
                  >
                    <ArrowRight className="size-4" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

const JOURNEY = [
  [Sprout, 'Partner farms', 'Healthy cows on local farms, milked at dawn.'],
  [Snowflake, 'Chilled in minutes', 'Cooled to 4°C right after milking to lock in freshness.'],
  [FlaskConical, 'Lab tested', 'Every batch is checked for purity and fat content.'],
  [Truck, 'At your door', 'Delivered within hours, before your morning chai.'],
]

function Story() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className="relative">
        <img {...responsiveImage(PHOTOS.farm, '(min-width: 1024px) 600px, 100vw')} alt="Cows grazing on a partner farm at golden hour" loading="lazy" className="aspect-[4/3] w-full rounded-3xl object-cover" />
        <div className="card absolute -bottom-6 left-4 flex max-w-[16rem] items-center gap-3 p-4 sm:left-8">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <Clock className="size-5" />
          </span>
          <p className="text-sm leading-snug">
            <b className="block font-semibold">Farm to door in hours</b>
            <span className="text-muted">Not days, not weeks.</span>
          </p>
        </div>
      </div>
      <div className="pt-6 lg:pt-0">
        <p className="eyebrow">From our farms</p>
        <h2 className="h-section mt-1.5">How your milk reaches you</h2>
        <p className="mt-3 text-[15px] text-muted">
          We work directly with local dairy farmers, pay them fairly and skip the middlemen. No powder, no preservatives, just milk the way it should taste.
        </p>
        <ol className="mt-6 grid gap-5 sm:grid-cols-2">
          {JOURNEY.map(([Icon, title, text], idx) => (
            <li key={title} className="flex gap-3">
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand">
                <Icon className="size-5" strokeWidth={1.5} />
                <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-on-primary">{idx + 1}</span>
              </span>
              <span>
                <span className="block text-[15px] font-medium">{title}</span>
                <span className="block text-[13px] text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link to="/about" className="btn-outline mt-7">
          Read our story <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  )
}

function StarRow({ value }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-4 ${n <= value ? 'fill-primary text-primary' : 'text-line-strong'}`} aria-hidden />
      ))}
    </span>
  )
}

function Testimonials({ reviews }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {reviews.map((r) => (
        <figure key={r._id} className="card flex flex-col p-5">
          <div className="flex items-center justify-between">
            <StarRow value={r.rating} />
            <Quote className="size-6 text-line-strong" aria-hidden />
          </div>
          {r.title && <p className="mt-3 font-medium">{r.title}</p>}
          <blockquote className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">“{r.comment}”</blockquote>
          <figcaption className="mt-4 flex items-center gap-3 border-t border-line pt-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-brand">{r.name?.[0] || '?'}</span>
            <span className="min-w-0 text-sm">
              <span className="flex items-center gap-1 font-medium">
                {r.name}
                {r.isVerifiedPurchase && <BadgeCheck className="size-4 text-accent" aria-label="Verified buyer" />}
              </span>
              {r.product && (
                <Link to={`/p/${r.product.slug}`} className="block truncate text-xs text-muted hover:text-accent">
                  on {r.product.name}
                </Link>
              )}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

// ───────────────────────── page ─────────────────────────

function HomeSkeleton() {
  return (
    <div className="container-page py-5 sm:py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-[460px] rounded-3xl md:h-[520px]" />
      <Skeleton className="mx-8 -mt-8 h-24" />
      <div className="mt-14 flex gap-3 overflow-hidden lg:grid lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-36 shrink-0 rounded-2xl lg:w-auto" />
        ))}
      </div>
      <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  )
}

const section = 'mt-16 sm:mt-20'

/**
 * Recently viewed products, loaded fresh from the API by slug so photos, prices and stock are current (the browser
 * only remembers which products were viewed). Shows nothing until the fresh data arrives, so stale photos never flash.
 */
function useRecentlyViewed() {
  const [slugs] = useState(() => loadRecent().slice(0, 8).map((p) => p.slug))
  const { data } = useProductsQuery({ slugs: slugs.join(','), limit: 8 }, { skip: !slugs.length })
  const products = useMemo(() => {
    const bySlug = Object.fromEntries((data?.items || []).map((p) => [p.slug, p]))
    return slugs.map((s) => bySlug[s]).filter(Boolean)
  }, [data, slugs])
  // Write the fresh copies back so the saved list stays current too.
  useEffect(() => {
    if (data) saveRecent(products)
  }, [data, products])
  return products
}

export default function Home() {
  const { data, isLoading, error, refetch } = useHomeQuery()
  const recent = useRecentlyViewed()


  if (isLoading) return <HomeSkeleton />
  if (error)
    return (
      <div className="container-page py-8">
        <ErrorState error={error} onRetry={refetch} />
      </div>
    )

  const { banners = [], categories = [], featured = [], deals = [], bestSellers = [], subscribable = [], testimonials = [] } = data
  // Fresh picks: featured items that aren't already shown as best sellers.
  const shownIds = new Set(bestSellers.slice(0, 6).map((p) => p._id))
  const freshPicks = featured.filter((p) => !shownIds.has(p._id)).slice(0, 8)

  return (
    <div className="container-page py-5 sm:py-8">
      <Hero banners={banners} />
      <Benefits />

      {categories.length > 0 && (
        <Reveal as="section" className={section}>
          <SectionHeader eyebrow="Explore" title="Shop by category" text="Everything dairy, from your morning milk to festive sweets." link="/categories" />
          <CategoryStrip categories={categories} />
        </Reveal>
      )}

      {bestSellers.length > 0 && (
        <Reveal as="section" className={section}>
          <SectionHeader eyebrow="Most loved" title="Best sellers" text="What families order again and again." link="/search?sort=popular" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
            {bestSellers.slice(0, 6).map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </Reveal>
      )}

      {deals.length > 0 && (
        <Reveal as="section" className={section} aria-label="Deals of the day">
          <Deals deals={deals} />
        </Reveal>
      )}

      {subscribable.length > 0 && (
        <Reveal as="section" className={section} aria-label="Subscribe and save">
          <Subscribe products={subscribable} />
        </Reveal>
      )}

      {freshPicks.length > 0 && (
        <Reveal as="section" className={section}>
          <SectionHeader eyebrow="Handpicked" title="Fresh picks for you" text="Our team's favourites from this week's churn." link="/search" linkLabel="Shop all products" />
          <ProductRow products={freshPicks} />
        </Reveal>
      )}

      <Reveal as="section" className={section} aria-label="Our story">
        <Story />
      </Reveal>

      {testimonials.length > 0 && (
        <Reveal as="section" className={`${section} pt-6`}>
          <SectionHeader eyebrow="Reviews" title="Loved by our customers" text="Real reviews from verified Gavyora buyers." />
          <Testimonials reviews={testimonials} />
        </Reveal>
      )}

      {recent.length > 0 && (
        <Reveal as="section" className={section}>
          <SectionHeader
            eyebrow={
              <span className="inline-flex items-center gap-1.5">
                <History className="size-3.5" /> Pick up where you left off
              </span>
            }
            title="Recently viewed"
          />
          <ProductRow products={recent.slice(0, 4)} />
        </Reveal>
      )}
    </div>
  )
}
