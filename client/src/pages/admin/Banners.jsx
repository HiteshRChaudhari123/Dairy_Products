import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  errorMessage,
  useAdminBannersQuery,
  useCreateBannerMutation,
  useDeleteBannerMutation,
  useUpdateBannerMutation,
} from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Toggle } from '../../components/ui'
import { BANNER_POSITION, responsiveImage } from '../../lib/images'
import { ConfirmModal } from './_shared'

const EMPTY = { eyebrow: '', title: '', subtitle: '', cta: 'Shop Now', link: '/', image: '', imageDark: '', imagePosition: 'center', highlights: [], isActive: true }

/** Mirrors the home page hero: theme-coloured panel, untinted photo on the right half with a thin edge blend. */
export function BannerPreview({ banner }) {
  return (
    <div className="relative flex min-h-44 flex-col overflow-hidden rounded-2xl border border-line bg-hero sm:flex-row sm:items-center sm:p-8">
      {banner.image ? (
        <div className="relative h-36 sm:absolute sm:inset-y-0 sm:right-0 sm:h-auto sm:w-1/2">
          <img
            {...responsiveImage(banner.image, '(min-width: 640px) 450px, 100vw')}
            alt=""
            className={`absolute inset-0 size-full object-cover ${BANNER_POSITION[banner.imagePosition] || BANNER_POSITION.center}`}
          />
          <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,var(--color-hero)_0%,transparent_12%)] sm:block" />
        </div>
      ) : (
        <span className="pointer-events-none absolute -right-6 -bottom-8 text-[120px] opacity-15 select-none">🥛</span>
      )}
      <div className="relative max-w-sm p-6 sm:max-w-[48%] sm:p-0">
        {banner.eyebrow && <p className="eyebrow text-[10px]">{banner.eyebrow}</p>}
        <h3 className="mt-1 font-heading text-xl leading-tight font-medium text-ink sm:text-2xl">{banner.title || 'Banner title'}</h3>
        {banner.subtitle && <p className="mt-2 text-sm text-muted">{banner.subtitle}</p>}
        <span className="btn-primary btn-sm mt-4">{banner.cta || 'Shop now'}</span>
      </div>
    </div>
  )
}

