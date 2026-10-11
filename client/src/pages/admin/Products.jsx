import { Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useSearchParams } from 'react-router-dom'
import {
  errorMessage,
  useAdminProductsQuery,
  useCategoriesQuery,
  useCreateProductMutation,
  useDeleteProductMutation,
  useUpdateProductMutation,
} from '../../app/api'
import { usePanelBase } from '../../components/guards'
import ProductImage from '../../components/ProductImage'
import { EmptyState, ErrorState, Modal, PageHeader, Pagination, Rating, Skeleton, Toggle } from '../../components/ui'
import { formatINR } from '../../lib/format'
import { ConfirmModal, downloadCSV, parseCSV, totalStock } from './_shared'

const TEMPLATE_HEADER = ['name', 'category', 'variant label', 'price', 'mrp', 'stock', 'description']

function priceRange(p) {
  const prices = p.variants.map((v) => v.price)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  return lo === hi ? formatINR(lo) : `${formatINR(lo)} – ${formatINR(hi)}`
}

/** Rows with the same product name become one product with several variants. */
function groupRows(rows, categories) {
  const products = new Map()
  const errors = []
  rows.forEach((r, i) => {
    const [name, cat, label, price, mrp, stock, description] = r.map((c) => (c || '').trim())
    const line = i + 2
    const category = categories.find((c) => c.slug === cat.toLowerCase() || c.name.toLowerCase() === cat.toLowerCase())
    if (!name || !label) return errors.push(`Row ${line}: name and variant label are required`)
    if (!category) return errors.push(`Row ${line}: unknown category "${cat}"`)
    if (isNaN(+price) || isNaN(+mrp)) return errors.push(`Row ${line}: price and mrp must be numbers`)
    if (!products.has(name)) products.set(name, { name, category: category._id, categoryName: category.name, description, variants: [] })
    products.get(name).variants.push({ label, price: +price, mrp: +mrp || +price, stock: parseInt(stock) || 0 })
  })
  return { products: [...products.values()], errors }
}

