// Small shared UI building blocks used across all panels.
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, Star, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { STATUS_LABEL } from '../lib/format'

export function Spinner({ className = 'size-5' }) {
  return <Loader2 className={`animate-spin text-brand ${className}`} aria-label="Loading" />
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />
}

export function EmptyState({ icon = '🥛', title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-4 flex size-20 items-center justify-center rounded-full border border-gold-line bg-elevated text-4xl">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Couldn't load this"
      text={error?.data?.message || (error?.status === 'FETCH_ERROR' ? 'Cannot reach the server.' : 'Please try again.')}
      action={onRetry && <button className="btn-outline" onClick={onRetry}>Try again</button>}
    />
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
// Open dialogs, innermost last: only the top one handles Escape/Tab, and the page scrolls again when the last closes.
const openDialogs = []

/**
 * Accessible dialog: focus moves into it on open and returns to the opener on close, Tab/Shift+Tab stay inside,
 * Escape closes (only the topmost when dialogs are stacked), and it is labelled by its title.
 */
export function Modal({ open, onClose, title, children, footer, size = 'max-w-lg' }) {
  const panel = useRef(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const node = panel.current
    const opener = document.activeElement
    openDialogs.push(node)
    document.body.style.overflow = 'hidden'
    // Focus the first form field if there is one, otherwise the dialog itself (not the close button).
    const field = node.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
    ;(field || node).focus({ preventScroll: true })
    const onKey = (e) => {
      if (openDialogs.at(-1) !== node) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items.at(-1)
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openDialogs.splice(openDialogs.indexOf(node), 1)
      if (!openDialogs.length) document.body.style.overflow = ''
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full ${size} flex-col rounded-t-2xl bg-surface shadow-xl outline-none sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 id={titleId} className="text-lg font-semibold">
            {title}
          </h3>
          <button className="rounded-lg p-1.5 hover:bg-surface-2" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

const STATUS_TONE = {
  placed: 'bg-accent-soft text-brand',
  confirmed: 'bg-accent-soft text-brand',
  packed: 'bg-secondary-soft text-warning',
  out_for_delivery: 'bg-secondary-soft text-warning',
  delivered: 'bg-primary-soft text-brand',
  active: 'bg-primary-soft text-brand',
  paid: 'bg-primary-soft text-brand',
  approved: 'bg-primary-soft text-brand',
  resolved: 'bg-primary-soft text-brand',
  cancelled: 'bg-error/10 text-error ',
  failed: 'bg-error/10 text-error ',
  rejected: 'bg-error/10 text-error ',
  returned: 'bg-surface-2 text-muted',
  refunded: 'bg-surface-2 text-muted',
  paused: 'bg-surface-2 text-muted',
  none: 'bg-surface-2 text-muted',
  pending: 'bg-secondary-soft text-warning',
  open: 'bg-secondary-soft text-warning',
  undelivered: 'bg-error/10 text-error',
  pending_payment: 'bg-secondary-soft text-warning',
  created: 'bg-secondary-soft text-warning',
  requested: 'bg-secondary-soft text-warning',
  processing: 'bg-secondary-soft text-warning',
  cancellation_pending: 'bg-secondary-soft text-warning',
  past_due: 'bg-error/10 text-error',
  suspended: 'bg-error/10 text-error',
  expired: 'bg-surface-2 text-muted',
  succeeded: 'bg-primary-soft text-brand',
  published: 'bg-primary-soft text-brand',
  done: 'bg-primary-soft text-brand',
  partially_refunded: 'bg-surface-2 text-muted',
  draft: 'bg-accent-soft text-brand',
  unpublished: 'bg-surface-2 text-muted',
  archived: 'bg-surface-2 text-muted',
  superseded: 'bg-surface-2 text-muted',
}

export function StatusBadge({ status, label }) {
  return <span className={`chip ${STATUS_TONE[status] || 'bg-surface-2 text-muted'}`}>{label || STATUS_LABEL[status] || status}</span>
}

export function Rating({ value = 0, count, size = 'size-3.5' }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Star className={`${size} fill-current text-primary`} aria-hidden />
      <span className="font-semibold text-ink">
        {Number(value || 0).toFixed(1)}
        <span className="sr-only"> out of 5</span>
      </span>
      {count !== undefined && <span className="text-muted">({count})</span>}
    </span>
  )
}

export function Stars({ value = 0, onChange, size = 'size-6' }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star className={`${size} ${n <= value ? 'fill-primary text-primary' : 'text-line-strong'}`} />
        </button>
      ))}
    </div>
  )
}

export function QtyStepper({ value, onChange, max = 50, small }) {
  const btn = `flex items-center justify-center text-ink transition-colors hover:bg-primary-soft hover:text-accent disabled:opacity-40 ${small ? 'size-8' : 'size-10'}`
  return (
    <div className="inline-flex items-center overflow-hidden rounded-full border border-line-strong bg-surface">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} aria-label="Decrease quantity">
        <Minus className="size-4" />
      </button>
      <span className={`min-w-8 text-center font-semibold text-ink ${small ? 'text-sm' : ''}`}>{value}</span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="size-4" /> Prev
      </button>
      <span className="px-2 text-sm text-muted">
        Page {page} of {pages}
      </span>
      <button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </label>
  )
}

/** Switch. `label` is shown next to it; pass `ariaLabel` when the switch has no visible label. */
export function Toggle({ checked, onChange, label, ariaLabel, disabled }) {
  return (
    <label className={`inline-flex items-center gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-primary' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const v = t.value ?? t
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-full border px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
              value === v ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink hover:border-accent hover:bg-primary-soft'
            }`}
          >
            {t.label ?? t}
            {t.count !== undefined && <span className="ml-1.5 opacity-80">({t.count})</span>}
          </button>
        )
      })}
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-soft text-brand',
    secondary: 'bg-secondary-soft text-warning',
    accent: 'bg-accent-soft text-accent',
    error: 'bg-error/10 text-error ',
  }
  return (
    // Icon above the text on very narrow cards (two per row on a 320px phone), beside it from 420px.
    <div className="card flex min-w-0 flex-col items-start gap-3 p-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-4">
      {Icon && (
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-6" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.12em] break-words text-subtle uppercase">{label}</p>
        <p className="truncate font-heading text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-[30px] leading-tight sm:text-[38px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
