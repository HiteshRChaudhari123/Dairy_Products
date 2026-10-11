// Helpers shared by the admin pages.
import { Modal } from '../../components/ui'

export const CHART_COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-6)']

export const axisProps = {
  tick: { fill: 'var(--color-muted)', fontSize: 12 },
  axisLine: { stroke: 'var(--color-line)' },
  tickLine: false,
}

export const tooltipStyle = {
  contentStyle: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-line)',
    borderRadius: 12,
    color: 'var(--color-ink)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--color-ink)', fontWeight: 600 },
}

export const shortDate = (d) =>
  new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/**
 * A text cell starting with = + - @ (or tab / carriage return) is run as a formula by Excel and Sheets, so a customer
 * named "=HYPERLINK(...)" could attack whoever opens the export. Such text gets a leading apostrophe and is shown as
 * plain text. Real numbers (including negatives) are left alone.
 */
export const csvSafe = (v) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  const s = String(v)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/** Download rows (array of arrays; first row = header) as a CSV that Excel opens correctly. */
export function downloadCSV(filename, rows) {
  const esc = (v) => {
    const s = csvSafe(v)
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Minimal CSV parser (handles quoted fields and commas inside quotes). */
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

export function ConfirmModal({ open, onClose, onConfirm, title = 'Are you sure?', text, confirmLabel = 'Delete', danger = true, busy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="max-w-md"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{text}</p>
    </Modal>
  )
}

/** Hide the dashboard chrome (sidebar, top bar, tab bar) when printing a page. */
export function PrintStyles() {
  return (
    <style>{`@media print {
  aside, header, nav, .no-print { display: none !important; }
  main { padding: 0 !important; }
  .card { box-shadow: none !important; break-inside: avoid; }
  html[data-theme='dark'] { color-scheme: light; }
}`}</style>
  )
}

export const NEXT_STATUSES = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'undelivered', 'cancelled'],
  delivered: ['returned'],
  undelivered: ['confirmed', 'cancelled'],
  cancelled: [],
  returned: [],
}

export const minStock = (p) => Math.min(...(p.variants || []).map((v) => v.stock))
export const totalStock = (p) => (p.variants || []).reduce((s, v) => s + v.stock, 0)
