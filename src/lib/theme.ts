import { useSyncExternalStore } from 'react'

/*
  Day or night. The choice is remembered on this device; a host page that sets
  data-theme on the root decides it before we do. Everything reads the same tokens, and
  the Field crossfades its own palette to match.
*/

export type Theme = 'light' | 'dark'
const KEY = 'worldseed:theme'
const subs = new Set<() => void>()

function read(): Theme {
  const host = document.documentElement.getAttribute('data-theme')
  if (host === 'dark' || host === 'light') return host
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    // storage can be blocked; fall through to day
  }
  return 'light'
}

let theme: Theme = typeof document === 'undefined' ? 'light' : read()

function apply() {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1519' : '#eceee8')
}

export function initTheme() {
  theme = read()
  apply()
  // follow the host if it changes the attribute itself
  new MutationObserver(() => {
    const v = document.documentElement.getAttribute('data-theme')
    if ((v === 'dark' || v === 'light') && v !== theme) {
      theme = v
      subs.forEach((f) => f())
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

function setTheme(t: Theme) {
  theme = t
  apply()
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // not remembered; still applied
  }
  subs.forEach((f) => f())
}

export const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

export const useTheme = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => theme,
  )
