import { Link } from 'react-router-dom'
import { useCategoriesQuery } from '../../app/api'
import PageHero from '../../components/PageHero'
import { ErrorState, Skeleton } from '../../components/ui'
import { useTheme } from '../../hooks/useTheme'
import { categoryImage, isDarkPhoto, PHOTOS, responsiveImage } from '../../lib/images'

export default function Categories() {
  const { data: categories = [], isLoading, error, refetch } = useCategoriesQuery()
  const [theme] = useTheme()


  return (
    <div className="container-page py-5 sm:py-8">
      <PageHero
        size="sm"
        image={PHOTOS.milkBottles}
        eyebrow="Explore"
        title="All categories"
        subtitle="Fresh dairy for every meal of the day, from your morning milk to festive sweets."
        crumbs={[['Home', '/'], ['Categories']]}
      />
      {error ? (
        <div className="mt-8">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-44" />)
            : categories.map((c) => (
                <Link
                  key={c._id}
                  to={`/c/${c.slug}`}
                  className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative flex h-32 items-center justify-center overflow-hidden text-6xl sm:h-40" style={{ background: c.color }}>
                    {categoryImage(c, theme) ? (
                      <>
                        <img
                          {...responsiveImage(categoryImage(c, theme), '(min-width: 1280px) 240px, (min-width: 768px) 33vw, 50vw')}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={`absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-110 ${isDarkPhoto(categoryImage(c, theme)) ? 'no-dim' : ''}`}
                        />
                        <span className="absolute bottom-2 left-2 flex size-9 items-center justify-center rounded-full bg-surface/90 text-xl shadow-sm backdrop-blur">
                          {c.icon}
                        </span>
                      </>
                    ) : (
                      <span className="transition group-hover:scale-110">{c.icon}</span>
                    )}
                  </div>
                  <div className="p-3 sm:p-4">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted">{c.productCount} products</p>
                    {c.description && <p className="mt-1 line-clamp-2 hidden text-xs text-muted sm:block">{c.description}</p>}
                  </div>
                </Link>
              ))}
        </div>
      )}
    </div>
  )
}
