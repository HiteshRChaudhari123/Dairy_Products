import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * New subscriptions are bought through a product subscription plan (server-priced, terms accepted, paid and verified).
 * Keep the old /subscriptions/new links working by sending them to the product plans, carrying any preselected product.
 */
export default function NewSubscription() {
  const [params] = useSearchParams()
  const next = new URLSearchParams({ kind: 'product' })
  for (const k of ['product', 'variant']) if (params.get(k)) next.set(k, params.get(k))
  return <Navigate to={`/plans?${next}`} replace />
}
