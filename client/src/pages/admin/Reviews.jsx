import { BadgeCheck, Eye, EyeOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { errorMessage, useAdminReviewsQuery, useDeleteReviewMutation, useModerateReviewMutation } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, Stars, Tabs } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { ConfirmModal } from './_shared'

export default function Reviews() {
  const [approved, setApproved] = useState('')
  const [rating, setRating] = useState('')
  const { data = [], isLoading, error, refetch } = useAdminReviewsQuery({ approved, rating })
  const [moderate] = useModerateReviewMutation()
  const [remove, { isLoading: deleting }] = useDeleteReviewMutation()
  const [toDelete, setToDelete] = useState(null)

  const toggle = async (r) => {
    try {
      await moderate({ id: r._id, isApproved: !r.isApproved }).unwrap()
      toast.success(r.isApproved ? 'Review hidden from the store' : 'Review is visible again')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Reviews" subtitle="Moderate what customers see on product pages" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          tabs={[
            { value: '', label: 'All' },
            { value: '0', label: 'Hidden' },
          ]}
          value={approved}
          onChange={setApproved}
        />
        <select className="input w-auto" value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Rating">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.length ? (
        <div className="card">
          <EmptyState icon="⭐" title="No reviews match" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((r) => (
            <div key={r._id} className={`card p-4 ${r.isApproved ? '' : 'border-dashed opacity-70'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Stars value={r.rating} size="size-4" />
                  <p className="mt-1 font-semibold">{r.title || 'No title'}</p>
                </div>
                {!r.isApproved && <span className="chip bg-surface-2 text-muted">Hidden</span>}
              </div>
              {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
              <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="font-medium text-ink">{r.name}</span>
                {r.isVerifiedPurchase && (
                  <span className="inline-flex items-center gap-0.5 text-brand">
                    <BadgeCheck className="size-3.5" /> Verified buyer
                  </span>
                )}
                <span>· {formatDate(r.createdAt)}</span>
                {r.product && (
                  <>
                    <span>· on</span>
                    <Link to={`/p/${r.product.slug}`} className="link" target="_blank">
                      {r.product.name}
                    </Link>
                  </>
                )}
              </p>
              <div className="mt-3 flex justify-end gap-1 border-t border-line pt-3">
                <button className="btn-ghost btn-sm" onClick={() => toggle(r)}>
                  {r.isApproved ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {r.isApproved ? 'Hide' : 'Approve'}
                </button>
                <button className="btn-ghost btn-sm text-error" onClick={() => setToDelete(r)}>
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        busy={deleting}
        title="Delete review?"
        text="This permanently removes the review and updates the product rating."
        onConfirm={async () => {
          try {
            await remove(toDelete._id).unwrap()
            toast.success('Review deleted')
            setToDelete(null)
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </div>
  )
}
