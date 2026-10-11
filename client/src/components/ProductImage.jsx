// Shows the product photo (its dark-mode version in dark mode), or a soft illustrated tile
// (category emoji on a tinted gradient) when no photo has been uploaded yet.
import { useTheme } from '../hooks/useTheme'
import { isDarkPhoto, responsiveImage, themedImage } from '../lib/images'

const TINTS = ['var(--color-surface-2)', 'var(--color-primary-soft)', 'var(--color-surface-2)', 'var(--color-primary-soft)']

function tintFor(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

// Most product images are grid cards: half the screen on phones, a third on tablets, up to ~300px on desktop.
// Slightly generous on purpose: an image picked too small looks blurry, one picked a step too big just costs a few KB.
const CARD_SIZES = '(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 34vw, 50vw'

export default function ProductImage({ product, src, icon, name, className = '', rounded = 'rounded-xl', size = 'text-5xl', sizes = CARD_SIZES, eager = false }) {
  const [theme] = useTheme()
  const image = themedImage(src ?? product?.images?.[0], theme)
  const label = name ?? product?.name
  const emoji = icon ?? product?.category?.icon ?? '🥛'
  if (image) {
    return (
      <img
        {...responsiveImage(image, sizes)}
        alt={label}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        {...(eager ? { fetchPriority: 'high' } : {})}
        className={`aspect-square w-full bg-surface-2 object-cover ring-1 ring-line/60 ${isDarkPhoto(image) ? 'no-dim' : ''} ${rounded} ${className}`}
      />
    )
  }
  const tint = tintFor(label)
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden ${rounded} ${className}`}
      style={{ background: `radial-gradient(circle at 30% 25%, var(--color-surface) 0%, ${tint} 70%)` }}
    >
      <svg className="absolute -right-4 -bottom-4 size-2/3 text-brand/10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17 8C8 10 5.9 16.2 3.8 21.3l1.9.7.9-2.3c.5.2 1 .3 1.4.3C19 20 22 3 22 3c-1 2-8 2.3-13 3.3S2 11.5 2 13.5s1.8 3.8 1.8 3.8C7 8 17 8 17 8z" />
      </svg>
      <span className={`${size} drop-shadow-sm select-none`}>{emoji}</span>
    </div>
  )
}
