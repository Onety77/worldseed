import type { World } from '@/lib/types'
import { readiness } from '@/lib/rules'
import type { Hill } from './height'

/**
 * How a world stands on the Field. Footprint follows the people it keeps; height follows
 * how far it has come; one terrace per era reached; a sovereign world is ringed by water.
 */
export function hillFor(w: World): Hill {
  const ready = readiness(w)
  const failed = w.charter.objectives.some((o) => o.status === 'failed')
  if (w.stage === 'seed') {
    const age = Math.min(1, (Date.now() - w.seededAt) / (7 * 86_400_000))
    return { x: w.x, z: w.z, radius: 3.4 + Math.min(1.8, w.holders / 400), height: 0.9 + age * 1.3, tiers: 1, moat: 0 }
  }
  if (w.stage === 'realm') {
    const third = w.charter.objectives.some((o) => o.era === 'sovereignty' && o.status === 'active')
    return { x: w.x, z: w.z, radius: 6 + 2.8 * Math.min(1, w.retained30d / 3500), height: (2.6 + 4.6 * ready) * (failed ? 0.7 : 1), tiers: third ? 3 : 2, moat: 0 }
  }
  return { x: w.x, z: w.z, radius: 9 + Math.min(2.4, w.retained30d / 6000), height: 8.4 + Math.min(1.6, w.retained30d / 9000), tiers: 3, moat: 1 }
}
