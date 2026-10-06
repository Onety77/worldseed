import { createStore } from './store'
import { loadedAt } from '@/data/worlds'

/*
  Notifications: what happened that you might care about. Your own actions land here, and
  the sample network adds a few of its own over time. Nothing is sent anywhere.
*/

export interface Note {
  id: string
  at: number
  kind: 'wallet' | 'trade' | 'job' | 'vote' | 'challenge' | 'proof' | 'milestone' | 'chain' | 'planted'
  title: string
  body: string
  worldId?: string
  href?: string
  read: boolean
}

const M = 60_000
export const inbox = createStore<Note[]>([
  { id: 'n3', at: loadedAt - 4 * M, kind: 'milestone', title: 'Ledgerwood passed a Growth check', body: '30-day liquidity held above the charter line for the fourth week running.', worldId: 'ledgerwood', href: '/w/ledgerwood', read: false },
  { id: 'n2', at: loadedAt - 26 * M, kind: 'vote', title: 'Cinder Guild is electing a new governor', body: 'Voting closes in under two days. Holders choose between two recovery profiles.', worldId: 'cinder-guild', href: '/w/cinder-guild#governance', read: false },
  { id: 'n1', at: loadedAt - 3 * 60 * M, kind: 'chain', title: 'Harrow’s sovereignty vote passed', body: 'A 72-hour timelock is running. When it clears, Harrow launches its own chain.', worldId: 'harrow', href: '/sovereignty', read: true },
])

export function notify(n: Omit<Note, 'id' | 'at' | 'read'>) {
  inbox.set((l) => [{ ...n, id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), read: false }, ...l].slice(0, 60))
}

export const markAllRead = () => inbox.set((l) => l.map((n) => ({ ...n, read: true })))
export const markRead = (id: string) => inbox.set((l) => l.map((n) => (n.id === id ? { ...n, read: true } : n)))
