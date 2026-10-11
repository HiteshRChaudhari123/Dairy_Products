import { ArrowLeft, Ban, Mail, Phone, Wallet } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, useAdjustWalletMutation, useBlockUserMutation, useCustomerQuery } from '../../app/api'
import { usePanelBase } from '../../components/guards'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, StatCard, StatusBadge } from '../../components/ui'
import { formatDate, formatDateTime, formatINR, FREQUENCY_LABEL, telHref } from '../../lib/format'
import { ConfirmModal } from './_shared'

function WalletModal({ userId, onClose }) {
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('credit')
  const [reason, setReason] = useState('')
  const [adjust, { isLoading }] = useAdjustWalletMutation()
  const save = async () => {
    const n = parseInt(amount)
    if (!n || n <= 0) return toast.error('Enter an amount')
    if (reason.trim().length < 3) return toast.error('Enter a reason')
    try {
      const r = await adjust({ id: userId, amount: mode === 'credit' ? n : -n, reason: reason.trim() }).unwrap()
      toast.success(`Wallet updated. New balance ${formatINR(r.balance)}`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust wallet"
      size="max-w-md"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={isLoading}>Save</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {['credit', 'debit'].map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`btn ${mode === m ? 'bg-primary text-on-primary' : 'btn-outline'}`}>
              {m === 'credit' ? '+ Add money' : '− Deduct'}
            </button>
          ))}
        </div>
        <Field label="Amount (₹)">
          <input type="number" min="1" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason" hint="Shown to the customer in their wallet history">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Compensation for late delivery" />
        </Field>
      </div>
    </Modal>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const base = usePanelBase()
  const { data, isLoading, error, refetch } = useCustomerQuery(id)
  const [block, { isLoading: blocking }] = useBlockUserMutation()
  const [walletOpen, setWalletOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const { user, orders, subscriptions, wallet } = data
  const spent = orders.filter((o) => !['cancelled', 'returned'].includes(o.status)).reduce((s, o) => s + o.total, 0)

  const toggleBlock = async () => {
    try {
      await block({ id, isBlocked: !user.isBlocked }).unwrap()
      toast.success(user.isBlocked ? 'Customer unblocked' : 'Customer blocked')
      setConfirmBlock(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <Link to={`${base}/customers`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All customers
      </Link>
      <PageHeader
        title={user.name}
        subtitle={`Customer since ${formatDate(user.createdAt)}${user.lastLoginAt ? ` · last login ${formatDateTime(user.lastLoginAt)}` : ''}`}
        actions={
          <>
            <button className="btn-outline btn-sm" onClick={() => setWalletOpen(true)}>
              <Wallet className="size-4" /> Adjust wallet
            </button>
            <button className={user.isBlocked ? 'btn-primary btn-sm' : 'btn-outline btn-sm text-error'} onClick={() => setConfirmBlock(true)}>
              <Ban className="size-4" /> {user.isBlocked ? 'Unblock' : 'Block'}
            </button>
          </>
        }
      />
      {user.isBlocked && <p className="mb-4 rounded-xl bg-error/10 p-3 text-sm text-error ">This customer is blocked and cannot log in.</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Wallet" value={formatINR(user.wallet)} icon={Wallet} />
        <StatCard label="Recent orders" value={orders.length} tone="accent" />
        <StatCard label="Spent (recent)" value={formatINR(spent)} tone="secondary" />
        <StatCard label="Loyalty points" value={user.loyaltyPoints} sub={`Referral code ${user.referralCode}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="card space-y-2 p-4 text-sm sm:p-5">
            <h2 className="mb-1 font-semibold">Contact</h2>
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted" aria-hidden /> {user.phone ? <a href={telHref(user.phone)} className="link">{user.phone}</a> : '—'}
            </p>
            <p className="flex items-center gap-2 break-all">
              <Mail className="size-4 shrink-0 text-muted" aria-hidden /> {user.email ? <a href={`mailto:${user.email}`} className="link">{user.email}</a> : '—'}
            </p>
          </div>
          <div className="card p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Addresses</h2>
            {user.addresses.length ? (
              <ul className="space-y-3 text-sm">
                {user.addresses.map((a) => (
                  <li key={a._id} className="rounded-lg border border-line p-3">
                    <p className="font-medium">
                      {a.label} {a.isDefault && <span className="chip bg-primary-soft text-brand">Default</span>}
                    </p>
                    <p className="text-muted">
                      {a.line1}
                      {a.line2 && `, ${a.line2}`}, {a.city} – {a.pincode}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No saved addresses.</p>
            )}
          </div>
          <div className="card p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Subscriptions</h2>
            {subscriptions.length ? (
              <ul className="space-y-2 text-sm">
                {subscriptions.map((s) => (
                  <li key={s._id} className="flex items-center justify-between gap-2">
                    <span>
                      {(s.items?.length ? s.items : [s]).map((it) => `${it.productName} (${it.variantLabel}) × ${it.qty}`).join(', ')}
                      <span className="block text-xs text-muted">{FREQUENCY_LABEL[s.frequency]}</span>
                    </span>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No subscriptions.</p>
            )}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-x-auto">
            <h2 className="border-b border-line px-5 py-3 font-semibold">Recent orders</h2>
            {orders.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th className="text-right">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id}>
                      <td>
                        <Link to={`${base}/orders/${o._id}`} className="link">{o.orderNo}</Link>
                      </td>
                      <td className="text-xs">{formatDate(o.createdAt)}</td>
                      <td className="text-right font-semibold">{formatINR(o.total)}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon="📦" title="No orders yet" />
            )}
          </div>
          <div className="card overflow-x-auto">
            <h2 className="border-b border-line px-5 py-3 font-semibold">Wallet transactions</h2>
            {wallet.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reason</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.map((t) => (
                    <tr key={t._id}>
                      <td className="text-xs whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                      <td className="text-sm">{t.reason}</td>
                      <td className={`text-right font-semibold ${t.type === 'credit' ? 'text-brand' : 'text-error'}`}>
                        {t.type === 'credit' ? '+' : '−'}
                        {formatINR(t.amount)}
                      </td>
                      <td className="text-right text-muted">{formatINR(t.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-5 text-sm text-muted">No wallet activity.</p>
            )}
          </div>
        </div>
      </div>

      {walletOpen && <WalletModal userId={id} onClose={() => setWalletOpen(false)} />}
      <ConfirmModal
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={toggleBlock}
        busy={blocking}
        danger={!user.isBlocked}
        title={user.isBlocked ? 'Unblock customer?' : 'Block customer?'}
        confirmLabel={user.isBlocked ? 'Unblock' : 'Block'}
        text={user.isBlocked ? `${user.name} will be able to log in and order again.` : `${user.name} will be logged out and won't be able to log in or place orders.`}
      />
    </div>
  )
}
