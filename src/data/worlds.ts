import type { App, Charter, Era, Objective, Profile, Stage, Template, World } from '@/lib/types'
import { ERA_DAYS } from '@/lib/rules'
import { preset, profiles } from '@/lib/templates'
import { seeded } from '@/lib/seeded'

/*
  Fictional sample worlds, so the interface has something to show. Times are relative to
  page load. HARROW is a realm a few minutes from meeting every sovereignty criterion; it
  graduates while you watch (see lib/sim).
*/

export const loadedAt = Date.now()
const DAY = 86_400_000
const H = 3_600_000

export const hex = (r: () => number, n = 40) => '0x' + Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('')

interface Seed {
  id: string
  name: string
  ticker: string
  template: Template
  stage: Stage
  lore: string
  mission: string
  creator: string
  x: number
  z: number
  ageDays: number
  profile: Profile
  retained30d: number
  uptime90d: number
  security: World['security']
  holders: number
  priceUsd: number
  change24h: number
  balanceUsd: number
  infraMonthlyUsd: number
  revenue30dUsd: number
  prohibited?: string[]
  custom?: { title: string; verify: string; budgetUsd: number }
  /** how the growth era ended, when it ended badly */
  growthOutcome?: 'failed' | 'challenged'
  amendments?: string[]
  chainId?: number
}

function objectives(s: Seed, r: () => number): Objective[] {
  const p = preset(s.template)
  const born = loadedAt - s.ageDays * DAY
  const eraEnd = (e: Era) => born + (e === 'genesis' ? ERA_DAYS.genesis : e === 'growth' ? ERA_DAYS.genesis + ERA_DAYS.growth : ERA_DAYS.genesis + ERA_DAYS.growth + ERA_DAYS.sovereignty) * DAY
  const status = (e: Era): Objective['status'] => {
    if (s.stage === 'sovereign') return 'passed'
    if (e === 'genesis') return s.ageDays > ERA_DAYS.genesis - 1.5 || s.stage === 'realm' ? 'passed' : 'active'
    if (s.stage === 'seed') return 'locked'
    if (e === 'growth') return s.growthOutcome ?? (s.ageDays > ERA_DAYS.genesis + ERA_DAYS.growth ? 'passed' : 'active')
    return s.ageDays > ERA_DAYS.genesis + ERA_DAYS.growth && !s.growthOutcome ? 'active' : 'locked'
  }
  const list: Objective[] = (['genesis', 'growth', 'sovereignty'] as Era[]).map((e) => ({
    id: `${s.id}-${e}`,
    era: e,
    title: p.objectives[e].title,
    verify: p.objectives[e].verify,
    deadline: eraEnd(e),
    budgetUsd: Math.round(p.objectives[e].budgetUsd * (0.85 + r() * 0.3) / 100) * 100,
    status: status(e),
  }))
  if (s.custom)
    list.push({
      id: `${s.id}-custom`,
      era: s.stage === 'seed' ? 'genesis' : 'growth',
      title: s.custom.title,
      verify: s.custom.verify,
      deadline: born + (s.stage === 'seed' ? 14 : 45) * DAY,
      budgetUsd: s.custom.budgetUsd,
      status: s.stage === 'sovereign' ? 'passed' : 'active',
      custom: true,
    })
  return list
}

function charter(s: Seed, r: () => number): Charter {
  const born = loadedAt - s.ageDays * DAY
  const versions = [{ version: 1, hash: hex(r, 64), at: born, summary: 'Genesis charter compiled and accepted at launch.' }]
  ;(s.amendments ?? []).forEach((summary, i) => versions.push({ version: i + 2, hash: hex(r, 64), at: born + (s.ageDays * DAY * (i + 1)) / ((s.amendments?.length ?? 0) + 1.5), summary }))
  return {
    mission: s.mission,
    prohibited: s.prohibited ?? ['Remove or move pool liquidity', 'Deploy unaudited contracts without a timelocked vote', 'Change this charter without holder approval', 'Spend beyond the category caps below'],
    objectives: objectives(s, r),
    versions,
  }
}

