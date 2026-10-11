import { Link } from 'react-router-dom'

/** Leaf sprig mark. `light` is for navy backgrounds (sidebar, photo banners). */
export function LogoMark({ className = 'size-9', light = false }) {
  const leaf = light ? 'fill-on-night' : 'fill-brand'
  const vein = light ? 'fill-platinum' : 'fill-accent'
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M20 34c-.6-7.5.2-15.5 0-26 3.6 3.7 6 9.6 4.8 15.8-.8 4.3-2.6 7.7-4.8 10.2z" className={vein} />
      <path d="M19 34.5C13 32.6 7.4 27 6.6 18.8c5.4 1.4 10.3 5.6 12.4 12.2.3.9.4 2.3 0 3.5z" className={leaf} />
      <path d="M21 34.5c6-1.9 11.6-7.5 12.4-15.7-5.4 1.4-10.3 5.6-12.4 12.2-.3.9-.4 2.3 0 3.5z" className={leaf} />
    </svg>
  )
}

/** The brand lockup, always a link home. `compactOnTiny` drops the wordmark below 360px so the header fits. */
export default function Logo({ to = '/', light = false, compact = false, compactOnTiny = false, label = 'Gavyora home' }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label={label}>
      <LogoMark light={light} />
      {!compact && (
        <span className={`leading-none ${compactOnTiny ? 'max-[359px]:hidden' : ''}`}>
          <span className={`block font-heading text-[19px] font-semibold tracking-[0.18em] uppercase ${light ? 'text-on-night' : 'text-brand'}`}>
            Gavyora
          </span>
          <span className={`mt-1 hidden text-[8.5px] font-medium tracking-[0.28em] uppercase sm:block ${light ? 'text-on-night-muted' : 'text-muted'}`}>
            Pure · Fresh · Premium
          </span>
        </span>
      )}
    </Link>
  )
}
