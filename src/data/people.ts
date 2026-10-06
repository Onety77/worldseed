import { seeded } from '@/lib/seeded'
import { preset } from '@/lib/templates'
import { challenges, jobs, proposals } from './activity'
import { proposalDetail } from './detail'
import { loadedAt, worlds } from './worlds'

/*
  Everyone who shows up in the sample data, as a public record: the worlds they seeded and
  hold, the work they delivered, the votes they cast, the challenges they brought or sat on.
  Built from the same activity the rest of the site shows, topped up with a stable history
  generated from each handle, so every name opens onto a page that agrees with the rest.
*/

const DAY = 86_400_000

type Kind = 'person' | 'agent'

export interface Delivery {
  id: string
  worldId: string
  title: string
  usd: number
  at: number
  result: 'paid' | 'in review' | 'challenge window' | 'rejected'
  /** links to a live job page when the job is one of the open sample jobs */
  live?: boolean
}

interface CastVote {
  proposalId: string
  worldId: string
  title: string
  side: 'for' | 'against'
  weight: number
  at: number
}

export interface Case {
  id: string
  worldId: string
  role: 'challenger' | 'panel'
  claim: string
  outcome: 'open' | 'upheld' | 'rejected'
  usd: number
  at: number
  live?: boolean
}

interface Holding {
  worldId: string
  /** share of supply */
  share: number
}

export interface Person {
  handle: string
  kind: Kind
  /** short line under the name */
  role: string
  bio: string
  joinedAt: number
  seeded: string[]
  held: Holding[]
  deliveries: Delivery[]
  votes: CastVote[]
  cases: Case[]
  /** agents only */
  agent?: { model: string; operator: string; stake: number; specialty: string }
}

const meta: Record<string, { kind: Kind; role: string; bio: string; days: number; agent?: Person['agent'] }> = {
  'mara.wren': { kind: 'person', role: 'Founder · Lattice', bio: 'Seeded Lattice with one sentence about a lending market that pays its own auditors. Still votes on every amendment.', days: 140 },
  'teodor.k': { kind: 'person', role: 'Founder · Harrow', bio: 'Writes charters short and strict. Believes a missed milestone should cost the governor, not the holders.', days: 128 },
  'studio.ash': { kind: 'person', role: 'Studio · Cinder Guild', bio: 'A three-person game studio that let a governor run its live ops. Ships a season every six weeks.', days: 120 },
  'ines.q': { kind: 'person', role: 'Founder · Quarry', bio: 'Former market maker. Seeds worlds that make money from day one and says so in the charter.', days: 96 },
  'olu.makes': { kind: 'person', role: 'Founder · Marrowind', bio: 'Builds for creators who are tired of platform cuts. Answers support threads personally on Sundays.', days: 70 },
  'kyo.tanaka': { kind: 'person', role: 'Founder', bio: 'Experiments with prediction worlds. Keeps a public log of every model change and why.', days: 58 },
  'dana.ruiz': { kind: 'person', role: 'Founder', bio: 'Agent operator turned founder. Seeds worlds where agents hire other agents.', days: 64 },
  'sigrid.v': { kind: 'person', role: 'Founder', bio: 'Thinks in seasons and sinks. Every item her world mints has somewhere to go.', days: 52 },
  'nadia.salt': { kind: 'person', role: 'Founder · Saltglass', bio: 'Runs a makers’ co-op. Seeded Saltglass to pay members weekly with no middle layer.', days: 40 },
  'ravi.m': { kind: 'person', role: 'Founder', bio: 'Builds small, fast worlds and lets the governor carry the ops.', days: 34 },
  'bea.lindqvist': { kind: 'person', role: 'Founder', bio: 'Designer. Cares about how a world reads at a glance, and about who gets paid first.', days: 30 },
  'pip.okafor': { kind: 'person', role: 'Founder', bio: 'First world, planted this month. Learning in public.', days: 9 },
  'ama.osei': { kind: 'person', role: 'Founder', bio: 'Seeded a frontier world to see what a governor does with almost no rules.', days: 7 },
  'hal.joiner': { kind: 'person', role: 'Founder', bio: 'Craftsman. Seeded a storefront world for furniture makers in the valley.', days: 5 },
  'lab.collective': { kind: 'person', role: 'Collective', bio: 'A research group that seeds worlds as experiments and publishes what they learn.', days: 4 },
  'june.adeyemi': { kind: 'person', role: 'Founder', bio: 'Newest seed on the Field. Watching the first proof land.', days: 2 },
  'kofi.builds': { kind: 'person', role: 'Builder', bio: 'Independent developer. Takes frontend and integration jobs across a dozen worlds, mostly at night.', days: 110 },
  'lin.dev': { kind: 'person', role: 'Builder', bio: 'Smart contract engineer. Prefers jobs with a strict verifier and a short brief.', days: 90 },
  'pia.audits': { kind: 'person', role: 'Verifier', bio: 'Auditor on the approved panel list. Reads every bundle twice before ruling.', days: 118 },
  'watcher.eth': { kind: 'person', role: 'Challenger', bio: 'Watches governors for a living. Bonds against anything that does not add up.', days: 102 },
  'agent:quill-7': { kind: 'agent', role: 'Builder agent', bio: 'A coding agent that takes frontend and documentation jobs end to end and signs every delivery.', days: 84, agent: { model: 'Forge Coder 3', operator: 'dana.ruiz', stake: 4000, specialty: 'Frontend, docs' } },
  'agent:argus': { kind: 'agent', role: 'Verifier agent', bio: 'Reviews evidence bundles for funding loops and padded numbers. Sits on challenge panels.', days: 122, agent: { model: 'Sentinel Audit Pro', operator: 'pia.audits', stake: 12000, specialty: 'Audits, panels' } },
  'agent:sable-ops': { kind: 'agent', role: 'Operations agent', bio: 'Runs uptime, monitoring and the boring jobs that keep a world’s lights on.', days: 76, agent: { model: 'Relay Mini', operator: 'kofi.builds', stake: 2500, specialty: 'Ops, uptime' } },
  'agent:vantage': { kind: 'agent', role: 'Analyst agent', bio: 'Replays indexer data to check what governors report. Rarely wrong, never fast.', days: 98, agent: { model: 'Meridian XL', operator: 'watcher.eth', stake: 8000, specialty: 'Data, replays' } },
}

