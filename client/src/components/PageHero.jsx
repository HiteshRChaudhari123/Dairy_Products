import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { responsiveImage } from '../lib/images'

/**
 * Photo header for content pages (careers, contact, help, listings, CMS pages).
 * Matches the home hero: a theme-aware `hero` panel (sky blue with navy text in light mode, deep navy in dark).
 * The photo is shown in full and untinted: a band above the copy on phones, the right half from md with only a thin
 * blend on its left edge (the copy keeps to the left half, so nothing has to fade the photo).
 *
 * crumbs: [['Home', '/'], ['Careers']] (the last crumb is the current page and is not a link)
 */
export default function PageHero({ image, imagePosition = 'object-center', eyebrow, title, subtitle, crumbs, actions, children, size = 'md' }) {
  const height = size === 'sm' ? 'min-h-48 sm:min-h-56' : 'min-h-64 sm:min-h-80'
  return (
    <section className={`relative isolate flex flex-col overflow-hidden rounded-3xl border border-line bg-hero text-ink md:flex-row ${height}`}>
      {image && (
        // Phones: a clean photo band on top. From md: the right half of the panel.
        <div className={`relative ${size === 'sm' ? 'h-40 sm:h-48' : 'h-48 sm:h-60'} md:absolute md:inset-y-0 md:right-0 md:-z-10 md:h-auto md:w-1/2`}>
          {/* Above the fold: load first, at the size it's shown. */}
          <img {...responsiveImage(image, '(min-width: 768px) 50vw, 100vw')} alt="" fetchPriority="high" className={`absolute inset-0 size-full object-cover ${imagePosition}`} />
          <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,var(--color-hero)_0%,transparent_12%)] md:block" />
        </div>
      )}

      <div className={`relative flex w-full flex-col justify-end gap-4 px-6 pb-8 sm:px-10 sm:pb-10 md:py-10 lg:px-14 ${image ? 'pt-6 md:max-w-[50%] md:pt-10' : 'pt-8'}`}>
        {crumbs?.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
              {crumbs.map(([label, to], i) => (
                <li key={label} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5 opacity-60" aria-hidden />}
                  {to ? (
                    <Link to={to} className="hover:text-ink hover:underline">
                      {label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="font-medium text-ink">
                      {label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="max-w-xl">
          {eyebrow && (
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-line-strong" aria-hidden /> {eyebrow}
            </p>
          )}
          <h1 className="mt-3 font-heading text-[32px] leading-[1.1] font-medium break-words sm:text-[44px] lg:text-[52px]">{title}</h1>
          {subtitle && <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3 pt-1">{actions}</div>}
        {children}
      </div>
    </section>
  )
}

/** Same footprint as PageHero, for pages whose title is still loading. */
export function PageHeroSkeleton({ size = 'md' }) {
  return <div className={`animate-pulse rounded-3xl bg-hero ${size === 'sm' ? 'h-48 sm:h-56' : 'h-64 sm:h-80'}`} aria-busy="true" aria-label="Loading" />
}
