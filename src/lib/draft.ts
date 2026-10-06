import type { Era, Objective, Profile, Template, World } from './types'
import { createStore } from './store'
import { compile, charterHash, type Compiled } from './compiler'
import { preset, profiles } from './templates'
import { ERA_DAYS, SPLIT } from './rules'

/*
  The world being seeded in the composer. Kept outside the page so leaving to look at
  another world and coming back loses nothing. Planting turns it into a real World.
*/

export const POLICIES = {
  builder: { name: 'Builder', note: 'The default: most fees go to shipping.', shares: SPLIT.map((s) => s.share) },
  ecosystem: { name: 'Ecosystem', note: 'More for independent teams through grants.', shares: [0.35, 0.25, 0.25, 0.1, 0.05] },
  lean: { name: 'Lean', note: 'A bigger reserve, fewer grants. Reaches the runway bar sooner.', shares: [0.4, 0.4, 0.05, 0.1, 0.05] },
} as const
export type Policy = keyof typeof POLICIES

export const DEFAULT_PROHIBITED = ['Remove or move pool liquidity', 'Deploy unaudited contracts without a timelocked vote', 'Change this charter without holder approval', 'Spend beyond the category caps']

export interface Draft {
  name: string
  ticker: string
  lore: string
  template: Template | null
  mission: string
  custom: string
  compiled: Compiled | null
  prohibited: string[]
  profile: Profile
  policy: Policy
  genesisBudget: number | null
  plot: number
}

export const blank: Draft = {
  name: '',
  ticker: '',
  lore: '',
  template: null,
  mission: '',
  custom: '',
  compiled: null,
  prohibited: DEFAULT_PROHIBITED,
  profile: 'balanced',
  policy: 'builder',
  genesisBudget: null,
  plot: 0,
}

export const draft = createStore<Draft>(blank)

export const tickerFrom = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((w, i, a) => (a.length === 1 ? w.slice(0, 4) : w.slice(0, i === 0 ? 2 : 2)))
    .join('')
    .slice(0, 5)

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'world'

/** Everything that goes into the charter hash. */
function charterDoc(d: Draft) {
  const p = d.template ? preset(d.template) : null
  return {
    name: d.name,
    ticker: d.ticker,
    template: d.template,
    mission: d.mission,
    objectives: p ? (['genesis', 'growth', 'sovereignty'] as Era[]).map((e) => p.objectives[e].title) : [],
    custom: d.compiled?.deliverable ?? null,
    prohibited: d.prohibited,
    profile: d.profile,
    split: POLICIES[d.policy].shares,
  }
}

export const draftHash = (d: Draft) => charterHash(charterDoc(d))

function objectivesFor(d: Draft, id: string, born: number): Objective[] {
  if (!d.template) return []
  const p = preset(d.template)
  const end = { genesis: ERA_DAYS.genesis, growth: ERA_DAYS.genesis + ERA_DAYS.growth, sovereignty: ERA_DAYS.genesis + ERA_DAYS.growth + ERA_DAYS.sovereignty }
  const list: Objective[] = (['genesis', 'growth', 'sovereignty'] as Era[]).map((e) => ({
    id: `${id}-${e}`,
    era: e,
    title: p.objectives[e].title,
    verify: p.objectives[e].verify,
    deadline: born + end[e] * 86_400_000,
    budgetUsd: e === 'genesis' && d.genesisBudget ? d.genesisBudget : p.objectives[e].budgetUsd,
    status: e === 'genesis' ? 'active' : 'locked',
  }))
  if (d.compiled)
    list.push({
      id: `${id}-custom`,
      era: 'genesis',
      title: d.compiled.deliverable,
      verify: d.compiled.verification.join('; '),
      deadline: born + d.compiled.deadlineDays * 86_400_000,
      budgetUsd: d.compiled.budgetUsd,
      status: 'active',
      custom: true,
    })
  return list
}

/** Turn the draft into a living seed on the Field. */
export function toWorld(d: Draft, at: { x: number; z: number }, taken: string[]): World {
  let id = slug(d.name)
  while (taken.includes(id)) id += '-2'
  const now = Date.now()
  const prof = profiles.find((p) => p.id === d.profile)!
  const hash = draftHash(d)
  return {
    id,
    name: d.name,
    ticker: d.ticker,
    template: d.template ?? 'frontier',
    stage: 'seed',
    lore: d.lore || preset(d.template ?? 'frontier').pitch,
    seededAt: now,
    creator: 'you',
    x: at.x,
    z: at.z,
    retained30d: 0,
    uptime90d: 99,
    security: 'none',
    holders: 1,
    priceUsd: 0.0001,
    change24h: 0,
    treasury: { balanceUsd: 1200, infraMonthlyUsd: 7000, revenue30dUsd: 0, modelCapDailyUsd: prof.capUsd, modelSpentTodayUsd: 0 },
    governor: { profile: d.profile, roles: Object.entries(prof.roles).map(([role, model]) => ({ role: role as World['governor']['roles'][number]['role'], model })), fallback: 'Relay Mini', since: now },
    charter: {
      mission: d.mission,
      prohibited: [...d.prohibited, ...(d.compiled?.prohibited ?? [])],
      objectives: objectivesFor(d, id, now),
      versions: [{ version: 1, hash, at: now, summary: 'Genesis charter compiled and accepted at launch.' }],
    },
    apps: [],
    mine: true,
  }
}

export { compile }
