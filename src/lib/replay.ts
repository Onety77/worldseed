import type { World } from './types'
import { ERA_DAYS } from './rules'
import { hillFor } from '@/field/fromWorld'

/*
  A world's life as a time-lapse: where its hill stood on any day since it was seeded, and
  the moments worth stopping on. Seeds start as a stake in flat ground; eras passed add
  terraces; apps add buildings; a chain rings the hill with water.
*/

const DAY = 86_400_000

interface Milestone {
  day: number
  title: string
  kind: 'seed' | 'era' | 'app' | 'chain' | 'now'
}

export function lifeOf(w: World, now: number) {
  const age = Math.max(0.5, (now - w.seededAt) / DAY)
  const final = hillFor(w)
  const chainDay = w.chain ? Math.max(0, (w.chain.launchedAt - w.seededAt) / DAY) : null
  const genesis = ERA_DAYS.genesis
  const growth = ERA_DAYS.genesis + ERA_DAYS.growth
  const apps = w.apps.map((a) => ({ name: a.name, day: Math.max(0.2, (a.deployedAt - w.seededAt) / DAY) })).filter((a) => a.day <= age).sort((a, b) => a.day - b.day)

  const milestones: Milestone[] = [{ day: 0, title: `${w.name} seeded`, kind: 'seed' }]
  if (w.stage !== 'seed' && age > genesis) milestones.push({ day: genesis, title: 'Genesis passed, first terrace', kind: 'era' })
  if (w.stage !== 'seed' && final.tiers >= 3 && age > growth) milestones.push({ day: growth, title: 'Growth passed, second terrace', kind: 'era' })
  apps.forEach((a, i) => milestones.push({ day: a.day, title: i === 0 ? `First app: ${a.name.replace(`${w.name} `, '')}` : `Deployed ${a.name.replace(`${w.name} `, '')}`, kind: 'app' }))
  if (chainDay !== null && chainDay <= age) milestones.push({ day: chainDay, title: `Own chain live: ${w.chain!.chainId}`, kind: 'chain' })
  milestones.push({ day: age, title: 'Today', kind: 'now' })
  milestones.sort((a, b) => a.day - b.day)

  const smooth = (x: number) => x * x * (3 - 2 * x)
  const riseAt = (d: number) => (d < genesis ? 0.45 * smooth(d / genesis) : d < growth ? 0.45 + 0.35 * smooth((d - genesis) / ERA_DAYS.growth) : 0.8 + 0.2 * smooth(Math.min(1, (d - growth) / Math.max(1, age - growth))))
  /** the hill and its buildings on a given day */
  const at = (day: number) => {
    const d = Math.max(0, Math.min(age, day))
    const k = smooth(Math.min(1, d / age))
    // height comes with the eras: most of it by the end of Growth, the rest with readiness
    const rise = w.stage === 'seed' ? k : riseAt(d) / riseAt(age)
    const tiers = 1 + (w.stage !== 'seed' && d >= genesis ? 1 : 0) + (w.stage !== 'seed' && final.tiers >= 3 && d >= growth ? 1 : 0)
    const built = apps.filter((a) => a.day <= d).length
    return {
      id: w.id,
      // a stake in nearly flat ground, rising with the world
      height: 0.35 + (final.height - 0.35) * Math.min(1, rise),
      radius: final.radius * (0.42 + 0.58 * Math.min(1, rise * 1.1)),
      tiers: Math.min(tiers, final.tiers),
      moat: chainDay !== null && d >= chainDay ? 1 : 0,
      build: w.stage === 'seed' ? smooth(Math.min(1, d / age)) : apps.length ? Math.min(1, built / apps.length) : k,
    }
  }

  const eraOf = (day: number) => (chainDay !== null && day >= chainDay ? 'Sovereign' : day < genesis ? 'Genesis' : day < growth ? 'Growth' : 'Sovereignty race')
  return { age, milestones, at, eraOf }
}