function apps(s: Seed, r: () => number): App[] {
  const p = preset(s.template)
  const n = s.stage === 'seed' ? 1 : s.stage === 'realm' ? 3 : 4
  const born = loadedAt - s.ageDays * DAY
  return p.modules.slice(0, n).map((m, i) => ({
    name: `${s.name} ${m.replace(/ v\d$/, '')}`,
    module: m,
    deployedAt: born + (i + 0.4) * DAY * Math.min(6, s.ageDays / (n + 1)),
    users30d: Math.round((s.retained30d / n) * (0.6 + r() * 0.8)),
    revenue30dUsd: Math.round((s.revenue30dUsd / n) * (0.5 + r()) / 10) * 10,
    audited: s.stage === 'sovereign' || (s.stage === 'realm' && i < 2),
  }))
}

function world(s: Seed): World {
  const r = seeded(s.id)
  const prof = profiles.find((p) => p.id === s.profile)!
  return {
    id: s.id,
    name: s.name,
    ticker: s.ticker,
    template: s.template,
    stage: s.stage,
    lore: s.lore,
    seededAt: loadedAt - s.ageDays * DAY,
    creator: s.creator,
    x: s.x,
    z: s.z,
    retained30d: s.retained30d,
    uptime90d: s.uptime90d,
    security: s.security,
    holders: s.holders,
    priceUsd: s.priceUsd,
    change24h: s.change24h,
    treasury: {
      balanceUsd: s.balanceUsd,
      infraMonthlyUsd: s.infraMonthlyUsd,
      revenue30dUsd: s.revenue30dUsd,
      modelCapDailyUsd: prof.capUsd,
      modelSpentTodayUsd: Math.round(prof.capUsd * (0.25 + r() * 0.5)),
    },
    governor: {
      profile: s.profile,
      roles: Object.entries(prof.roles).map(([role, model]) => ({ role: role as World['governor']['roles'][number]['role'], model })),
      fallback: 'Relay Mini',
      since: loadedAt - s.ageDays * DAY + 2 * H,
    },
    charter: charter(s, r),
    apps: apps(s, r),
    chain: s.chainId ? { chainId: s.chainId, launchedAt: loadedAt - (s.ageDays - 100) * DAY } : undefined,
  }
}

