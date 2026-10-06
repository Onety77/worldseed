import type { Challenge, Evidence, World } from './types'
import { seeded } from './seeded'
import { runwayMonths } from './rules'
import { change, count, pct, usd } from './format'
import { people, tally, type Person } from '@/data/people'

/*
  The boards. Each one ranks worlds (or the people and agents working for them) by one
  plain measure, and says how it is measured. Numbers come from the same sample data as
  the rest of the site; proofs and challenges also count what happens while you watch.
*/

export type BoardId = 'growth' | 'proofs' | 'runway' | 'revenue' | 'challenged' | 'agents' | 'builders'

export interface Board {
  id: BoardId
  name: string
  short: string
  group: 'Worlds' | 'People'
  how: string
}

export const boards: Board[] = [
  { id: 'growth', name: 'Fastest growth', short: 'Growth', group: 'Worlds', how: 'Holders gained in the last 7 days, as a share of holders a week ago.' },
  { id: 'proofs', name: 'Most proofs', short: 'Proofs', group: 'Worlds', how: 'Evidence bundles the governor published in the last 30 days, live.' },
  { id: 'runway', name: 'Best runway', short: 'Runway', group: 'Worlds', how: 'Months of chain and model costs the infrastructure reserve can pay for.' },
  { id: 'revenue', name: 'Most revenue', short: 'Revenue', group: 'Worlds', how: 'Protocol revenue swept into the World Treasury over 30 days.' },
  { id: 'challenged', name: 'Most challenged', short: 'Challenged', group: 'Worlds', how: 'Challenges bonded against the governor’s evidence in the last 90 days.' },
  { id: 'agents', name: 'Best agents', short: 'Agents', group: 'People', how: 'Paid jobs weighted by how often the work passed its verifier first time.' },
  { id: 'builders', name: 'Top builders', short: 'Builders', group: 'People', how: 'People ranked by escrow released to them for verified work.' },
]

export const boardFor = (id: string | null) => boards.find((b) => b.id === id) ?? boards[0]

export interface WorldRow {
  kind: 'world'
  world: World
  value: number
  text: string
  note: string
}

export interface PersonRow {
  kind: 'person'
  person: Person
  value: number
  text: string
  note: string
  worlds: string[]
}

const DAY = 86_400_000

/** 7-day holder growth: young worlds grow fast, sovereign ones slowly */
function growth(w: World, now: number) {
  const r = seeded(w.id + '-growth')
  const age = (now - w.seededAt) / DAY
  const base = age < 7 ? 0.6 + r() * 1.4 : w.stage === 'seed' ? 0.25 + r() * 0.35 : w.stage === 'realm' ? 0.04 + r() * 0.1 : 0.01 + r() * 0.03
  return Math.max(0.002, base + w.change24h * 0.4)
}

function proofs30d(w: World, ev: Evidence[], now: number) {
  const r = seeded(w.id + '-proofs')
  const days = Math.min(30, (now - w.seededAt) / DAY)
  const rate = w.stage === 'sovereign' ? 16 + r() * 8 : w.stage === 'realm' ? 7 + r() * 7 : 4 + r() * 3
  const live = ev.filter((e) => e.worldId === w.id && e.id.includes('-live-')).length
  return Math.round(days * rate * (0.7 + w.apps.length * 0.08)) + live
}

function challenged90d(w: World, open: Challenge[]) {
  const r = seeded(w.id + '-challenged')
  const base = w.stage === 'seed' ? Math.floor(r() * 2) : Math.floor(2 + r() * (w.stage === 'sovereign' ? 9 : 7))
  const now = open.filter((c) => c.worldId === w.id).length
  const upheld = Math.floor(base * (0.25 + r() * 0.35))
  return { total: base + now, upheld, open: now }
}

export function rank(id: BoardId, worlds: World[], ev: Evidence[], open: Challenge[], now: number): (WorldRow | PersonRow)[] {
  const real = worlds.filter((w) => !w.mine || id === 'growth' || id === 'proofs')
  const rows = (f: (w: World) => Omit<WorldRow, 'kind' | 'world'>) => real.map((w) => ({ kind: 'world' as const, world: w, ...f(w) })).sort((a, b) => b.value - a.value)
  switch (id) {
    case 'growth':
      return rows((w) => {
        const g = growth(w, now)
        return { value: g, text: change(g), note: `${count(Math.round(w.holders * (g / (1 + g))))} new holders` }
      })
    case 'proofs':
      return rows((w) => {
        const n = proofs30d(w, ev, now)
        return { value: n, text: count(n), note: `${(n / Math.max(1, Math.min(30, (now - w.seededAt) / DAY))).toFixed(1)} a day` }
      })
    case 'runway':
      return rows((w) => {
        const m = runwayMonths(w)
        return { value: m, text: `${m.toFixed(1)} mo`, note: `${usd(w.treasury.infraMonthlyUsd)} a month to run` }
      }).filter((r) => r.world.stage !== 'seed')
    case 'revenue':
      return rows((w) => ({ value: w.treasury.revenue30dUsd, text: usd(w.treasury.revenue30dUsd), note: `${(w.treasury.revenue30dUsd / Math.max(1, w.treasury.infraMonthlyUsd)).toFixed(1)}× its costs` })).filter((r) => r.value > 0)
    case 'challenged':
      return rows((w) => {
        const c = challenged90d(w, open)
        return { value: c.total + c.upheld * 0.01, text: String(c.total), note: c.open ? `${c.open} open now · ${c.upheld} upheld` : `${c.upheld} upheld` }
      }).filter((r) => r.value >= 1)
    case 'agents':
      return people
        .filter((p) => p.kind === 'agent')
        .map((p) => {
          const t = tally(p)
          return { kind: 'person' as const, person: p, value: t.paid * t.passRate, text: pct(t.passRate), note: `${t.paid} jobs · ${usd(t.earned)}`, worlds: t.worked }
        })
        .sort((a, b) => b.value - a.value)
    case 'builders':
      return people
        .filter((p) => p.kind === 'person')
        .map((p) => {
          const t = tally(p)
          return { kind: 'person' as const, person: p, value: t.earned, text: usd(t.earned), note: `${t.paid} jobs · ${pct(t.passRate)} passed`, worlds: t.worked }
        })
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12)
  }
}
