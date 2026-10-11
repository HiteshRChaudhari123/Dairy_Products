import { Ban, Bike, Phone, ShieldCheck, Star } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { errorMessage, useBlockUserMutation, usePartnersQuery, useUpdatePartnerMutation, useZonesQuery } from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, StatusBadge, Tabs } from '../../components/ui'
import { formatDate, formatINR, telHref } from '../../lib/format'

function KycModal({ partner, onClose }) {
  const [note, setNote] = useState(partner.delivery?.kycNote || '')
  const [update, { isLoading }] = useUpdatePartnerMutation()
  const d = partner.delivery || {}
  const decide = async (kycStatus) => {
    if (kycStatus === 'rejected' && note.trim().length < 3) return toast.error('Add a note explaining what to fix')
    try {
      await update({ id: partner._id, kycStatus, kycNote: note.trim() }).unwrap()
      toast.success(kycStatus === 'approved' ? `${partner.name} approved. They can now go online.` : 'KYC rejected')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const rows = [
    ['Name', partner.name],
    ['Phone', partner.phone],
    ['Email', partner.email || '—'],
    ['Vehicle', d.vehicle || '—'],
    ['Driving licence', d.licenseNo || '—'],
    ['Aadhaar', d.aadhaarLast4 ? `•••• •••• ${d.aadhaarLast4}` : '—'],
    ['Bank account', d.bankAccountLast4 ? `•••• ${d.bankAccountLast4}` : '—'],
    ['IFSC', d.ifsc || '—'],
    ['Registered', formatDate(partner.createdAt)],
  ]
  return (
    <Modal
      open
      onClose={onClose}
      title="Review KYC"
      footer={
        <>
          <button className="btn-outline text-error" onClick={() => decide('rejected')} disabled={isLoading}>
            Reject
          </button>
          <button className="btn-primary" onClick={() => decide('approved')} disabled={isLoading}>
            <ShieldCheck className="size-4" /> Approve
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Current status</span>
          <StatusBadge status={d.kycStatus} />
        </div>
        <dl className="divide-y divide-line rounded-xl border border-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">
          Check the partner's original Aadhaar, driving licence and bank proof in person before approving.
        </p>
        <Field label="Note to partner" hint="Required when rejecting">
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export default function DeliveryPartners() {
  const [params, setParams] = useSearchParams()
  const kyc = params.get('kyc') || ''
  const { data = [], isLoading, error, refetch } = usePartnersQuery({ kyc })
  const { data: zones = [] } = useZonesQuery()
  const [update] = useUpdatePartnerMutation()
  const [block] = useBlockUserMutation()
  const [reviewing, setReviewing] = useState(null)

  const setZone = async (p, zone) => {
    try {
      await update({ id: p._id, zone: zone || null }).unwrap()
      toast.success('Zone updated')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const toggleBlock = async (p) => {
    try {
      await block({ id: p._id, isBlocked: !p.isBlocked }).unwrap()
      toast.success(p.isBlocked ? `${p.name} unblocked` : `${p.name} blocked`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Delivery partners" subtitle="Approve KYC, assign zones and track performance" />
      <div className="mb-5">
        <Tabs
          tabs={[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending KYC' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ]}
          value={kyc}
          onChange={(v) => setParams(v ? { kyc: v } : {})}
        />
      </div>

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.length ? (
        <div className="card">
          <EmptyState icon="🛵" title="No delivery partners here" text="Partners sign up at /delivery/register and appear here for KYC approval." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.map((p) => {
            const d = p.delivery || {}
            return (
              <div key={p._id} className={`card p-4 ${p.isBlocked ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-brand">{p.name[0]}</span>
                    <span
                      className={`absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-surface ${d.isOnline ? 'bg-success' : 'bg-line'}`}
                      title={d.isOnline ? 'Online' : 'Offline'}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {p.name} {p.isBlocked && <span className="chip bg-error/10 text-error ">Blocked</span>}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted">
                      <Phone className="size-3" aria-hidden /> <a href={telHref(p.phone)} className="hover:text-accent hover:underline">{p.phone}</a>
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted">
                      <Bike className="size-3" /> {d.vehicle || '—'}
                    </p>
                  </div>
                  <StatusBadge status={d.kycStatus} />
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-surface-2 p-2">
                    <p className="font-heading text-base font-bold">{p.delivered}</p>
                    <p className="text-muted">Delivered</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-2">
                    <p className="font-heading text-base font-bold">{p.active}</p>
                    <p className="text-muted">Active</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-2">
                    <p className="font-heading text-base font-bold">{formatINR(d.earnings)}</p>
                    <p className="text-muted">Earned</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-2">
                    <p className="flex items-center justify-center gap-0.5 font-heading text-base font-bold">
                      {Number(d.rating || 0).toFixed(1)} <Star className="size-3 fill-secondary text-secondary" />
                    </p>
                    <p className="text-muted">Rating</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <select className="input min-w-0 flex-1 py-1.5 text-sm" value={d.zone?._id || d.zone || ''} onChange={(e) => setZone(p, e.target.value)} aria-label="Zone">
                    <option value="">No zone</option>
                    {zones.map((z) => (
                      <option key={z._id} value={z._id}>
                        {z.name} ({z.branch})
                      </option>
                    ))}
                  </select>
                  <button className={d.kycStatus === 'pending' ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setReviewing(p)}>
                    <ShieldCheck className="size-4" /> {d.kycStatus === 'pending' ? 'Review KYC' : 'KYC'}
                  </button>
                  <button className="btn-ghost btn-sm px-2 text-error" onClick={() => toggleBlock(p)} aria-label={p.isBlocked ? 'Unblock' : 'Block'} title={p.isBlocked ? 'Unblock' : 'Block'}>
                    <Ban className="size-4" />
                  </button>
                </div>
                {d.kycNote && <p className="mt-2 text-xs text-muted">Note: {d.kycNote}</p>}
              </div>
            )
          })}
        </div>
      )}
      {reviewing && <KycModal partner={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  )
}
