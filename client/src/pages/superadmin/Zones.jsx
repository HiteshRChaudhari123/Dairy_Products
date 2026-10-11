import { Building2, MapPin, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage, useCreateZoneMutation, useDeleteZoneMutation, useUpdateZoneMutation, useZonesQuery } from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Toggle } from '../../components/ui'
import { formatINR } from '../../lib/format'

const parsePins = (text) => [...new Set(text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean))]

function ZoneForm({ zone, branches, onClose }) {
  const [form, setForm] = useState({
    name: zone?.name || '',
    branch: zone?.branch || branches[0] || 'Main Warehouse',
    pins: (zone?.pincodes || []).join(', '),
    extraFee: zone?.extraFee ?? 0,
    isActive: zone?.isActive ?? true,
  })
  const [create, c] = useCreateZoneMutation()
  const [update, u] = useUpdateZoneMutation()
  const pins = parsePins(form.pins)
  const invalid = pins.filter((p) => !/^\d{6}$/.test(p))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (invalid.length) return toast.error(`Invalid pincodes: ${invalid.join(', ')}`)
    const body = { name: form.name, branch: form.branch, pincodes: pins, extraFee: Number(form.extraFee) || 0, isActive: form.isActive }
    try {
      if (zone) await update({ id: zone._id, ...body }).unwrap()
      else await create(body).unwrap()
      toast.success(zone ? 'Zone updated' : 'Zone created')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={zone ? `Edit ${zone.name}` : 'Add delivery zone'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="zone-form" disabled={c.isLoading || u.isLoading}>Save zone</button>
        </>
      }
    >
      <form id="zone-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zone name">
            <input className="input" value={form.name} onChange={set('name')} required minLength={2} placeholder="e.g. Central" />
          </Field>
          <Field label="Branch / warehouse">
            <input className="input" list="branch-list" value={form.branch} onChange={set('branch')} required />
            <datalist id="branch-list">
              {branches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Pincodes" hint="Separate with commas, spaces or new lines" error={invalid.length ? `Not 6 digits: ${invalid.join(', ')}` : undefined}>
          <textarea className="input min-h-24" value={form.pins} onChange={set('pins')} placeholder="411001, 411002" />
        </Field>
        {pins.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pins.map((p) => (
              <span key={p} className={`chip ${/^\d{6}$/.test(p) ? 'bg-primary-soft text-brand' : 'bg-error/10 text-error '}`}>{p}</span>
            ))}
          </div>
        )}
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <Field label="Extra delivery fee (₹)" hint="Added on top of the standard fee">
            <input className="input" type="number" min={0} value={form.extraFee} onChange={set('extraFee')} />
          </Field>
          <div className="pb-2">
            <Toggle checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="Zone is active" />
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default function Zones() {
  const { data: zones, isLoading, error, refetch } = useZonesQuery()
  const [del] = useDeleteZoneMutation()
  const [editing, setEditing] = useState(null)
  const [lookup, setLookup] = useState('')

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const branches = [...new Set(zones.map((z) => z.branch || 'Main Warehouse'))]
  const found = /^\d{6}$/.test(lookup) ? zones.filter((z) => z.pincodes.includes(lookup)) : null
  const totalPins = zones.reduce((n, z) => n + (z.isActive ? z.pincodes.length : 0), 0)

  const remove = async (z) => {
    if (!window.confirm(`Delete zone ${z.name}? Its pincodes will stop being serviceable.`)) return
    try {
      await del(z._id).unwrap()
      toast.success('Zone deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader
        title="Branches & delivery zones"
        subtitle={`${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${zones.length} zones · ${totalPins} serviceable pincodes`}
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add zone
          </button>
        }
      />

      <div className="card mb-6 p-4">
        <label className="label" htmlFor="pin-lookup">Which zone covers a pincode?</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input id="pin-lookup" className="input pl-9" inputMode="numeric" maxLength={6} placeholder="e.g. 411001" value={lookup} onChange={(e) => setLookup(e.target.value.replace(/\D/g, ''))} />
          </div>
          {found &&
            (found.length ? (
              <p className="text-sm text-brand">
                ✓ Covered by {found.map((z) => `${z.name} (${z.branch})${z.isActive ? '' : ' [inactive]'}`).join(', ')}
              </p>
            ) : (
              <p className="text-sm text-error">✗ {lookup} is not in any zone, so customers there can't order.</p>
            ))}
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="card">
          <EmptyState icon="🗺️" title="No zones yet" text="Without zones, every pincode is treated as serviceable. Add zones to control where you deliver." />
        </div>
      ) : (
        branches.map((b) => (
          <section key={b} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Building2 className="size-5 text-brand" /> {b}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zones
                .filter((z) => (z.branch || 'Main Warehouse') === b)
                .map((z) => (
                  <div key={z._id} className={`card p-4 ${z.isActive ? '' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          <MapPin className="size-4 text-brand" /> {z.name}
                          {!z.isActive && <span className="chip bg-surface-2 text-muted">Inactive</span>}
                        </p>
                        <p className="mt-1 flex items-center gap-3 text-xs text-muted">
                          <span className="flex items-center gap-1"><Users className="size-3.5" /> {z.partners} partners</span>
                          <span>{z.extraFee ? `+${formatINR(z.extraFee)} fee` : 'No extra fee'}</span>
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn-ghost btn-sm px-2" onClick={() => setEditing(z)} aria-label="Edit">
                          <Pencil className="size-4" />
                        </button>
                        <button className="btn-ghost btn-sm px-2 text-error" onClick={() => remove(z)} aria-label="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {z.pincodes.map((p) => (
                        <span key={p} className="chip bg-surface-2">{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))
      )}

      {editing && <ZoneForm zone={editing === 'new' ? null : editing} branches={branches} onClose={() => setEditing(null)} />}
    </div>
  )
}