function BulkUpload({ open, onClose, categories }) {
  const [parsed, setParsed] = useState(null)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [create] = useCreateProductMutation()

  const onFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCSV(String(reader.result).replace(/^﻿/, ''))
      const body = rows[0]?.[0]?.toLowerCase() === 'name' ? rows.slice(1) : rows
      setParsed(groupRows(body, categories))
      setResults([])
    }
    reader.readAsText(file)
  }

  const upload = async () => {
    setBusy(true)
    const out = []
    for (const p of parsed.products) {
      try {
        const { categoryName: _c, ...body } = p
        await create({ ...body, isActive: true }).unwrap()
        out.push({ name: p.name, ok: true })
      } catch (e) {
        out.push({ name: p.name, ok: false, message: errorMessage(e) })
      }
      setResults([...out])
    }
    setBusy(false)
    const ok = out.filter((r) => r.ok).length
    toast.success(`${ok} of ${out.length} products created`)
  }

  const close = () => {
    setParsed(null)
    setResults([])
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk upload products (CSV)"
      size="max-w-2xl"
      footer={
        <>
          <button className="btn-outline" onClick={close}>
            Close
          </button>
          <button className="btn-primary" disabled={!parsed?.products.length || busy || results.length > 0} onClick={upload}>
            {busy ? 'Uploading…' : `Create ${parsed?.products.length || 0} products`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          One row per variant. Rows with the same name become one product with several sizes. Category can be the slug or name (e.g.{' '}
          <code>milk</code>, <code>ghee</code>).{' '}
          <button
            type="button"
            className="link"
            onClick={() =>
              downloadCSV('gavyora-products-template.csv', [
                TEMPLATE_HEADER,
                ['Farm Fresh Toned Milk', 'milk', '500 ml', '28', '30', '100', 'Fresh farm milk'],
                ['Farm Fresh Toned Milk', 'milk', '1 L', '54', '58', '80', 'Fresh farm milk'],
                ['Pure Cow Ghee', 'ghee', '500 ml', '399', '440', '40', 'Slow-cooked ghee'],
              ])
            }
          >
            Download template
          </button>
        </p>
        <input type="file" accept=".csv,text/csv" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
        {parsed && (
          <>
            {parsed.errors.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-error/10 p-3 text-xs text-error ">
                {parsed.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Variants</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.products.map((p) => {
                    const r = results.find((x) => x.name === p.name)
                    return (
                      <tr key={p.name}>
                        <td className="font-medium">{p.name}</td>
                        <td>{p.categoryName}</td>
                        <td className="text-xs">{p.variants.map((v) => `${v.label} ${formatINR(v.price)}`).join(', ')}</td>
                        <td className="text-xs">{r ? r.ok ? <span className="text-brand">✓ Created</span> : <span className="text-error">{r.message}</span> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Products() {
  const base = usePanelBase()
  const [params, setParams] = useSearchParams()
  const filters = { q: params.get('q') || '', category: params.get('category') || '', sort: params.get('sort') || '', page: Number(params.get('page')) || 1 }
  const [search, setSearch] = useState(filters.q)
  const [toDelete, setToDelete] = useState(null)
  const [bulk, setBulk] = useState(false)
  const { data, isLoading, isFetching, error, refetch } = useAdminProductsQuery(filters)
  const { data: categories = [] } = useCategoriesQuery({ all: '1' })
  const [update] = useUpdateProductMutation()
  const [remove, { isLoading: deleting }] = useDeleteProductMutation()

  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  const toggleActive = async (p) => {
    try {
      await update({ id: p._id, isActive: !p.isActive }).unwrap()
      toast.success(`${p.name} ${p.isActive ? 'hidden from store' : 'is live'}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const doDelete = async () => {
    try {
      await remove(toDelete._id).unwrap()
      toast.success('Product deleted')
      setToDelete(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const items = data?.items || []

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={data ? `${data.total} products` : 'Your catalogue'}
        actions={
          <>
            <button className="btn-outline btn-sm" onClick={() => setBulk(true)}>
              <Upload className="size-4" /> Bulk upload CSV
            </button>
            <Link to={`${base}/products/new`} className="btn-primary btn-sm">
              <Plus className="size-4" /> Add product
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <form
          className="relative min-w-0 flex-1 basis-60"
          onSubmit={(e) => {
            e.preventDefault()
            set({ ...filters, q: search.trim() })
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input w-auto" value={filters.category} onChange={(e) => set({ ...filters, category: e.target.value })} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filters.sort} onChange={(e) => set({ ...filters, sort: e.target.value })} aria-label="Sort">
          <option value="">Newest</option>
          <option value="popular">Best selling</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Top rated</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon="📦"
            title="No products found"
            action={
              <Link to={`${base}/products/new`} className="btn-primary">
                Add product
              </Link>
            }
          />
        </div>
      ) : (
        <div className={isFetching ? 'opacity-60' : ''}>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th className="text-right">Stock</th>
                  <th>Rating</th>
                  <th>Live</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const stock = totalStock(p)
                  return (
                    <tr key={p._id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ProductImage product={p} className="size-11! shrink-0" size="text-xl" rounded="rounded-lg" />
                          <div className="min-w-0">
                            <Link to={`${base}/products/${p._id}`} className="font-medium hover:text-accent">
                              {p.name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              <span className="text-xs text-muted">{p.variants.length} size{p.variants.length > 1 ? 's' : ''}</span>
                              {p.isFeatured && <span className="chip bg-accent-soft text-brand">Featured</span>}
                              {p.isDeal && <span className="chip bg-secondary-soft text-warning">Deal</span>}
                              {p.isSubscribable && <span className="chip bg-primary-soft text-brand">Subscribable</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-sm">
                        {p.category?.icon} {p.category?.name}
                      </td>
                      <td className="whitespace-nowrap">{priceRange(p)}</td>
                      <td className={`text-right font-semibold ${stock === 0 ? 'text-error' : ''}`}>{stock}</td>
                      <td>{p.numReviews ? <Rating value={p.rating} count={p.numReviews} /> : <span className="text-xs text-muted">—</span>}</td>
                      <td>
                        <Toggle checked={p.isActive} onChange={() => toggleActive(p)} ariaLabel={`Show ${p.name} on the store`} />
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <Link to={`${base}/products/${p._id}`} className="btn-ghost btn-sm px-2" aria-label="Edit">
                          <Pencil className="size-4" />
                        </Link>
                        <button className="btn-ghost btn-sm px-2 text-error" onClick={() => setToDelete(p)} aria-label="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {items.map((p) => (
              <div key={p._id} className="card flex gap-3 p-3">
                <ProductImage product={p} className="size-16! shrink-0" size="text-2xl" rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Link to={`${base}/products/${p._id}`} className="line-clamp-2 font-medium">
                    {p.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {p.category?.name} · {priceRange(p)} · stock {totalStock(p)}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <Toggle checked={p.isActive} onChange={() => toggleActive(p)} label={p.isActive ? 'Live' : 'Hidden'} />
                    <button className="btn-ghost btn-sm px-2 text-error" onClick={() => setToDelete(p)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Pagination page={filters.page} pages={data?.pages} onChange={(p) => set({ ...filters, page: String(p) })} />

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        busy={deleting}
        title="Delete product?"
        text={`"${toDelete?.name}" and its reviews will be permanently deleted. To just hide it from the store, switch off "Live" instead.`}
      />
      <BulkUpload open={bulk} onClose={() => setBulk(false)} categories={categories} />
    </div>
  )
}