const seeds: Seed[] = [
  // ── sovereign: earned their own L3 ──
  {
    id: 'lattice', name: 'Lattice', ticker: 'LATX', template: 'defi', stage: 'sovereign', x: -33, z: -21, ageDays: 131, profile: 'frontier',
    lore: 'A trading town that grew around one honest market.',
    mission: 'Run a payments and swap network whose fees fund its own chain, and keep every pool solvent in public.',
    creator: 'mara.wren', retained30d: 9420, uptime90d: 99.94, security: 'passed', holders: 18_240, priceUsd: 0.412, change24h: 0.031,
    balanceUsd: 3_920_000, infraMonthlyUsd: 14_000, revenue30dUsd: 188_000, chainId: 724_101,
    amendments: ['Raised the lending module cap after audit.', 'Added a second oracle as a fallback.'],
  },
  {
    id: 'quorum-bay', name: 'Quorum Bay', ticker: 'QBAY', template: 'agents', stage: 'sovereign', x: 35, z: -27, ageDays: 112, profile: 'balanced',
    lore: 'A harbour where agents come to find work and leave with a reputation.',
    mission: 'Operate the most trusted agent job market: every payment released only against verified work.',
    creator: 'teodor.k', retained30d: 6110, uptime90d: 99.81, security: 'passed', holders: 11_090, priceUsd: 0.188, change24h: -0.012,
    balanceUsd: 1_640_000, infraMonthlyUsd: 11_500, revenue30dUsd: 97_000, chainId: 724_118,
    amendments: ['Moved dispute verification to a three-agent panel.'],
  },
  {
    id: 'emberfall', name: 'Emberfall', ticker: 'FALL', template: 'game', stage: 'sovereign', x: 31, z: 29, ageDays: 104, profile: 'frontier',
    lore: 'A volcanic island of crafters. Every item is burned to make the next.',
    mission: 'Run a crafting game whose economy burns more than it mints, season after season.',
    creator: 'studio.ash', retained30d: 12_800, uptime90d: 99.72, security: 'passed', holders: 22_470, priceUsd: 0.0931, change24h: 0.054,
    balanceUsd: 2_310_000, infraMonthlyUsd: 16_000, revenue30dUsd: 141_000, chainId: 724_133,
  },

  // ── realms: growing inside the shared environment ──
  {
    id: 'harrow', name: 'Harrow', ticker: 'HRW', template: 'prediction', stage: 'realm', x: -9, z: -23, ageDays: 96, profile: 'balanced',
    lore: 'A town of forecasters who keep score in public.',
    mission: 'Run prediction markets that resolve against named sources, and publish every forecast we ever made.',
    creator: 'ines.q', retained30d: 3180, uptime90d: 99.66, security: 'passed', holders: 7_420, priceUsd: 0.0574, change24h: 0.022,
    balanceUsd: 412_000, infraMonthlyUsd: 8_900, revenue30dUsd: 31_400,
  },
  {
    id: 'marrowind', name: 'Marrowind', ticker: 'MRW', template: 'creator', stage: 'realm', x: 15, z: -7, ageDays: 58, profile: 'balanced',
    lore: 'A valley of workshops where makers sell straight to the people who follow them.',
    mission: 'Give independent creators storefronts and memberships that pay out weekly, with no platform cut beyond the protocol fee.',
    creator: 'olu.makes', retained30d: 2210, uptime90d: 99.41, security: 'scheduled', holders: 5_160, priceUsd: 0.0218, change24h: 0.041,
    balanceUsd: 238_000, infraMonthlyUsd: 8_400, revenue30dUsd: 19_800,
  },
  {
    id: 'cinder-guild', name: 'Cinder Guild', ticker: 'CNDR', template: 'game', stage: 'realm', x: -25, z: 11, ageDays: 49, profile: 'fast',
    lore: 'A guild hall that overbuilt its armoury and is now paying it back.',
    mission: 'Ship a guild-versus-guild arena with an item economy players actually trust.',
    creator: 'kyo.tanaka', retained30d: 980, uptime90d: 98.9, security: 'none', holders: 3_020, priceUsd: 0.0089, change24h: -0.067,
    balanceUsd: 61_000, infraMonthlyUsd: 8_000, revenue30dUsd: 4_200, growthOutcome: 'failed',
    amendments: ['Recovery charter: item supply capped, new governor elected.'],
  },
  {
    id: 'ledgerwood', name: 'Ledgerwood', ticker: 'LWD', template: 'defi', stage: 'realm', x: 6, z: 18, ageDays: 41, profile: 'frontier',
    lore: 'A forest of small lenders, each pool tended in the open.',
    mission: 'Run isolated lending pools for long-tail tokens, each with a published risk sheet.',
    creator: 'dana.ruiz', retained30d: 1460, uptime90d: 99.58, security: 'scheduled', holders: 4_380, priceUsd: 0.0331, change24h: 0.008,
    balanceUsd: 176_000, infraMonthlyUsd: 9_200, revenue30dUsd: 16_100,
  },
  {
    id: 'northmere', name: 'Northmere', ticker: 'NMRE', template: 'agents', stage: 'realm', x: -14, z: 31, ageDays: 37, profile: 'balanced',
    lore: 'A cold lake town that rents out research agents by the hour.',
    mission: 'Run a research-agent co-op where every report is paid from escrow and scored by readers.',
    creator: 'sigrid.v', retained30d: 1120, uptime90d: 99.31, security: 'none', holders: 2_960, priceUsd: 0.0144, change24h: 0.019,
    balanceUsd: 92_000, infraMonthlyUsd: 8_100, revenue30dUsd: 9_300,
    custom: { title: 'Publish 100 reader-scored research reports', verify: 'Reports hashed onchain with reader scores from distinct holders', budgetUsd: 7000 },
  },
  {
    id: 'saltglass', name: 'Saltglass', ticker: 'SGLS', template: 'creator', stage: 'realm', x: 27, z: 5, ageDays: 33, profile: 'fast',
    lore: 'Glassblowers on a salt flat, minting editions of one.',
    mission: 'Mint one-of-one physical-digital editions and route royalties to the makers forever.',
    creator: 'nadia.salt', retained30d: 760, uptime90d: 99.12, security: 'none', holders: 1_840, priceUsd: 0.0061, change24h: -0.024,
    balanceUsd: 48_000, infraMonthlyUsd: 7_600, revenue30dUsd: 5_100, growthOutcome: 'challenged',
  },
  {
    id: 'vantage-reach', name: 'Vantage Reach', ticker: 'VRCH', template: 'frontier', stage: 'realm', x: -31, z: -3, ageDays: 28, profile: 'frontier',
    lore: 'An outpost that maps the other worlds and sells the maps.',
    mission: 'Build a public intelligence layer over every WORLDSEED world: indexes, alerts and a weekly atlas report.',
    creator: 'ravi.m', retained30d: 640, uptime90d: 99.2, security: 'none', holders: 1_510, priceUsd: 0.0118, change24h: 0.072,
    balanceUsd: 71_000, infraMonthlyUsd: 7_900, revenue30dUsd: 6_400,
    custom: { title: 'Index every world and ship weekly atlas reports', verify: 'Indexer uptime proofs and four reports with cited sources', budgetUsd: 9000 },
  },
  {
    id: 'kestrel', name: 'Kestrel Markets', ticker: 'KSTL', template: 'prediction', stage: 'realm', x: -3, z: 4, ageDays: 19, profile: 'balanced',
    lore: 'A hilltop exchange that only lists questions with a clear answer.',
    mission: 'List short-horizon markets on public data, resolved within 48 hours of the event.',
    creator: 'bea.lindqvist', retained30d: 520, uptime90d: 99.4, security: 'none', holders: 1_220, priceUsd: 0.0097, change24h: 0.036,
    balanceUsd: 39_000, infraMonthlyUsd: 7_400, revenue30dUsd: 3_600,
  },

  // ── seeds: in genesis ──
  {
    id: 'fernhollow', name: 'Fernhollow', ticker: 'FERN', template: 'game', stage: 'seed', x: -15, z: 18, ageDays: 5.4, profile: 'fast',
    lore: 'A hollow where a farming game is being planted.',
    mission: 'Ship a cosy farming game whose harvests are the only source of new items.',
    creator: 'pip.okafor', retained30d: 140, uptime90d: 99.0, security: 'none', holders: 610, priceUsd: 0.0021, change24h: 0.12,
    balanceUsd: 14_000, infraMonthlyUsd: 7_000, revenue30dUsd: 300,
  },
  {
    id: 'tideline', name: 'Tideline', ticker: 'TDL', template: 'agents', stage: 'seed', x: 20, z: -19, ageDays: 3.1, profile: 'balanced',
    lore: 'A shoreline of agents that clean and label public data.',
    mission: 'Pay agents to clean public datasets, verified by sampling, and publish the results for free.',
    creator: 'ama.osei', retained30d: 90, uptime90d: 99.0, security: 'none', holders: 420, priceUsd: 0.0014, change24h: 0.21,
    balanceUsd: 9_400, infraMonthlyUsd: 7_000, revenue30dUsd: 120,
  },
  {
    id: 'pinewright', name: 'Pinewright', ticker: 'PINE', template: 'creator', stage: 'seed', x: 0, z: -11, ageDays: 2.2, profile: 'fast',
    lore: 'Woodworkers selling plans and memberships.',
    mission: 'Sell woodworking plans and memberships, with makers paid the day a plan sells.',
    creator: 'hal.joiner', retained30d: 40, uptime90d: 99.0, security: 'none', holders: 260, priceUsd: 0.0009, change24h: 0.08,
    balanceUsd: 5_200, infraMonthlyUsd: 7_000, revenue30dUsd: 60,
  },
  {
    id: 'glasshouse', name: 'Glasshouse', ticker: 'GLSH', template: 'frontier', stage: 'seed', x: 12, z: 33, ageDays: 1.3, profile: 'frontier',
    lore: 'An experiment in growing an open research lab with no owner.',
    mission: 'Run an ownerless lab that funds replication studies and publishes every result, including the null ones.',
    creator: 'lab.collective', retained30d: 25, uptime90d: 99.0, security: 'none', holders: 190, priceUsd: 0.0011, change24h: 0.34,
    balanceUsd: 7_800, infraMonthlyUsd: 7_000, revenue30dUsd: 0,
    custom: { title: 'Fund and publish three replication studies', verify: 'Escrowed grants released on preregistration and on published data', budgetUsd: 6000 },
  },
  {
    id: 'mossbank', name: 'Mossbank', ticker: 'MOSB', template: 'defi', stage: 'seed', x: -29, z: 20, ageDays: 0.6, profile: 'balanced',
    lore: 'A savings bank for a small community, newly planted.',
    mission: 'Offer a simple savings pool with weekly reports and no leverage of any kind.',
    creator: 'june.adeyemi', retained30d: 10, uptime90d: 99.0, security: 'none', holders: 85, priceUsd: 0.0006, change24h: 0.0,
    balanceUsd: 2_100, infraMonthlyUsd: 7_000, revenue30dUsd: 0,
  },
]

export const worlds: World[] = seeds.map(world)
