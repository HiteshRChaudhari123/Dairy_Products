import { ChevronDown, ChevronRight, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import toast from 'react-hot-toast'
import {
  errorMessage,
  useAddBatchMutation,
  useAdminProductsQuery,
  useDeleteBatchMutation,
  useSetStockMutation,
} from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, Toggle } from '../../components/ui'
import { dateKey, formatDate } from '../../lib/format'

function stockTone(stock, threshold) {
  if (stock <= 0) return ['Out', 'bg-error/10 text-error ']
  if (stock <= threshold) return ['Low', 'bg-secondary-soft text-warning']
  return ['OK', 'bg-primary-soft text-brand']
}

function expiryTone(d) {
  const days = (new Date(d) - new Date()) / 86400000
  if (days < 0) return 'text-error font-semibold'
  if (days <= 3) return 'text-warning font-semibold'
  return ''
}

function StockCell({ product, variant }) {
  const [value, setValue] = useState(String(variant.stock))
  const [setStock, { isLoading }] = useSetStockMutation()
  const dirty = Number(value) !== variant.stock
  const save = async () => {
    try {
      await setStock({ id: product._id, variantId: variant._id, stock: Math.max(0, parseInt(value) || 0) }).unwrap()
      toast.success(`${product.name} (${variant.label}) stock updated`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      <input
        type="number"
        min="0"
        className="input w-20 py-1.5 text-right"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
        aria-label={`Stock for ${product.name} ${variant.label}`}
      />
      <button className="btn-primary btn-sm px-2" disabled={!dirty || isLoading} onClick={save} aria-label="Save stock">
        <Save className="size-4" />
      </button>
    </div>
  )
}

function Batches({ product }) {
  const [addBatch, { isLoading }] = useAddBatchMutation()
  const [deleteBatch] = useDeleteBatchMutation()
  const [form, setForm] = useState({ batchNo: '', mfgDate: dateKey(), expiryDate: '', qty: '' })
  const add = async (e) => {
    e.preventDefault()
    if (!form.batchNo || !form.expiryDate) return toast.error('Batch number and expiry date are required')
    try {
      await addBatch({ id: product._id, ...form, qty: parseInt(form.qty) || 0 }).unwrap()
      toast.success('Batch added')
      setForm({ batchNo: '', mfgDate: dateKey(), expiryDate: '', qty: '' })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  return (
    <div className="space-y-3 bg-surface-2 p-4">
      <p className="text-sm font-semibold">Batches & expiry: {product.name}</p>
      {product.batches?.length ? (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Mfg</th>
                <th>Expiry</th>
                <th className="text-right">Qty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {product.batches.map((b) => (
                <tr key={b._id}>
                  <td className="font-mono text-xs">{b.batchNo}</td>
                  <td className="text-xs">{formatDate(b.mfgDate)}</td>
                  <td className={`text-xs ${expiryTone(b.expiryDate)}`}>
                    {formatDate(b.expiryDate)}
                    {new Date(b.expiryDate) < new Date() && ' (expired)'}
                  </td>
                  <td className="text-right">{b.qty}</td>
                  <td className="text-right">
                    <button
                      className="btn-ghost btn-sm px-2 text-error"
                      aria-label="Delete batch"
                      onClick={() =>
                        deleteBatch({ id: product._id, batchId: b._id })
                          .unwrap()
                          .then(() => toast.success(`Batch ${b.batchNo} removed`))
                          .catch((e) => toast.error(errorMessage(e)))
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted">No batches recorded.</p>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className="input" placeholder="Batch no" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
        <label className="text-xs text-muted">
          Mfg
          <input type="date" className="input" value={form.mfgDate} onChange={(e) => setForm({ ...form, mfgDate: e.target.value })} />
        </label>
        <label className="text-xs text-muted">
          Expiry
          <input type="date" className="input" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
        </label>
        <input type="number" min="0" className="input" placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        <button className="btn-outline" disabled={isLoading}>
          <Plus className="size-4" /> Add batch
        </button>
      </form>
    </div>
  )
}

export default function Inventory() {
  const [lowOnly, setLowOnly] = useState(false)
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState(null)
  const { data, isLoading, error, refetch } = useAdminProductsQuery({ limit: 100, lowStock: lowOnly ? '1' : '' })

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const products = (data?.items || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
  const counts = (data?.items || []).flatMap((p) => p.variants.map((v) => stockTone(v.stock, p.lowStockThreshold)[0]))

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`${counts.filter((c) => c === 'Out').length} out of stock · ${counts.filter((c) => c === 'Low').length} running low`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Filter products" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Toggle checked={lowOnly} onChange={setLowOnly} label="Low stock only" />
      </div>

      {!products.length ? (
        <div className="card">
          <EmptyState icon="✅" title={lowOnly ? 'Nothing is running low' : 'No products'} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Product / size</th>
                <th>SKU</th>
                <th className="text-right">Alert at</th>
                <th>Status</th>
                <th className="text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <Fragment key={p._id}>
                  {p.variants.map((v, i) => {
                    const [label, tone] = stockTone(v.stock, p.lowStockThreshold)
                    return (
                      <tr key={v._id}>
                        <td>
                          {i === 0 ? (
                            <button className="flex items-center gap-1 text-left font-medium hover:text-accent" onClick={() => setExpanded(expanded === p._id ? null : p._id)}>
                              {expanded === p._id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              {p.name}
                              {p.batches?.some((b) => (new Date(b.expiryDate) - new Date()) / 86400000 <= 3) && <span title="Batch expiring soon">⏰</span>}
                            </button>
                          ) : null}
                          <span className="ml-5 text-xs text-muted">{v.label}</span>
                        </td>
                        <td className="font-mono text-xs">{v.sku || '—'}</td>
                        <td className="text-right text-muted">{p.lowStockThreshold}</td>
                        <td>
                          <span className={`chip ${tone}`}>{label}</span>
                        </td>
                        <td>
                          <StockCell key={v.stock} product={p} variant={v} />
                        </td>
                      </tr>
                    )
                  })}
                  {expanded === p._id && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <Batches product={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
