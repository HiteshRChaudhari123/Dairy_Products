import { ArrowLeft, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMinor } from '../lib/billing'
import { formatDate } from '../lib/format'
import { LogoMark } from './Logo'

/** Printable tax invoice for a membership or subscription payment. Always light so it prints cleanly. */
export default function BillingInvoice({ invoice: inv, back }) {
  const cur = inv.currency
  return (
    <div className="min-h-screen bg-white py-6 text-[#222222] print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-4">
        <Link to={back} className="inline-flex items-center gap-1 text-sm text-[#6E665C] hover:text-[#222222]">
          <ArrowLeft className="size-4" /> Back
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
              <p className="font-heading text-2xl font-bold">{inv.seller?.name || 'Gavyora'}</p>
              {inv.seller?.address && <p className="max-w-xs text-xs text-[#6E665C]">{inv.seller.address}</p>}
              <p className="mt-1 text-xs text-[#6E665C]">
                GSTIN: {inv.seller?.gstNo || '—'} · FSSAI: {inv.seller?.fssaiNo || '—'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-heading text-xl font-bold tracking-wide">TAX INVOICE</p>
            <p className="mt-1 text-sm">
              Invoice no: <b>{inv.number}</b>
            </p>
            <p className="text-sm">Date: {formatDate(inv.issuedAt)}</p>
          </div>
        </div>
        <div className="py-6">
          <p className="mb-1 text-xs font-semibold text-[#6E665C] uppercase">Bill to</p>
          <p className="font-medium">{inv.billTo?.name}</p>
          {inv.billTo?.address && <p className="text-sm">{inv.billTo.address}</p>}
          <p className="text-sm">{[inv.billTo?.phone, inv.billTo?.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-[#E3D8C7] bg-[#FFFDF7] text-xs text-[#6E665C] uppercase">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i} className="border-b border-[#E3D8C7]">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right">{l.qty}</td>
                  <td className="px-3 py-2 text-right">{formatMinor(l.unitMinor, cur)}</td>
                  <td className="px-3 py-2 text-right">{formatMinor(l.amountMinor, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <p className="flex justify-between">
            <span className="text-[#6E665C]">Subtotal</span>
            <span>{formatMinor(inv.subtotalMinor, cur)}</span>
          </p>
          {inv.discountMinor > 0 && (
            <p className="flex justify-between">
              <span className="text-[#6E665C]">Discount</span>
              <span>− {formatMinor(inv.discountMinor, cur)}</span>
            </p>
          )}
          <p className="flex justify-between">
            <span className="text-[#6E665C]">GST ({inv.taxPercent || 0}%)</span>
            <span>{formatMinor(inv.taxMinor, cur)}</span>
          </p>
          <p className="flex justify-between border-t border-[#222222] pt-2 text-base font-bold">
            <span>Total paid</span>
            <span>{formatMinor(inv.totalMinor, cur)}</span>
          </p>
        </div>
        <p className="mt-10 border-t border-[#E3D8C7] pt-4 text-center text-xs text-[#6E665C]">This is a computer-generated invoice and does not require a signature.</p>
      </div>
    </div>
  )
}
