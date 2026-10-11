import { ArrowLeft, HelpCircle, Home, LayoutGrid, Search, TicketPercent } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePageMeta } from '../../lib/meta'

const STORE_LINKS = [
  ['/categories', 'Browse categories', LayoutGrid],
  ['/search', 'All products', Search],
  ['/deals', 'Deals of the day', TicketPercent],
  ['/support', 'Help & support', HelpCircle],
]

/** Branded 404 for unknown URLs, in the store and inside each dashboard panel. */
export default function NotFound({ inPanel = false }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const panelHome = '/' + pathname.split('/')[1]
  usePageMeta('Page not found', "The page you're looking for doesn't exist or has moved.", false)

  return (
    <div data-page="not-found" className={`flex flex-col items-center justify-center py-12 text-center ${inPanel ? 'min-h-[50vh]' : 'container-page min-h-[60vh]'}`}>
      <div className="relative mb-6" aria-hidden>
        <span className="flex size-28 items-center justify-center rounded-full bg-primary-soft text-6xl sm:size-32 sm:text-7xl">🥛</span>
        <span className="absolute -right-2 -bottom-1 text-4xl">💧</span>
      </div>
      <p className="font-heading text-5xl font-bold text-brand">404</p>
      <h1 className="mt-2 text-2xl font-bold">Oops! This page spilled over</h1>
      <p className="mt-2 max-w-md text-muted">
        We couldn't find <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm break-all">{pathname}</code>. It may have moved, or the link may be mistyped.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to={inPanel ? panelHome : '/'} className="btn-primary">
          <Home className="size-4" /> {inPanel ? 'Back to dashboard' : 'Go to home page'}
        </Link>
        <button type="button" className="btn-outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" /> Go back
        </button>
      </div>
      {!inPanel && (
        <nav aria-label="Popular pages" className="mt-8 grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-4">
          {STORE_LINKS.map(([to, label, Icon]) => (
            <Link key={to} to={to} className="card flex min-h-20 flex-col items-center justify-center gap-1.5 p-3 text-sm hover:border-accent">
              <Icon className="size-5 text-brand" strokeWidth={1.5} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
