import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import {
  errorMessage,
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from '../../app/api'
import { usePanelBase } from '../../components/guards'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Toggle } from '../../components/ui'
import { useTheme } from '../../hooks/useTheme'
import { categoryImage, responsiveImage } from '../../lib/images'
import { ConfirmModal } from './_shared'

/** Category photo (or the colour + emoji tile when there's no photo). */
function CategoryThumb({ category, className }) {
  const [theme] = useTheme()
  const image = categoryImage(category, theme)
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl text-3xl ${className}`} style={{ background: category.color }}>
      {image ? <img {...responsiveImage(image, '64px')} alt="" className="size-full object-cover" /> : category.icon}
    </div>
  )
}

const EMPTY = { name: '', icon: '🥛', color: '#EDF0F4', image: '', description: '', sortOrder: 0, isActive: true }

function CategoryModal({ category, onClose }) {
  const [form, setForm] = useState(category?._id ? { ...EMPTY, ...category } : EMPTY)
  const [create, { isLoading: c }] = useCreateCategoryMutation()
  const [update, { isLoading: u }] = useUpdateCategoryMutation()
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (form.name.trim().length < 2) return toast.error('Enter a category name')
    const body = {
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      image: form.image.trim(),
      description: form.description,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    }
    try {
      if (category?._id) await update({ id: category._id, ...body }).unwrap()
      else await create(body).unwrap()
      toast.success('Category saved')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category?._id ? 'Edit category' : 'New category'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={c || u}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <CategoryThumb category={form} className="size-16" />
          <Field label="Name *" className="flex-1">
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Icon (emoji)">
            <input className="input text-center text-lg" value={form.icon} maxLength={4} onChange={(e) => set('icon', e.target.value)} />
          </Field>
          <Field label="Tile colour">
            <input type="color" className="input h-11 p-1" value={form.color} onChange={(e) => set('color', e.target.value)} />
          </Field>
          <Field label="Sort order">
            <input type="number" className="input" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
        </div>
        <Field label="Image URL" hint="Photo shown on the category tiles. Leave empty to use the default photo (or the colour and icon for new categories).">
          <input className="input" value={form.image || ''} onChange={(e) => set('image', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Description">
          <textarea className="input" rows={2} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Show on store" />
      </div>
    </Modal>
  )
}

export default function Categories() {
  const base = usePanelBase()
  const { data = [], isLoading, error, refetch } = useCategoriesQuery({ all: '1' })
  const [update] = useUpdateCategoryMutation()
  const [remove, { isLoading: deleting }] = useDeleteCategoryMutation()
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const doDelete = async () => {
    try {
      await remove(toDelete._id).unwrap()
      toast.success('Category deleted')
      setToDelete(null)
    } catch (e) {
      toast.error(errorMessage(e))
      setToDelete(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle={`${data.length} categories`}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="size-4" /> New category
          </button>
        }
      />
      {!data.length ? (
        <div className="card">
          <EmptyState title="No categories yet" action={<button className="btn-primary" onClick={() => setEditing({})}>Add category</button>} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <div key={c._id} className={`card flex items-center gap-4 p-4 ${c.isActive ? '' : 'opacity-60'}`}>
              <CategoryThumb category={c} className="size-14" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <Link to={`${base}/products?category=${c._id}`} className="text-xs text-muted hover:text-accent">
                  {c.productCount} products · order {c.sortOrder}
                </Link>
                <div className="mt-2">
                  <Toggle
                    checked={c.isActive}
                    onChange={async (v) => {
                      try {
                        await update({ id: c._id, isActive: v }).unwrap()
                        toast.success(`${c.name} is ${v ? 'visible' : 'hidden'} on the store`)
                      } catch (e) {
                        toast.error(errorMessage(e))
                      }
                    }}
                    label={c.isActive ? 'Visible' : 'Hidden'}
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <button className="btn-ghost btn-sm px-2" onClick={() => setEditing(c)} aria-label="Edit">
                  <Pencil className="size-4" />
                </button>
                <button className="btn-ghost btn-sm px-2 text-error" onClick={() => setToDelete(c)} aria-label="Delete">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <CategoryModal category={editing} onClose={() => setEditing(null)} />}
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        busy={deleting}
        title="Delete category?"
        text={`"${toDelete?.name}" will be deleted. Categories that still contain products can't be deleted; move or delete those products first.`}
      />
    </div>
  )
}
