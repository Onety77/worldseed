import { useSyncExternalStore } from 'react'

/** A tiny shared store: one value, many readers, updated from anywhere. */
export function createStore<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()
  const subscribe = (cb: () => void) => {
    subs.add(cb)
    return () => {
      subs.delete(cb)
    }
  }
  return {
    get: () => value,
    set: (next: T | ((v: T) => T)) => {
      value = typeof next === 'function' ? (next as (v: T) => T)(value) : next
      subs.forEach((f) => f())
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  }
}
