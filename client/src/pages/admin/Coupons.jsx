import { Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  errorMessage,
  useAdminCouponsQuery,
  useCreateCouponMutation,
  useDeleteCouponMutation,
  useUpdateCouponMutation,
} from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Toggle } from '../../components/ui'
import { dateKey, formatDate, formatINR } from '../../lib/format'
import { ConfirmModal } from './_shared'

const EMPTY = { code: '', description: '', type: 'percent', value: '', maxDiscount: '', minOrder: '', usageLimit: '', validFrom: '', validTo: '', isActive: true }
// Local date, not toISOString(): in IST that would show (and re-save) the previous day.
const toInput = (d) => (d ? dateKey(d) : '')
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

function CouponModal({ coupon, onClose }) {
  const [form, setForm] = useState(
    coupon?._id
      ? {
          ...EMPTY,
          ...coupon,
          maxDiscount: coupon.maxDiscount ?? '',
          usageLimit: coupon.usageLimit ?? '',
          minOrder: coupon.minOrder ?? '',
          validFrom: toInput(coupon.validFrom),
          validTo: toInput(coupon.validTo),
        }
      : EMPTY,
  )
  const [create, { isLoading: c }] = useCreateCouponMutation()
  const [update, { isLoading: u }] = useUpdateCouponMutation()
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (form.code.trim().length < 3) return toast.error('Code must be at least 3 characters')
    if (form.value === '' || Number(form.value) <= 0) return toast.error('Enter a discount value')
    if (form.type === 'percent' && Number(form.value) > 100) return toast.error('Percent discount cannot exceed 100')
    if (form.validFrom && form.validTo && form.validTo < form.validFrom) return toast.error('End date must be after start date')
    const body = {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      type: form.type,
      value: Number(form.value),
      maxDiscount: form.type === 'percent' ? numOrNull(form.maxDiscount) : null,
      minOrder: Number(form.minOrder) || 0,
      usageLimit: numOrNull(form.usageLimit),
      validFrom: form.validFrom ? new Date(form.validFrom + 'T00:00:00').toISOString() : null,
      validTo: form.validTo ? new Date(form.validTo + 'T23:59:59').toISOString() : null,
      isActive: form.isActive,
    }
    try {
      if (coupon?._id) await update({ id: coupon._id, ...body }).unwrap()
      else await create(body).unwrap()
      toast.success('Coupon saved')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={coupon?._id ? 'Edit coupon' : 'New coupon'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={c || u}>Save coupon</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code *">
          <input className="input font-mono uppercase" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="FRESH10" />
        </Field>
        <Field label="Type">
          <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="percent">Percentage off</option>
            <option value="flat">Flat ₹ off</option>
          </select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="10% off up to ₹100 on orders above ₹499" />
        </Field>
        <Field label={form.type === 'percent' ? 'Discount %' : 'Discount ₹'}>
          <input type="number" min="0" className="input" value={form.value} onChange={(e) => set('value', e.target.value)} />
        </Field>
        {form.type === 'percent' && (
          <Field label="Max discount ₹" hint="Leave empty for no cap">
            <input type="number" min="0" className="input" value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
          </Field>
        )}
        <Field label="Minimum order ₹">
          <input type="number" min="0" className="input" value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} />
        </Field>
        <Field label="Total usage limit" hint="Leave empty for unlimited">
          <input type="number" min="1" className="input" value={form.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} />
        </Field>
        <Field label="Valid from">
          <input type="date" className="input" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
        </Field>
        <Field label="Valid until">
          <input type="date" className="input" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" />
        </div>
      </div>
    </Modal>
  )
}

function validity(c) {
  const now = new Date()
  if (c.validTo && new Date(c.validTo) < now) return ['Expired', 'text-error']
  if (c.validFrom && new Date(c.validFrom) > now) return [`Starts ${formatDate(c.validFrom)}`, 'text-warning']
  return [c.validTo ? `Until ${formatDate(c.validTo)}` : 'No expiry', 'text-muted']
}

export default function Coupons() {
  const { data = [], isLoading, error, refetch } = useAdminCouponsQuery()
  const [update] = useUpdateCouponMutation()
  const [remove, { isLoading: deleting }] = useDeleteCouponMutation()
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div>
      <PageHeader
        title="Coupons & offers"
        subtitle={`${data.filter((c) => c.isActive).length} active coupons`}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="size-4" /> New coupon
          </button>
        }
      />
      {!data.length ? (
        <div className="card">
          <EmptyState icon="🎟️" title="No coupons yet" action={<button className="btn-primary" onClick={() => setEditing({})}>Create coupon</button>} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => {
            const [validText, validTone] = validity(c)
            return (
              <div key={c._id} className={`card relative overflow-hidden p-4 ${c.isActive ? '' : 'opacity-60'}`}>
                <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-secondary" />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-mono text-lg font-bold tracking-wide">
                      <TicketPercent className="size-5 text-brand" /> {c.code}
                    </p>
                    <p className="mt-1 text-sm text-muted">{c.description || '—'}</p>
                  </div>
                  <p className="font-heading text-xl font-bold text-brand">{c.type === 'percent' ? `${c.value}%` : formatINR(c.value)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>Min order {formatINR(c.minOrder)}</span>
                  {c.maxDiscount && <span>Max {formatINR(c.maxDiscount)}</span>}
                  <span>
                    Used {c.usedCount}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                  </span>
                  <span className={validTone}>{validText}</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <Toggle
                    checked={c.isActive}
                    label={c.isActive ? 'Active' : 'Inactive'}
                    onChange={(v) =>
                      update({ id: c._id, isActive: v })
                        .unwrap()
                        .then(() => toast.success(`${c.code} ${v ? 'activated' : 'deactivated'}`))
                        .catch((e) => toast.error(errorMessage(e)))
                    }
                  />
                  <div>
                    <button className="btn-ghost btn-sm px-2" onClick={() => setEditing(c)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </button>
                    <button className="btn-ghost btn-sm px-2 text-error" onClick={() => setToDelete(c)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {editing && <CouponModal coupon={editing} onClose={() => setEditing(null)} />}
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        busy={deleting}
        title="Delete coupon?"
        text={`${toDelete?.code} will stop working immediately.`}
        onConfirm={async () => {
          try {
            await remove(toDelete._id).unwrap()
            toast.success('Coupon deleted')
            setToDelete(null)
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </div>
  )
}
