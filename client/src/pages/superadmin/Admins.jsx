import { Check, Crown, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  errorMessage,
  useAdminsQuery,
  useCreateAdminMutation,
  useDeleteAdminMutation,
  usePermissionsQuery,
  useUpdateAdminMutation,
} from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader } from '../../components/ui'
import { formatDate } from '../../lib/format'

const PERM_INFO = {
  orders: ['Orders', 'View orders, change status, assign delivery'],
  products: ['Products', 'Add and edit products and categories'],
  inventory: ['Inventory', 'Stock levels, batches and expiry dates'],
  subscriptions: ['Subscriptions', "Milk subscriptions and tomorrow's sheet"],
  customers: ['Customers', 'Customer details, wallet adjustments, blocking'],
  delivery: ['Delivery partners', 'Approve KYC, assign zones'],
  coupons: ['Coupons & offers', 'Create and manage discount codes'],
  banners: ['Banners', 'Home page banners'],
  notifications: ['Notifications', 'Send announcements to customers'],
  reviews: ['Reviews', 'Moderate product reviews'],
  tickets: ['Support tickets', 'Reply to customer and partner tickets'],
  reports: ['Reports', 'Sales reports, revenue figures and exports'],
  memberships: ['Memberships & plans', 'View memberships, plan subscriptions and payments; request overrides'],
  refunds: ['Refunds', 'Issue refunds up to the approval limit in billing settings'],
}

const PRESETS = {
  'Store manager': Object.keys(PERM_INFO),
  'Order desk': ['orders', 'subscriptions', 'delivery', 'tickets'],
  'Subscriptions desk': ['subscriptions', 'memberships', 'orders', 'tickets', 'refunds'],
  'Catalogue manager': ['products', 'inventory', 'banners', 'coupons', 'reviews', 'notifications'],
}

const empty = { name: '', email: '', phone: '', password: '', permissions: [] }

function AdminForm({ admin, perms, onClose }) {
  const [form, setForm] = useState(
    admin ? { name: admin.name, email: admin.email || '', phone: admin.phone || '', password: '', permissions: admin.permissions || [] } : empty,
  )
  const [create, c] = useCreateAdminMutation()
  const [update, u] = useUpdateAdminMutation()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggle = (p) =>
    setForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }))

  const submit = async (e) => {
    e.preventDefault()
    const body = { name: form.name, email: form.email, phone: form.phone, permissions: form.permissions }
    if (form.password) body.password = form.password
    try {
      if (admin) await update({ id: admin._id, ...body }).unwrap()
      else await create(body).unwrap()
      toast.success(admin ? 'Admin updated' : 'Admin created')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={admin ? `Edit ${admin.name}` : 'Add admin'}
      size="max-w-2xl"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="admin-form" disabled={c.isLoading || u.isLoading}>
            {admin ? 'Save changes' : 'Create admin'}
          </button>
        </>
      }
    >
      <form id="admin-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input className="input" value={form.name} onChange={set('name')} required minLength={2} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Mobile (optional)">
            <input className="input" inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} pattern="[6-9]\d{9}" />
          </Field>
          <Field label="Password" hint={admin ? 'Leave blank to keep the current password' : 'At least 12 characters'}>
            <input className="input" type="password" value={form.password} onChange={set('password')} required={!admin} minLength={12} maxLength={72} autoComplete="new-password" />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="label mb-0">Permissions</span>
            <span className="text-xs text-muted">Quick presets:</span>
            {Object.entries(PRESETS).map(([name, list]) => (
              <button key={name} type="button" className="chip bg-primary-soft py-1 text-brand hover:brightness-95" onClick={() => setForm((f) => ({ ...f, permissions: list }))}>
                {name}
              </button>
            ))}
            <button type="button" className="chip bg-surface-2 py-1" onClick={() => setForm((f) => ({ ...f, permissions: [] }))}>
              Clear
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {perms.map((p) => {
              const on = form.permissions.includes(p)
              return (
                <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${on ? 'border-gold bg-selected' : 'border-line'}`}>
                  <input type="checkbox" className="mt-1 accent-primary" checked={on} onChange={() => toggle(p)} />
                  <span>
                    <span className="block text-sm font-medium">{PERM_INFO[p]?.[0] || p}</span>
                    <span className="block text-xs text-muted">{PERM_INFO[p]?.[1]}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default function Admins() {
  const { data: admins, isLoading, error, refetch } = useAdminsQuery()
  const { data: perms = Object.keys(PERM_INFO) } = usePermissionsQuery()
  const [editing, setEditing] = useState(null) // null | 'new' | admin
  const [del] = useDeleteAdminMutation()

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const remove = async (a) => {
    if (!window.confirm(`Delete admin ${a.name}? They will lose access immediately.`)) return
    try {
      await del(a._id).unwrap()
      toast.success('Admin deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const staff = admins.filter((a) => a.role === 'admin')

  return (
    <div>
      <PageHeader
        title="Admins & roles"
        subtitle="Give your team access to only what they need."
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add admin
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {admins.map((a) => (
          <div key={a._id} className="card p-4">
            <div className="flex items-start gap-3">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-full font-semibold ${a.role === 'superadmin' ? 'bg-secondary-soft text-warning' : 'bg-primary-soft text-brand'}`}>
                {a.role === 'superadmin' ? <Crown className="size-5" /> : a.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.name}</p>
                <a href={`mailto:${a.email}`} className="block truncate text-sm text-muted hover:text-accent">{a.email}</a>
                <p className="text-xs text-muted">Last login: {a.lastLoginAt ? formatDate(a.lastLoginAt) : 'never'}</p>
              </div>
              {a.role === 'admin' && (
                <div className="flex gap-1">
                  <button className="btn-ghost btn-sm px-2" onClick={() => setEditing(a)} aria-label="Edit">
                    <Pencil className="size-4" />
                  </button>
                  <button className="btn-ghost btn-sm px-2 text-error" onClick={() => remove(a)} aria-label="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.role === 'superadmin' ? (
                <span className="chip bg-secondary-soft text-warning">Owner · full access</span>
              ) : a.permissions.length ? (
                a.permissions.map((p) => (
                  <span key={p} className="chip bg-surface-2">{PERM_INFO[p]?.[0] || p}</span>
                ))
              ) : (
                <span className="text-xs text-muted">No permissions yet</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5 text-brand" /> Permission matrix
      </h2>
      {staff.length === 0 ? (
        <div className="card">
          <EmptyState icon="🛡️" title="No admins yet" text="Add a store manager so you don't have to run everything yourself." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Admin</th>
                {perms.map((p) => (
                  <th key={p} className="text-center whitespace-nowrap">{PERM_INFO[p]?.[0] || p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((a) => (
                <tr key={a._id}>
                  <td className="font-medium whitespace-nowrap">{a.name}</td>
                  {perms.map((p) => (
                    <td key={p} className="text-center">
                      {a.permissions.includes(p) ? <Check className="mx-auto size-4 text-brand" /> : <span className="text-muted">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <AdminForm admin={editing === 'new' ? null : editing} perms={perms} onClose={() => setEditing(null)} />}
    </div>
  )
}
