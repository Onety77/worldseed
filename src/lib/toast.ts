import { createStore } from './store'

/*
  Small confirmations: a link copied, a vote cast, a job claimed. One at a time on screen,
  newest wins, each gone after a few seconds. The inbox keeps anything worth keeping.
*/

export interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'bad'
  /** optional place to go, shown as a link */
  href?: string
  action?: string
}

export const toasts = createStore<Toast[]>([])
let n = 0

export function toast(t: Omit<Toast, 'id'>) {
  const id = ++n
  toasts.set((l) => [...l.slice(-2), { ...t, id }])
  window.setTimeout(() => dismiss(id), t.href ? 5200 : 3200)
}

export const dismiss = (id: number) => toasts.set((l) => l.filter((x) => x.id !== id))
