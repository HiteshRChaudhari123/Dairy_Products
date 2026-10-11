import { ExternalLink, FileText, Save } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { errorMessage, useCmsPagesQuery, useSavePageMutation } from '../../app/api'
import { ErrorState, Field, PageHeader, PageLoader } from '../../components/ui'
import { formatDateTime } from '../../lib/format'

const DEFAULT_PAGES = [
  ['about', 'About Gavyora'],
  ['terms', 'Terms & Conditions'],
  ['privacy', 'Privacy Policy'],
  ['refund-policy', 'Refund & Cancellation Policy'],
  ['shipping-policy', 'Shipping & Delivery Policy'],
]

function Editor({ page, onDirty }) {
  const [save, { isLoading: saving }] = useSavePageMutation()
  const [draft, setDraft] = useState({ title: page.title, content: page.content })
  const dirty = draft.title !== page.title || draft.content !== page.content
  const update = (patch) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onDirty(next.title !== page.title || next.content !== page.content)
  }

  const submit = async () => {
    try {
      await save({ slug: page.slug, ...draft }).unwrap()
      onDirty(false)
      toast.success('Page published')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{page.updatedAt ? `Last updated ${formatDateTime(page.updatedAt)}` : 'Not published yet'}</p>
        <div className="flex gap-2">
          <Link to={`/${page.slug}`} target="_blank" className="btn-outline btn-sm">
            <ExternalLink className="size-4" /> View live
          </Link>
          <button className="btn-primary btn-sm" disabled={!dirty || saving || draft.title.length < 2} onClick={submit}>
            <Save className="size-4" /> Publish
          </button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <Field label="Title">
            <input className="input" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Content" hint="Plain text. Leave a blank line to start a new paragraph.">
            <textarea className="input min-h-[26rem] font-mono text-[13px] leading-6" value={draft.content} onChange={(e) => update({ content: e.target.value })} />
          </Field>
        </div>
        <div>
          <p className="label">Preview</p>
          <article className="card min-h-[26rem] p-6">
            <h1 className="mb-4 text-2xl font-bold">{draft.title || 'Untitled'}</h1>
            {draft.content
              .split(/\n\s*\n/)
              .filter((p) => p.trim())
              .map((p, i) => (
                <p key={i} className="mb-4 leading-7 whitespace-pre-line text-ink/90">{p.trim()}</p>
              ))}
          </article>
        </div>
      </div>
    </div>
  )
}

export default function CmsPages() {
  const { data: pages, isLoading, error, refetch } = useCmsPagesQuery()
  const [slug, setSlug] = useState('about')
  const [dirty, setDirty] = useState(false)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const all = DEFAULT_PAGES.map(([s, t]) => pages?.find((p) => p.slug === s) || { slug: s, title: t, content: '' })
  const current = all.find((p) => p.slug === slug)

  return (
    <div>
      <PageHeader title="CMS pages" subtitle="Legal and information pages shown in the website footer." />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav className="scrollbar-none flex gap-2 overflow-x-auto lg:flex-col">
          {all.map((p) => (
            <button
              key={p.slug}
              onClick={() => {
                if (dirty && !window.confirm('Discard unsaved changes?')) return
                setDirty(false)
                setSlug(p.slug)
              }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm whitespace-nowrap transition ${
                p.slug === slug ? 'bg-primary text-on-primary' : 'bg-surface-2 hover:bg-primary-soft'
              }`}
            >
              <FileText className="size-4 shrink-0" /> {p.title}
            </button>
          ))}
        </nav>
        <Editor key={`${current.slug}:${current.updatedAt || ''}`} page={current} onDirty={setDirty} />
      </div>
    </div>
  )
}
