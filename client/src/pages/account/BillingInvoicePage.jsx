import { useParams } from 'react-router-dom'
import { useAdminInvoiceQuery, useMyInvoiceQuery } from '../../app/api'
import BillingInvoice from '../../components/BillingInvoice'
import { usePanelBase } from '../../components/guards'
import { ErrorState, PageLoader } from '../../components/ui'
import { usePageMeta } from '../../lib/meta'

/** Customer invoice (own invoices only; the server checks ownership). */
export default function BillingInvoicePage() {
  const { id } = useParams()
  const { data, isLoading, error } = useMyInvoiceQuery(id)
  usePageMeta(data && `Invoice ${data.number}`, 'Tax invoice', false)
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} />
  return <BillingInvoice invoice={data} back="/account/billing" />
}

/** Staff view of any invoice (memberships permission). */
export function AdminBillingInvoicePage() {
  const { id } = useParams()
  const base = usePanelBase()
  const { data, isLoading, error } = useAdminInvoiceQuery(id)
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} />
  return <BillingInvoice invoice={data} back={`${base}/payments`} />
}
