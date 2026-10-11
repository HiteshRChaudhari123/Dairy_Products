import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useMyOrderQuery, useSettingsQuery } from '../../app/api'
import { LogoMark } from '../../components/Logo'
import { ErrorState, PageLoader } from '../../components/ui'
import { formatDate, formatINR, PAYMENT_LABEL, STATUS_LABEL } from '../../lib/format'
import { usePageMeta } from '../../lib/meta'

// Printable tax invoice. Always light, so it prints cleanly even in dark mode.
export default function Invoice() {
  const { id } = useParams()
  const { data: order, isLoading, error } = useMyOrderQuery(id)
  const { data: s } = useSettingsQuery()

  usePageMeta(order && `Invoice ${order.orderNo}`, 'Printable tax invoice', false)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} />

  const a = order.address || {}
  return (
    <div className="min-h-screen bg-white py-6 text-[#222222] print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-4">
        <Link to={`/account/orders/${id}`} className="inline-flex items-center gap-1 text-sm text-[#6E665C] hover:text-[#222222]">
          <ArrowLeft className="size-4" /> Back to order
        </Link>
        <button onClick={() => window.print()} className="btn bg-[#222222] text-white hover:bg-[#222222]">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl border border-[#E3D8C7] bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#E3D8C7] pb-6">
          <div className="flex items-start gap-3">
            <LogoMark className="size-12" />
            <div>
              <p className="font-heading text-2xl font-bold text-[#222222]">{s?.storeName || 'Gavyora'}</p>
              <p className="max-w-xs text-xs text-[#6E665C]">{s?.address}</p>
              <p className="text-xs text-[#6E665C]">
                {s?.supportPhone} · {s?.supportEmail}
              </p>
              <p className="mt-1 text-xs text-[#6E665C]">
                GSTIN: {s?.gstNo || '—'} · FSSAI: {s?.fssaiNo || '—'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-heading text-xl font-bold tracking-wide">TAX INVOICE</p>
            <p className="mt-1 text-sm">
              Invoice no: <b>{order.orderNo}</b>
            </p>
            <p className="text-sm">Order date: {formatDate(order.createdAt)}</p>
            {order.deliveredAt && <p className="text-sm">Delivered: {formatDate(order.deliveredAt)}</p>}
          </div>
        </div>

        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-[#6E665C] uppercase">Bill to / Ship to</p>
            <p className="font-medium">{a.name}</p>
            <p className="text-sm">
              {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}
              <br />
              {a.city}, {a.state} - {a.pincode}
            </p>
            <p className="text-sm">Phone: {a.phone}</p>
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs font-semibold text-[#6E665C] uppercase">Payment</p>
            <p className="text-sm">{PAYMENT_LABEL[order.payment.method]}</p>
            <p className="text-sm">Status: {STATUS_LABEL[order.payment.status]}</p>
            <p className="text-sm">Order status: {STATUS_LABEL[order.status]}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-[#E3D8C7] bg-[#FFFDF7] text-xs text-[#6E665C] uppercase">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={it._id || i} className="border-b border-[#E3D8C7]">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    {it.name}
                    <span className="block text-xs text-[#6E665C]">{it.variantLabel}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{it.qty}</td>
                  <td className="px-3 py-2 text-right">{formatINR(it.price)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(it.price * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Line label="Subtotal" value={formatINR(order.subtotal)} />
          {order.discount > 0 && <Line label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`− ${formatINR(order.discount)}`} />}
          <Line label="Delivery" value={formatINR(order.deliveryFee)} />
          <Line label="Tax (GST)" value={formatINR(order.tax)} />
          <div className="flex justify-between border-t border-[#222222] pt-2 text-base font-bold">
            <span>Grand total</span>
            <span>{formatINR(order.total)}</span>
          </div>
        </div>

        <p className="mt-10 border-t border-[#E3D8C7] pt-4 text-center text-xs text-[#6E665C]">
          This is a computer-generated invoice and does not require a signature. Thank you for choosing {s?.storeName || 'Gavyora'}!
        </p>
      </div>
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#6E665C]">{label}</span>
      <span>{value}</span>
    </div>
  )
}
