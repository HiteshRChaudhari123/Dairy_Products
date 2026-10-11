import { ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { errorMessage, useTopupWalletMutation, useVerifyWalletTopupMutation, useWalletQuery } from '../../app/api'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui'
import { selectUser, setUser } from '../../features/auth/authSlice'
import { formatDateTime, formatINR } from '../../lib/format'
import { loadRazorpay } from '../../lib/razorpay'

const QUICK = [100, 200, 500, 1000]

export default function Wallet() {
  const { data, isLoading, error, refetch } = useWalletQuery()
  const [topup, { isLoading: starting }] = useTopupWalletMutation()
  const [verifyTopup, { isLoading: verifying }] = useVerifyWalletTopupMutation()
  const [amount, setAmount] = useState('')
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const adding = starting || verifying

  const add = async (value) => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 10 || n > 10000) return toast.error('Enter an amount between ₹10 and ₹10,000')
    try {
      const res = await topup({ amount: n }).unwrap()

      // No Razorpay keys configured (dev): the amount is credited immediately, same as
      // checkout's simulated online payment.
      if (!res.razorpay) {
        dispatch(setUser({ ...user, wallet: res.balance }))
        setAmount('')
        toast.success(`${formatINR(n)} added to your wallet`)
        return
      }

      // Razorpay is configured: open the same checkout modal used at order payment, and only
      // credit the wallet once the payment is verified server-side.
      if (!(await loadRazorpay())) throw new Error('Could not load the payment window. Check your connection.')
      const rzp = new window.Razorpay({
        key: res.razorpay.keyId,
        order_id: res.razorpay.orderId,
        amount: res.razorpay.amount,
        currency: res.razorpay.currency,
        name: 'Gavyora',
        description: 'Add money to wallet',
        prefill: { name: user.name, email: user.email, contact: user.phone },
        theme: { color: '#101D35' },
        handler: async (response) => {
          try {
            const verified = await verifyTopup({ topupId: res.topupId, ...response }).unwrap()
            dispatch(setUser({ ...user, wallet: verified.balance }))
            setAmount('')
            toast.success(`${formatINR(n)} added to your wallet`)
          } catch (err) {
            toast.error(errorMessage(err, 'Payment could not be verified'))
          }
        },
        modal: {
          ondismiss: () => toast('Payment cancelled. No money was added.', { icon: 'ℹ️' }),
        },
      })
      rzp.open()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Gavyora wallet</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-night p-6 text-white shadow-sm">
          <WalletIcon className="absolute -right-4 -bottom-4 size-32 opacity-10" />
          <p className="text-sm text-white/80">Available balance</p>
          {isLoading ? <Skeleton className="mt-2 h-10 w-40 bg-white/20" /> : <p className="mt-1 font-heading text-4xl font-bold">{formatINR(data.balance)}</p>}
          <p className="mt-4 text-xs text-white/75">Use it for one-tap checkout and automatic subscription payments. Refunds arrive here instantly.</p>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Add money</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {QUICK.map((q) => (
              <button key={q} className="btn-outline btn-sm px-2" disabled={adding} onClick={() => add(q)}>
                +₹{q}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add(amount)
            }}
          >
            <input
              className="input"
              inputMode="numeric"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn-primary" disabled={adding || !amount}>
              Add
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">Pay securely with UPI, card or net banking. The amount is added as soon as the payment is confirmed.</p>
        </div>
      </div>

      <div className="card">
        <h2 className="border-b border-line px-5 py-4 font-semibold">Transactions</h2>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.transactions.length === 0 ? (
          <EmptyState icon="💸" title="No transactions yet" />
        ) : (
          <ul className="divide-y divide-line">
            {data.transactions.map((t) => {
              const credit = t.type === 'credit'
              return (
                <li key={t._id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                      credit ? 'bg-primary-soft text-brand' : 'bg-error/10 text-error '
                    }`}
                  >
                    {credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.reason}</p>
                    <p className="text-xs text-muted">{formatDateTime(t.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${credit ? 'text-brand' : 'text-error'}`}>
                      {credit ? '+' : '−'}
                      {formatINR(t.amount)}
                    </p>
                    <p className="text-xs text-muted">Bal {formatINR(t.balanceAfter)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