const byWorld = new Map(worlds.map((w) => [w.id, w]))
const results: Delivery['result'][] = ['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'rejected', 'paid', 'paid']

function build(handle: string): Person {
  const m = meta[handle]
  const r = seeded(handle + '-profile')
  const seededHere = worlds.filter((w) => w.creator === handle).map((w) => w.id)

  // holdings: their own worlds, then a few others they believe in
  const others = worlds.filter((w) => !seededHere.includes(w.id) && w.stage !== 'seed')
  const pick = Array.from({ length: m.kind === 'agent' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 3) }, () => others[Math.floor(r() * others.length)].id)
  const held: Holding[] = [
    ...seededHere.map((id) => ({ worldId: id, share: 0.03 + r() * 0.04 })),
    ...[...new Set(pick)].map((id) => ({ worldId: id, share: 0.0008 + r() ** 2 * 0.012 })),
  ]

  // delivered work: the sample jobs they hold now, then a stable history
  const current: Delivery[] = jobs
    .filter((j) => j.claimant === handle)
    .map((j) => ({ id: j.id, worldId: j.worldId, title: j.title, usd: j.escrowUsd, at: Math.min(j.endsAt - 6 * DAY, loadedAt - (0.3 + r() * 2) * DAY), result: j.status === 'paid' ? 'paid' : (j.status as Delivery['result']), live: true }))
  const builder = m.kind === 'agent' ? handle !== 'agent:argus' && handle !== 'agent:vantage' ? 18 : 6 : handle === 'kofi.builds' || handle === 'lin.dev' ? 14 : m.role === 'Verifier' ? 3 : 2
  const realms = worlds.filter((w) => w.stage !== 'seed')
  const past: Delivery[] = Array.from({ length: builder + Math.floor(r() * 6) }, (_, i) => {
    const w = realms[Math.floor(r() * realms.length)]
    const cat = preset(w.template).jobs[Math.floor(r() * preset(w.template).jobs.length)]
    return {
      id: `${handle}-d${i}`,
      worldId: w.id,
      title: `${cat}: ${['first pass', 'production build', 'review and fixes', 'documentation', 'weekly run'][Math.floor(r() * 5)]}`,
      usd: Math.round((300 + r() ** 2 * 6000) / 50) * 50,
      at: loadedAt - (3 + i * (m.days / (builder + 6)) + r() * 3) * DAY,
      result: results[Math.floor(r() * results.length)],
    }
  })
  const deliveries = [...current, ...past].sort((a, b) => b.at - a.at)

  // votes: every sample proposal they voted on
  const votes: CastVote[] = proposals.flatMap((p) => {
    const w = byWorld.get(p.worldId)!
    const v = proposalDetail(p, w).voters.find((x) => x.who === handle)
    return v ? [{ proposalId: p.id, worldId: p.worldId, title: p.title, side: v.side, weight: v.weight, at: v.at }] : []
  })

  // cases: challenges they filed, and panels they sat on
  const panelists = ['agent:argus', 'pia.audits', 'agent:vantage']
  const cases: Case[] = [
    ...challenges.filter((c) => c.by === handle).map((c) => ({ id: c.id, worldId: c.worldId, role: 'challenger' as const, claim: c.claim, outcome: 'open' as const, usd: c.bondUsd, at: c.endsAt - 72 * 3_600_000, live: true })),
    ...(panelists.includes(handle) ? challenges.map((c) => ({ id: c.id, worldId: c.worldId, role: 'panel' as const, claim: c.claim, outcome: 'open' as const, usd: 0, at: c.endsAt - 72 * 3_600_000, live: true })) : []),
  ]
  const closed = handle === 'watcher.eth' || handle === 'agent:vantage' || handle === 'agent:argus' || handle === 'pia.audits' ? 5 + Math.floor(r() * 6) : r() < 0.3 ? 1 : 0
  for (let i = 0; i < closed; i++) {
    const w = realms[Math.floor(r() * realms.length)]
    cases.push({
      id: `${handle}-k${i}`,
      worldId: w.id,
      role: panelists.includes(handle) && i % 2 ? 'panel' : 'challenger',
      claim: ['Reported users traced to one funding source', 'Deployed bytecode differed from the audit', 'Revenue looped back from the treasury', 'Delivery landed after the deadline', 'Uptime proof skipped a monitor'][Math.floor(r() * 5)],
      outcome: r() < 0.62 ? 'upheld' : 'rejected',
      usd: Math.round((250 + r() * 2200) / 50) * 50,
      at: loadedAt - (6 + i * 9 + r() * 6) * DAY,
    })
  }

  return {
    handle,
    kind: m.kind,
    role: m.role,
    bio: m.bio,
    joinedAt: loadedAt - m.days * DAY,
    seeded: seededHere,
    held,
    deliveries,
    votes,
    cases: cases.sort((a, b) => b.at - a.at),
    agent: m.agent,
  }
}

export const people: Person[] = Object.keys(meta).map(build)
const index = new Map(people.map((p) => [p.handle, p]))

/** the public record for a handle, if there is one */
export const personFor = (handle: string | undefined) => (handle ? index.get(handle) : undefined)

/** what a profile adds up to */
export function tally(p: Person) {
  const done = p.deliveries.filter((d) => d.result === 'paid' || d.result === 'rejected')
  const paid = done.filter((d) => d.result === 'paid')
  const filed = p.cases.filter((c) => c.role === 'challenger')
  const won = filed.filter((c) => c.outcome === 'upheld').length
  const lost = filed.filter((c) => c.outcome === 'rejected').length
  return {
    paid: paid.length,
    passRate: done.length ? paid.length / done.length : 0,
    earned: paid.reduce((s, d) => s + d.usd, 0),
    worked: [...new Set(p.deliveries.map((d) => d.worldId))],
    won,
    lost,
    panels: p.cases.filter((c) => c.role === 'panel').length,
  }
}

/** every world a profile touches, for the map */
export const worldsOf = (p: Person) => [...new Set([...p.seeded, ...p.held.map((h) => h.worldId), ...p.deliveries.map((d) => d.worldId), ...p.votes.map((v) => v.worldId)])]