function BannerModal({ banner, count, onClose }) {
  const [form, setForm] = useState(banner?._id ? { ...EMPTY, ...banner } : EMPTY)
  const [create, { isLoading: c }] = useCreateBannerMutation()
  const [update, { isLoading: u }] = useUpdateBannerMutation()
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    if (form.title.trim().length < 2) return toast.error('Enter a title')
    const body = {
      eyebrow: (form.eyebrow || '').trim(),
      title: form.title.trim(),
      subtitle: form.subtitle,
      cta: form.cta,
      link: form.link || '/',
      image: form.image,
      imageDark: form.imageDark,
      imagePosition: form.imagePosition || 'center',
      highlights: (form.highlights || []).map((h) => h.trim()).filter(Boolean).slice(0, 3),
      isActive: form.isActive,
      ...(banner?._id ? {} : { sortOrder: count }),
    }
    try {
      if (banner?._id) await update({ id: banner._id, ...body }).unwrap()
      else await create(body).unwrap()
      toast.success('Banner saved')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={banner?._id ? 'Edit banner' : 'New banner'}
      size="max-w-2xl"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={c || u}>Save banner</button>
        </>
      }
    >
      <div className="space-y-4">
        <BannerPreview banner={form} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label above title" hint="Short, e.g. Premium dairy products · Welcome offer" className="sm:col-span-2">
            <input className="input" maxLength={40} value={form.eyebrow || ''} onChange={(e) => set('eyebrow', e.target.value)} />
          </Field>
          <Field label="Title *" className="sm:col-span-2">
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Subtitle" className="sm:col-span-2">
            <input className="input" value={form.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} />
          </Field>
          <Field label="Button text">
            <input className="input" value={form.cta} onChange={(e) => set('cta', e.target.value)} />
          </Field>
          <Field label="Link" hint="e.g. /c/ghee, /deals, /subscriptions/new">
            <input className="input" value={form.link} onChange={(e) => set('link', e.target.value)} />
          </Field>
          <Field label="Image URL" hint="Photo on a light or sky-blue background, subject on the right; it is tinted to match the theme and fades in from the left.">
            <input className="input" value={form.image || ''} onChange={(e) => set('image', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Image URL (dark mode, optional)" hint="Leave empty to reuse the main photo (it is softened automatically).">
            <input className="input" value={form.imageDark || ''} onChange={(e) => set('imageDark', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Photo position" hint="Which part of the photo stays visible when it's cropped. Use Right when the product sits on the right of the photo.">
            <select className="input" value={form.imagePosition || 'center'} onChange={(e) => set('imagePosition', e.target.value)}>
              <option value="center">Center (default)</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </Field>
          <Field
            label="Highlight badges (optional)"
            hint="Up to 3 short product facts, one per line. They float in the middle of the banner on wide screens."
            className="sm:col-span-2"
          >
            <textarea
              className="input"
              rows={3}
              value={(form.highlights || []).join('\n')}
              onChange={(e) => set('highlights', e.target.value.split('\n').slice(0, 3))}
              placeholder={'A2 Gir cow milk\nHand-churned bilona\nLab tested for purity'}
            />
          </Field>
        </div>
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Show on home page" />
      </div>
    </Modal>
  )
}

export default function Banners() {
  const { data = [], isLoading, error, refetch } = useAdminBannersQuery()
  const [update] = useUpdateBannerMutation()
  const [remove, { isLoading: deleting }] = useDeleteBannerMutation()
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const move = async (i, dir) => {
    const a = data[i]
    const b = data[i + dir]
    if (!b) return
    try {
      // Normalise order to the list index, then swap the two.
      await Promise.all([update({ id: a._id, sortOrder: i + dir }).unwrap(), update({ id: b._id, sortOrder: i }).unwrap()])
      toast.success('Banner order updated')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader
        title="Banners"
        subtitle="Hero carousel on the home page, shown in this order"
        actions={
          <button className="btn-primary btn-sm" onClick={() => setEditing({})}>
            <Plus className="size-4" /> New banner
          </button>
        }
      />
      {!data.length ? (
        <div className="card">
          <EmptyState icon="🖼️" title="No banners" action={<button className="btn-primary" onClick={() => setEditing({})}>Create banner</button>} />
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((b, i) => (
            <div key={b._id} className={`card p-3 sm:p-4 ${b.isActive ? '' : 'opacity-60'}`}>
              <BannerPreview banner={b} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={b.isActive}
                    label={b.isActive ? 'Showing' : 'Hidden'}
                    onChange={(v) =>
                      update({ id: b._id, isActive: v })
                        .unwrap()
                        .then(() => toast.success(v ? 'Banner is showing on the home page' : 'Banner hidden from the home page'))
                        .catch((e) => toast.error(errorMessage(e)))
                    }
                  />
                  <span className="text-xs text-muted">→ {b.link}</span>
                </div>
                <div className="flex">
                  <button className="btn-ghost btn-sm px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="size-4" />
                  </button>
                  <button className="btn-ghost btn-sm px-2" disabled={i === data.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="size-4" />
                  </button>
                  <button className="btn-ghost btn-sm px-2" onClick={() => setEditing(b)} aria-label="Edit">
                    <Pencil className="size-4" />
                  </button>
                  <button className="btn-ghost btn-sm px-2 text-error" onClick={() => setToDelete(b)} aria-label="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <BannerModal banner={editing} count={data.length} onClose={() => setEditing(null)} />}
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        busy={deleting}
        title="Delete banner?"
        text={`"${toDelete?.title}" will be removed from the home page.`}
        onConfirm={async () => {
          try {
            await remove(toDelete._id).unwrap()
            toast.success('Banner deleted')
            setToDelete(null)
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </div>
  )
}
