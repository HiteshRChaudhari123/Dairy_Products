import { ArrowLeft, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  errorMessage,
  useAdminProductQuery,
  useCategoriesQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
} from '../../app/api'
import { usePanelBase } from '../../components/guards'
import ProductImage from '../../components/ProductImage'
import { ErrorState, Field, PageHeader, PageLoader, Toggle } from '../../components/ui'
import { discountPct } from '../../lib/format'

const EMPTY = {
  name: '',
  category: '',
  brand: 'Gavyora',
  description: '',
  highlights: '',
  tags: '',
  images: [],
  variants: [{ label: '', price: '', mrp: '', stock: '', sku: '' }],
  fatPercent: '',
  shelfLifeDays: '',
  lowStockThreshold: 10,
  isActive: true,
  isFeatured: false,
  isDeal: false,
  isSubscribable: false,
  isOrganic: false,
  isA2: false,
  isVeg: true,
}

const FLAGS = [
  ['isActive', 'Live on store'],
  ['isFeatured', 'Featured on home'],
  ['isDeal', 'Deal of the day'],
  ['isSubscribable', 'Available for subscription'],
  ['isOrganic', 'Organic'],
  ['isA2', 'A2 milk product'],
  ['isVeg', 'Vegetarian'],
]

function fromProduct(p) {
  return {
    ...EMPTY,
    ...p,
    category: p.category?._id || p.category || '',
    highlights: (p.highlights || []).join('\n'),
    tags: (p.tags || []).join(', '),
    images: p.images || [],
    variants: p.variants.map((v) => ({ _id: v._id, label: v.label, price: v.price, mrp: v.mrp, stock: v.stock, sku: v.sku || '' })),
    fatPercent: p.fatPercent ?? '',
    shelfLifeDays: p.shelfLifeDays ?? '',
    lowStockThreshold: p.lowStockThreshold ?? 10,
  }
}

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v))

