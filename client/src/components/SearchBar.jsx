import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSuggestQuery } from '../app/api'
import { useDebounced } from '../hooks/useTheme'
import { loadList, save } from '../lib/storage'
import { formatINR } from '../lib/format'
import ProductImage from './ProductImage'

export default function SearchBar({ className = '' }) {
  const [params] = useSearchParams()
  const [text, setText] = useState(params.get('q') || '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const debounced = useDebounced(text.trim(), 200)
  const { data: suggestions = [] } = useSuggestQuery(debounced, { skip: debounced.length < 2 })
  const navigate = useNavigate()
  const box = useRef(null)
  const recent = loadList('gv_recent_searches')

  useEffect(() => {
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (q) => {
    const term = q.trim()
    if (!term) return
    save('gv_recent_searches', [term, ...recent.filter((r) => r !== term)].slice(0, 6))
    setOpen(false)
    setText(term)
    navigate(`/search?q=${encodeURIComponent(term)}`)
  }

  const list = debounced.length >= 2 ? suggestions : []
  const onKey = (e) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, list.length - 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, -1))
    else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Enter' && active >= 0 && list[active]) {
      e.preventDefault()
      setOpen(false)
      navigate(`/p/${list[active].slug}`)
    }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          go(text)
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted" strokeWidth={1.5} />
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search milk, paneer, ghee…"
          aria-label="Search products"
          className="input pr-11"
        />
      </form>
      {open && (list.length > 0 || (debounced.length < 2 && recent.length > 0)) && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {debounced.length < 2 ? (
            <div className="p-3">
              <p className="mb-2 text-xs font-semibold text-muted uppercase">Recent searches</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} className="chip bg-surface-2 py-1 hover:bg-primary-soft" onClick={() => go(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul>
              {list.map((p, i) => (
                <li key={p._id}>
                  <button
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2 ${i === active ? 'bg-surface-2' : ''}`}
                    onClick={() => {
                      setOpen(false)
                      navigate(`/p/${p.slug}`)
                    }}
                  >
                    <ProductImage product={p} className="size-10! shrink-0" rounded="rounded-lg" size="text-xl" />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted">from {formatINR(p.price)}</span>
                  </button>
                </li>
              ))}
              <li>
                <button className="w-full border-t border-line px-3 py-2.5 text-left text-sm text-brand hover:bg-surface-2" onClick={() => go(text)}>
                  See all results for “{text.trim()}”
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
