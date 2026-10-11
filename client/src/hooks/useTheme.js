import { useEffect, useState, useSyncExternalStore } from 'react'

// Theme lives on <html data-theme="light|dark">. The OS setting is used until the user picks one,
// then the choice is saved in localStorage. Every useTheme() stays in sync.
const KEY = 'gv_theme'
const listeners = new Set()

function read() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let current = read()

export function applyTheme(theme = current, persist = false) {
  current = theme
  document.documentElement.setAttribute('data-theme', theme)
  if (persist) {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current)
  return [theme, () => applyTheme(theme === 'dark' ? 'light' : 'dark', true)]
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
