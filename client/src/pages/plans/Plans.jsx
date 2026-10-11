import { CalendarCheck, Crown, PauseCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { useSelector } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
import { usePlansQuery } from '../../app/api'
import PageHero from '../../components/PageHero'
import PlanCard from '../../components/PlanCard'
import { EmptyState, ErrorState, Skeleton, Tabs } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { PHOTOS } from '../../lib/images'

const HOW = [
  [Crown, 'Membership', 'Pay once per term for benefits on every store order: member prices, free delivery and priority support, as each plan lists.'],
  [RefreshCw, 'Product subscription', 'Choose products, quantities and days. We deliver on schedule and bill as the plan says: prepaid or per delivery.'],
  [Wallet, 'Use both together', 'A membership and a product subscription are separate, so you can have one, the other, or both.'],
]

const TRUST = [
  [ShieldCheck, 'Activated only after your payment is confirmed'],
  [PauseCircle, 'Pause, change or cancel from your account'],
  [CalendarCheck, 'Changes for tomorrow lock at the nightly cut-off'],
]

/** Membership & subscription landing page with both plan listings. */
export default function Plans() {
  const user = useSelector(selectUser)
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') || ''
  const { data: plans = [], isLoading, error, refetch } = usePlansQuery()
  const shown = kind ? plans.filter((p) => p.kind === kind) : plans
  const groups = [
    ['membership', 'Memberships', 'Benefits on every store order for the length of the term.'],
    ['product', 'Product subscriptions', 'Recurring dairy deliveries on the days you choose.'],
  ].filter(([k]) => !kind || k === kind)
  // Pass through a product picked elsewhere (e.g. "Subscribe" on a product page) to the plan's checkout.
  const carry = ['product', 'variant'].filter((k) => params.get(k)).map((k) => `${k}=${params.get(k)}`).join('&')

  return (
    <div className="container-page py-5 sm:py-8">
      <PageHero
        size="sm"
        image={PHOTOS.milkBottles}
        eyebrow="Memberships & subscriptions"
        title="Fresh dairy, on your terms"
        subtitle="Join a membership for savings on every order, subscribe to the products you use every day, or both."
        crumbs={[['Home', '/'], ['Plans']]}
        actions={
          user && (
            <>
              <Link to="/account/membership" className="btn-primary">
                My membership
              </Link>
              <Link to="/subscriptions" className="btn-outline bg-surface/40 backdrop-blur-sm">
                My subscriptions
              </Link>
            </>
          )
        }
      />

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {HOW.map(([Icon, title, text]) => (
          <li key={title} className="card flex gap-3 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand">
              <Icon className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <span className="block font-medium">{title}</span>
              <span className="mt-0.5 block text-sm text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-10 mb-6">
        <Tabs
          tabs={[
            { value: '', label: 'All plans' },
            { value: 'membership', label: 'Memberships' },
            { value: 'product', label: 'Product subscriptions' },
          ]}
          value={kind}
          onChange={(v) => {
            const next = new URLSearchParams(params)
            if (v) next.set('kind', v)
            else next.delete('kind')
            setParams(next, { replace: true })
          }}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[30rem]" />
          ))}
        </div>
      ) : !shown.length ? (
        <div className="card">
          <EmptyState icon="🥛" title="No plans are open right now" text="New plans appear here as soon as they are published. You can still order from the store any time." action={<Link to="/search" className="btn-primary">Shop products</Link>} />
        </div>
      ) : (
        groups.map(([k, title, text]) => {
          const list = shown.filter((p) => p.kind === k)
          if (!list.length) return null
          return (
            <section key={k} className="mb-12" aria-labelledby={`plans-${k}`}>
              <h2 id={`plans-${k}`} className="h-section">
                {title}
              </h2>
              <p className="mt-1 mb-5 text-sm text-muted">{text}</p>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {list.map((p) => (
                  <PlanCard key={p._id} plan={p} to={`/plans/${p.slug}${carry && k === 'product' ? `?${carry}` : ''}`} />
                ))}
              </div>
            </section>
          )
        })
      )}

      <ul className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted">
        {TRUST.map(([Icon, text]) => (
          <li key={text} className="flex items-center gap-2">
            <Icon className="size-4 text-brand" aria-hidden /> {text}
          </li>
        ))}
      </ul>
    </div>
  )
}
