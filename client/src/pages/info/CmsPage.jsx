import { usePageQuery } from '../../app/api'
import PageHero, { PageHeroSkeleton } from '../../components/PageHero'
import { ErrorState, Skeleton } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { PAGE_PHOTOS, PHOTOS } from '../../lib/images'
import { usePageMeta } from '../../lib/meta'

const EYEBROW = {
  about: 'Our story',
  terms: 'Legal',
  privacy: 'Legal',
  'refund-policy': 'Customer care',
  'shipping-policy': 'Customer care',
}

// Content is plain text: blank lines separate paragraphs (no HTML is rendered).
export default function CmsPage({ slug }) {
  const { data: page, isLoading, error, refetch } = usePageQuery(slug)

  usePageMeta(page?.title, page?.content?.split(/\n\s*\n/)[0]?.slice(0, 155))

  return (
    <div className="container-page py-5 sm:py-8">
      {isLoading ? (
        <>
          <PageHeroSkeleton size="sm" />
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32" />
          </div>
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <PageHero
            size="sm"
            image={PAGE_PHOTOS[slug] || PHOTOS.farm}
            eyebrow={EYEBROW[slug]}
            title={page.title}
            subtitle={`Last updated ${formatDate(page.updatedAt)}`}
            crumbs={[['Home', '/'], [page.title]]}
          />
          <article className="card mx-auto mt-8 max-w-3xl p-6 sm:p-10">
            <div className="space-y-4 text-[15px] leading-relaxed">
              {page.content
                .split(/\n\s*\n/)
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p.trim()}
                  </p>
                ))}
            </div>
          </article>
        </>
      )}
    </div>
  )
}
