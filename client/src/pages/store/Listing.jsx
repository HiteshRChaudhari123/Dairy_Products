import { ArrowUpDown, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useCategoriesQuery, useProductsQuery } from '../../app/api'
import PageHero, { PageHeroSkeleton } from '../../components/PageHero'
import { ProductGrid } from '../../components/ProductCard'
import { EmptyState, ErrorState, Modal, Pagination, Skeleton } from '../../components/ui'
import { useTheme } from '../../hooks/useTheme'
import { categoryImage, PHOTOS, themedImage } from '../../lib/images'
import { usePageMeta } from '../../lib/meta'

const SORTS = [
  { value: 'popular', label: 'Popularity' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest first' },
  { value: 'rating', label: 'Customer rating' },
]

const PRICES = [
  { label: 'Under ₹50', min: '', max: '50' },
  { label: '₹50 – ₹100', min: '50', max: '100' },
  { label: '₹100 – ₹300', min: '100', max: '300' },
  { label: '₹300 – ₹1000', min: '300', max: '1000' },
  { label: 'Over ₹1000', min: '1000', max: '' },
]

const FLAGS = [
  ['isOrganic', 'Organic'],
  ['isA2', 'A2 milk products'],
  ['isSubscribable', 'Available on subscription'],
  ['inStock', 'In stock only'],
]

const FILTER_KEYS = ['minPrice', 'maxPrice', 'rating', 'brand', ...FLAGS.map(([k]) => k)]

function Filters({ params, update, brands }) {
  const price = PRICES.find((p) => p.min === (params.get('minPrice') || '') && p.max === (params.get('maxPrice') || ''))
  const rating = params.get('rating') || ''
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 font-sans text-[11px] font-semibold tracking-[0.14em] text-subtle uppercase">Price</h4>
        <div className="space-y-1">
          {PRICES.map((p) => (
            <label key={p.label} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="price"
                className="accent-primary"
                checked={price === p}
                onChange={() => update({ minPrice: p.min, maxPrice: p.max })}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 font-sans text-[11px] font-semibold tracking-[0.14em] text-subtle uppercase">Customer rating</h4>
        {['4', '3'].map((r) => (
          <label key={r} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="rating" className="accent-primary" checked={rating === r} onChange={() => update({ rating: r })} />
            {r}★ &amp; above
          </label>
        ))}
      </div>
      <div>
        <h4 className="mb-2 font-sans text-[11px] font-semibold tracking-[0.14em] text-subtle uppercase">Type</h4>
        {FLAGS.map(([key, label]) => (
          <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={params.get(key) === '1'}
              onChange={(e) => update({ [key]: e.target.checked ? '1' : '' })}
            />
            {label}
          </label>
        ))}
      </div>
      {brands?.length > 1 && (
        <div>
          <h4 className="mb-2 font-sans text-[11px] font-semibold tracking-[0.14em] text-subtle uppercase">Brand</h4>
          <select className="input" value={params.get('brand') || ''} onChange={(e) => update({ brand: e.target.value })}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

export default function Listing({ mode }) {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const [sheet, setSheet] = useState(null) // 'filters' | 'sort' | null
  const { data: categories = [], isLoading: categoriesLoading } = useCategoriesQuery()
  const category = mode === 'category' ? categories.find((c) => c.slug === slug) : null
  const [theme] = useTheme()

  const q = params.get('q') || ''
  const sort = params.get('sort') || 'popular'
  const page = Number(params.get('page')) || 1

  const query = {
    category: mode === 'category' ? slug : undefined,
    q: mode === 'search' ? q : undefined,
    isDeal: mode === 'deals' ? '1' : undefined,
    sort,
    page,
    limit: 20,
  }
  FILTER_KEYS.forEach((k) => (query[k] = params.get(k) || undefined))
  const { data, isFetching, error, refetch } = useProductsQuery(query)
  // Category header photo: the category's best-selling product (1600px), sharp even across a wide header.
  // The 800px category tile is the fallback; stretched that wide it looked blurry.
  const { data: topPick, isLoading: topPickLoading } = useProductsQuery({ category: slug, sort: 'popular', limit: 1 }, { skip: mode !== 'category' })

  const update = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length
  const clearFilters = () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))

  const title =
    mode === 'category' ? category?.name || 'Products' : mode === 'deals' ? 'Deals of the Day' : q ? `Results for “${q}”` : 'Our Dairy Collection'

  const hero =
    mode === 'category'
      ? {
          image: themedImage(topPick?.items?.[0]?.images?.[0], theme) || categoryImage(category, theme) || PHOTOS.milkBottles,
          eyebrow: 'Collection',
          subtitle: category?.description || 'Pure. Natural. Wholesome.',
          crumbs: [['Home', '/'], ['Categories', '/categories'], [category?.name || 'Products']],
        }
      : mode === 'deals'
        ? {
            image: PHOTOS.milkGlass,
            eyebrow: 'Today only',
            subtitle: 'Fresh offers every day on milk, ghee, paneer and more. These prices end at midnight.',
            crumbs: [['Home', '/'], ['Deals']],
          }
        : {
            image: PHOTOS.milkPour,
            eyebrow: q ? 'Search' : 'Shop',
            subtitle: 'Pure. Natural. Wholesome. Farm-fresh dairy, delivered every morning.',
            crumbs: [['Home', '/'], [q ? 'Search' : 'Products']],
          }

  usePageMeta(mode === 'category' && !category ? '' : title, hero.subtitle, mode !== 'search')

  return (
    <div className="container-page py-5 sm:py-8">
      <div className="mb-8">
        {mode === 'category' && (categoriesLoading || topPickLoading) ? (
          <PageHeroSkeleton size="sm" />
        ) : (
          <PageHero
            size="sm"
            image={hero.image}
            eyebrow={hero.eyebrow}
            title={title}
            subtitle={hero.subtitle}
            crumbs={hero.crumbs}
          />
        )}
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="card sticky top-36 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-xl">Filters</h3>
              {activeFilters > 0 && (
                <button className="text-xs font-medium text-brand" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>
            <Filters params={params} update={update} brands={data?.brands} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{data ? `${data.total} product${data.total === 1 ? '' : 's'}` : ' '}</p>
            <div className="hidden items-center gap-2 lg:flex">
              <label htmlFor="sort" className="text-sm text-muted">Sort by</label>
              <select id="sort" className="input w-auto py-2" value={sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex w-full gap-2 lg:hidden">
              <button className="btn-outline flex-1" onClick={() => setSheet('sort')}>
                <ArrowUpDown className="size-4" /> Sort
              </button>
              <button className="btn-outline flex-1" onClick={() => setSheet('filters')}>
                <SlidersHorizontal className="size-4" /> Filters{activeFilters > 0 && ` (${activeFilters})`}
              </button>
            </div>
          </div>

          {activeFilters > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {FILTER_KEYS.filter((k) => params.get(k)).map((k) => (
                <button
                  key={k}
                  className="badge-new py-1.5 normal-case tracking-normal"
                  onClick={() => update(k === 'minPrice' || k === 'maxPrice' ? { minPrice: '', maxPrice: '' } : { [k]: '' })}
                >
                  {FLAGS.find(([f]) => f === k)?.[1] ||
                    (k === 'rating' ? `${params.get(k)}★+` : k === 'minPrice' ? `From ₹${params.get(k)}` : k === 'maxPrice' ? `Up to ₹${params.get(k)}` : params.get(k))}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !data ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-72" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No products found"
              text={activeFilters ? 'Try removing some filters.' : 'Try a different search word, like “milk” or “paneer”.'}
              action={
                activeFilters ? (
                  <button className="btn-outline" onClick={clearFilters}>Clear filters</button>
                ) : (
                  <Link to="/categories" className="btn-primary">Browse categories</Link>
                )
              }
            />
          ) : (
            <div className={isFetching ? 'opacity-60 transition' : 'transition'}>
              <ProductGrid products={data.items} className="xl:grid-cols-4" />
              <Pagination page={data.page} pages={data.pages} onChange={(p) => update({ page: String(p) })} />
            </div>
          )}
        </div>
      </div>

      <Modal
        open={sheet === 'filters'}
        onClose={() => setSheet(null)}
        title="Filters"
        footer={
          <>
            <button className="btn-ghost" onClick={clearFilters}>Clear all</button>
            <button className="btn-primary" onClick={() => setSheet(null)}>Show {data?.total ?? ''} results</button>
          </>
        }
      >
        <Filters params={params} update={update} brands={data?.brands} />
      </Modal>
      <Modal open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        <div className="space-y-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm ${sort === s.value ? 'bg-primary-soft font-semibold text-brand' : 'hover:bg-surface-2'}`}
              onClick={() => {
                update({ sort: s.value })
                setSheet(null)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
