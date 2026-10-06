import type { Era, World } from './types'
import { ERA_DAYS } from './rules'

const DAY = 86_400_000

/** The era a world is working through now (or the last one it reached). */
export function currentEra(w: World): Era {
  if (w.stage === 'sovereign') return 'sovereignty'
  const active = w.charter.objectives.find((o) => !o.custom && (o.status === 'active' || o.status === 'challenged' || o.status === 'failed'))
  return active?.era ?? (w.stage === 'seed' ? 'genesis' : 'growth')
}

export const eraName: Record<Era, string> = { genesis: 'Genesis', growth: 'Growth', sovereignty: 'Sovereignty' }

/** Time left in the Genesis era, for a seed. */
export const genesisLeft = (w: World, now: number) => w.seededAt + ERA_DAYS.genesis * DAY - now

export const isTroubled = (w: World) => w.charter.objectives.some((o) => o.status === 'failed' || o.status === 'challenged')

export const dayOf = (w: World, now: number) => Math.max(1, Math.ceil((now - w.seededAt) / DAY))

export const treasuryTotal = (ws: World[]) => ws.reduce((s, w) => s + w.treasury.balanceUsd, 0)
