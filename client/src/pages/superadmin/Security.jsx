import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Package, Play, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage, useRunSecurityAuditMutation, useSecurityAuditQuery } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner, StatCard, Tabs } from '../../components/ui'
import { formatDateTime } from '../../lib/format'

// Every status has an icon and a word, never colour alone.
const STATUS = {
  FAIL: { icon: XCircle, label: 'Fail', chip: 'bg-error/10 text-error', tone: 'error' },
  WARNING: { icon: AlertTriangle, label: 'Warning', chip: 'bg-secondary-soft text-warning', tone: 'secondary' },
  'NOT CHECKED': { icon: CircleHelp, label: 'Not checked', chip: 'bg-surface-2 text-muted', tone: 'accent' },
  PASS: { icon: CheckCircle2, label: 'Pass', chip: 'bg-success/10 text-success', tone: 'primary' },
}
const ORDER = ['FAIL', 'WARNING', 'NOT CHECKED', 'PASS']
const SEVERITY = { critical: 0, high: 1, medium: 2, low: 3 }

function StatusChip({ status }) {
  const s = STATUS[status]
  return (
    <span className={`chip shrink-0 ${s.chip}`}>
      <s.icon className="size-3.5" aria-hidden /> {s.label}
    </span>
  )
}

function Finding({ check }) {
  return (
    <details className="group card" open={check.status === 'FAIL'}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <StatusChip status={check.status} />
        <span className="min-w-0 flex-1 font-medium">{check.title}</span>
        <span className="chip bg-surface-2 text-muted capitalize">{check.severity}</span>
        <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-line p-4 text-sm">
        <p className="text-xs text-muted">
          <span className="font-semibold tracking-wide uppercase">Component</span> · <code className="break-all">{check.component}</code>
        </p>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Evidence</p>
          <ul className="space-y-1 rounded-xl bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">
            {check.evidence.map((e, i) => (
              <li key={i} className="break-words">
                {e}
              </li>
            ))}
          </ul>
        </div>
        {check.status !== 'PASS' && (
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Recommended fix</p>
            <p>{check.remediation}</p>
          </div>
        )}
      </div>
    </details>
  )
}

function Dependencies({ check }) {
  const deps = check?.dependencies
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Package className="size-5 text-brand" aria-hidden /> Dependency audit
      </h2>
      {!deps ? (
        <p className="text-sm text-muted">{check?.evidence?.[0] || 'Not checked'}. Run <code>npm run security:deps</code> in <code>server/</code>.</p>
      ) : (
        <>
          <ul className="divide-y divide-line text-sm">
            {deps.packages.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium capitalize">{p.name}</span>
                {p.error ? (
                  <span className="text-muted">audit failed</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5 text-xs">
                    {['critical', 'high', 'moderate', 'low'].map((k) => (
                      <span key={k} className={`chip ${p.counts[k] ? (k === 'critical' || k === 'high' ? 'bg-error/10 text-error' : 'bg-secondary-soft text-warning') : 'bg-surface-2 text-muted'}`}>
                        {p.counts[k]} {k}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">npm audit run {formatDateTime(deps.generatedAt)}</p>
        </>
      )}
    </section>
  )
}

export default function Security() {
  const { data, isLoading, error, refetch } = useSecurityAuditQuery()
  const [run, { isLoading: running }] = useRunSecurityAuditMutation()
  const [filter, setFilter] = useState('')
  const report = data?.report

  const runAudit = async () => {
    try {
      const res = await run().unwrap()
      const s = res.report.summary
      toast.success(`Audit finished: ${s.fail} failed, ${s.warning} warnings`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const runButton = (
    <button className="btn-primary btn-sm" onClick={runAudit} disabled={running}>
      {running ? <Spinner className="size-4 text-current" /> : <Play className="size-4" />} {running ? 'Running…' : 'Run audit'}
    </button>
  )

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  if (!report)
    return (
      <div>
        <PageHeader title="Security audit" subtitle="Checks this API's configuration, routes and dependencies." actions={runButton} />
        <div className="card">
          <EmptyState icon="🛡️" title="No audit has run since the server started" text="Run the audit to check configuration, authentication, headers, CORS, errors and dependencies." action={runButton} />
        </div>
      </div>
    )

  const checks = [...report.checks].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || SEVERITY[a.severity] - SEVERITY[b.severity])
  const shown = filter ? checks.filter((c) => c.status === filter) : checks
  const categories = [...new Set(checks.map((c) => c.category))]
  const overall = STATUS[report.overall]
  const s = report.summary

  return (
    <div className="space-y-6">
      <PageHeader title="Security audit" subtitle={`Last run ${formatDateTime(report.generatedAt)} · ${report.environment} · ${report.durationMs} ms`} actions={runButton} />

      <section className={`card flex flex-wrap items-center gap-4 p-5 ${report.overall === 'FAIL' ? 'border-error/40' : ''}`} aria-live="polite">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${overall.chip}`}>
          {report.overall === 'PASS' ? <ShieldCheck className="size-6" aria-hidden /> : <ShieldAlert className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-subtle uppercase">Overall status</p>
          <p className="font-heading text-2xl font-semibold">
            {report.overall === 'FAIL' ? 'Action needed' : report.overall === 'WARNING' ? 'Review warnings' : 'All checks passed'}
          </p>
          <p className="mt-1 text-sm text-muted">{report.note}</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {ORDER.map((k) => (
          <button key={k} type="button" className="text-left" onClick={() => setFilter(filter === k ? '' : k)} aria-pressed={filter === k}>
            <StatCard icon={STATUS[k].icon} label={STATUS[k].label} value={{ FAIL: s.fail, WARNING: s.warning, 'NOT CHECKED': s.notChecked, PASS: s.pass }[k]} tone={STATUS[k].tone} />
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Findings</h2>
            <Tabs
              tabs={[{ value: '', label: 'All', count: s.total }, ...ORDER.map((k) => ({ value: k, label: STATUS[k].label, count: checks.filter((c) => c.status === k).length }))]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          {shown.length ? shown.map((c) => <Finding key={c.id} check={c} />) : <p className="card p-5 text-sm text-muted">No findings with this status.</p>}
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">By area</h2>
            <ul className="space-y-3 text-sm">
              {categories.map((cat) => {
                const list = checks.filter((c) => c.category === cat)
                const worst = ORDER.find((st) => list.some((c) => c.status === st))
                return (
                  <li key={cat} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{cat}</span>
                      <span className="text-xs text-muted">
                        {list.filter((c) => c.status === 'PASS').length} of {list.length} passed
                      </span>
                    </span>
                    <StatusChip status={worst} />
                  </li>
                )
              })}
            </ul>
          </section>
          <Dependencies check={checks.find((c) => c.id === 'deps.audit')} />
        </aside>
      </div>
    </div>
  )
}