export default function ProductForm() {
  const { id } = useParams()
  const editing = !!id
  const base = usePanelBase()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useAdminProductQuery(id, { skip: !editing })
  const { data: categories = [] } = useCategoriesQuery({ all: '1' })
  const [create, { isLoading: creating }] = useCreateProductMutation()
  const [update, { isLoading: updating }] = useUpdateProductMutation()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    // Also resets when moving from "edit" to "add product" (same component instance).
    setForm(editing && data?.product ? fromProduct(data.product) : EMPTY)
    setErrors({})
  }, [data, editing])

  if (editing && isLoading) return <PageLoader />
  if (editing && error) return <ErrorState error={error} onRetry={refetch} />

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setVariant = (i, k, v) => setForm((f) => ({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  const validate = () => {
    const e = {}
    if (form.name.trim().length < 2) e.name = 'Enter a product name'
    if (!form.category) e.category = 'Choose a category'
    form.variants.forEach((v, i) => {
      if (!v.label.trim()) e[`v${i}`] = 'Size label is required'
      else if (v.price === '' || v.mrp === '') e[`v${i}`] = 'Price and MRP are required'
      else if (Number(v.price) > Number(v.mrp)) e[`v${i}`] = 'Price cannot be more than MRP'
    })
    setErrors(e)
    return !Object.keys(e).length
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return toast.error('Please fix the highlighted fields')
    const body = {
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim() || undefined,
      description: form.description,
      highlights: form.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      images: form.images,
      variants: form.variants.map((v) => ({
        ...(v._id ? { _id: v._id } : {}),
        label: v.label.trim(),
        price: Number(v.price),
        mrp: Number(v.mrp),
        stock: parseInt(v.stock) || 0,
        sku: v.sku || undefined,
      })),
      fatPercent: num(form.fatPercent),
      shelfLifeDays: num(form.shelfLifeDays),
      lowStockThreshold: num(form.lowStockThreshold),
      ...Object.fromEntries(FLAGS.map(([k]) => [k, form[k]])),
    }
    try {
      if (editing) await update({ id, ...body }).unwrap()
      else await create(body).unwrap()
      toast.success(editing ? 'Product updated' : 'Product created')
      navigate(`${base}/products`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const addImage = () => {
    const url = imageUrl.trim()
    if (!/^https?:\/\//.test(url)) return toast.error('Enter an image URL starting with https://')
    set('images', [...form.images, url])
    setImageUrl('')
  }

  const cat = categories.find((c) => c._id === form.category)

  return (
    <form onSubmit={submit} noValidate>
      <Link to={`${base}/products`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All products
      </Link>
      <PageHeader
        title={editing ? 'Edit product' : 'Add product'}
        subtitle={editing ? form.name : 'Add a new item to your catalogue'}
        actions={
          <>
            <Link to={`${base}/products`} className="btn-outline btn-sm">
              Cancel
            </Link>
            <button className="btn-primary btn-sm" disabled={creating || updating}>
              {creating || updating ? 'Saving…' : 'Save product'}
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="font-semibold">Basic details</h2>
            <Field label="Product name *" error={errors.name}>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Farm Fresh Toned Milk" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category *" error={errors.category}>
                <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  <option value="">Choose category</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brand">
                <input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="input" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Highlights" hint="One per line">
                <textarea className="input" rows={4} value={form.highlights} onChange={(e) => set('highlights', e.target.value)} placeholder={'Farm fresh\nNo preservatives'} />
              </Field>
              <Field label="Search tags" hint="Comma separated, e.g. milk, dahi, a2">
                <textarea className="input" rows={4} value={form.tags} onChange={(e) => set('tags', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="card space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Sizes & pricing</h2>
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={() => set('variants', [...form.variants, { label: '', price: '', mrp: '', stock: '', sku: '' }])}
              >
                <Plus className="size-4" /> Add size
              </button>
            </div>
            {form.variants.map((v, i) => (
              <div key={v._id || i} className="rounded-xl border border-line p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  <Field label="Size" className="col-span-2 sm:col-span-1">
                    <input className="input" value={v.label} onChange={(e) => setVariant(i, 'label', e.target.value)} placeholder="1 L" />
                  </Field>
                  <Field label="Price ₹">
                    <input className="input" type="number" min="0" value={v.price} onChange={(e) => setVariant(i, 'price', e.target.value)} />
                  </Field>
                  <Field label="MRP ₹">
                    <input className="input" type="number" min="0" value={v.mrp} onChange={(e) => setVariant(i, 'mrp', e.target.value)} />
                  </Field>
                  <Field label="Stock">
                    <input className="input" type="number" min="0" value={v.stock} onChange={(e) => setVariant(i, 'stock', e.target.value)} />
                  </Field>
                  <Field label="SKU">
                    <input className="input" value={v.sku} onChange={(e) => setVariant(i, 'sku', e.target.value)} />
                  </Field>
                  <div className="flex items-end justify-between gap-2 sm:justify-end">
                    {discountPct(Number(v.price), Number(v.mrp)) > 0 && (
                      <span className="chip mb-2.5 bg-secondary-soft text-warning">{discountPct(Number(v.price), Number(v.mrp))}% off</span>
                    )}
                    <button
                      type="button"
                      className="btn-ghost btn-sm mb-1 px-2 text-error"
                      disabled={form.variants.length === 1}
                      onClick={() => set('variants', form.variants.filter((_, j) => j !== i))}
                      aria-label="Remove size"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {errors[`v${i}`] && <p className="mt-2 text-xs text-error">{errors[`v${i}`]}</p>}
              </div>
            ))}
          </section>

          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="font-semibold">Images</h2>
            <p className="text-xs text-muted">
              Paste https:// image URLs or site paths like /products/paneer.jpg. The first image is the main photo. Without an image, the store shows the category icon.
            </p>
            <div className="flex gap-2">
              <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/paneer.jpg" />
              <button type="button" className="btn-outline" onClick={addImage}>
                <ImagePlus className="size-4" /> Add
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {form.images.map((src, i) => (
                <div key={src + i} className="relative">
                  <ProductImage src={src} name={form.name} />
                  {i === 0 && <span className="chip absolute bottom-1 left-1 bg-primary text-on-primary">Main</span>}
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded-full bg-surface p-1 shadow"
                    onClick={() => set('images', form.images.filter((_, j) => j !== i))}
                    aria-label="Remove image"
                  >
                    <Trash2 className="size-3.5 text-error" />
                  </button>
                </div>
              ))}
              {!form.images.length && <ProductImage name={form.name || 'Preview'} icon={cat?.icon} />}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card space-y-3 p-4 sm:p-5">
            <h2 className="font-semibold">Visibility</h2>
            {FLAGS.map(([k, label]) => (
              <div key={k}>
                <Toggle checked={!!form[k]} onChange={(v) => set(k, v)} label={label} />
              </div>
            ))}
          </section>
          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="font-semibold">Dairy details</h2>
            <Field label="Fat %">
              <input className="input" type="number" step="0.1" min="0" value={form.fatPercent} onChange={(e) => set('fatPercent', e.target.value)} />
            </Field>
            <Field label="Shelf life (days)">
              <input className="input" type="number" min="0" value={form.shelfLifeDays} onChange={(e) => set('shelfLifeDays', e.target.value)} />
            </Field>
            <Field label="Low-stock alert at" hint="Warn when any size falls to this quantity">
              <input className="input" type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} />
            </Field>
          </section>
          <button className="btn-primary w-full" disabled={creating || updating}>
            {creating || updating ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </div>
    </form>
  )
}
