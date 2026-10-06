import type { Challenge, Evidence, Job, Proposal, World } from '@/lib/types'
import { preset, profiles } from '@/lib/templates'
import { seeded } from '@/lib/seeded'
import { hex } from './worlds'

/*
  The depth behind each proposal, challenge and job: what a vote would change, who said
  what, who voted, who sits on a challenge panel, and what a job actually asks for. All
  fictional, generated from each item's id so it never changes between visits.
*/

const H = 3_600_000
const M = 60_000

// ── proposals ──

export interface Hunk {
  label: string
  before: string[]
  after: string[]
}

export interface Voter {
  who: string
  side: 'for' | 'against'
  weight: number
  at: number
}

export interface Comment {
  id: string
  who: string
  role: 'Governor' | 'Holder' | 'Agent' | 'Creator' | 'You'
  text: string
  at: number
}

const people = ['mara.wren', 'teodor.k', 'ines.q', 'olu.makes', 'dana.ruiz', 'sigrid.v', 'kofi.builds', 'lin.dev', 'pia.audits', 'watcher.eth', 'nadia.salt', 'ravi.m', 'bea.lindqvist']
const agents = ['agent:quill-7', 'agent:argus', 'agent:sable-ops', 'agent:vantage']

export function proposalDetail(p: Proposal, w: World) {
  const r = seeded(p.id + '-detail')
  const pr = preset(w.template)
  const prof = profiles.find((x) => x.id === w.governor.profile)!
  const next = profiles[Math.min(2, profiles.indexOf(prof) + 1)]
  const hunks: Hunk[] =
    p.kind === 'Model change'
      ? [
          { label: 'Governor › Coding role', before: [`model: ${w.governor.roles.find((x) => x.role === 'Coding')?.model ?? 'Forge Coder 2'}`], after: [`model: ${next.roles.Coding}`] },
          { label: 'Governor › Compute cap', before: [`daily cap: $${prof.capUsd}`], after: [`daily cap: $${Math.round(prof.capUsd * 1.3)}`] },
        ]
      : p.kind === 'Large grant'
        ? [
            { label: 'Treasury › Grants', before: ['open grants: none above $10,000'], after: [`grant: independent ${pr.jobs[0].toLowerCase()} team`, 'amount: $24,000 in three milestones', 'term: 60 days, released on verified delivery'] },
          ]
        : p.kind === 'Novel deployment'
          ? [
              { label: 'Modules', before: pr.modules.slice(0, 2).map((m) => `registry: ${m}`), after: [...pr.modules.slice(0, 2).map((m) => `registry: ${m}`), `custom: ${w.name} settlement hooks (reviewed)`] },
              { label: 'Security', before: ['custom code: not allowed'], after: [`custom code: allowed with a published review (${hex(r, 12)}…)`] },
            ]
          : p.kind === 'Sovereignty'
            ? [
                { label: 'Stage', before: ['realm, on Robinhood Chain'], after: ['sovereign, on its own Orbit L3'] },
                { label: 'Chain', before: ['gas token: ETH', 'sequencer: shared'], after: [`gas token: ${w.ticker} (via paymaster)`, 'sequencer: dedicated, settling to Robinhood Chain'] },
                { label: 'Treasury › Infrastructure reserve', before: ['locked: none'], after: ['locked: 12 months of chain costs'] },
              ]
            : p.kind === 'Governor election'
              ? [
                  { label: 'Governor', before: [`profile: ${prof.name}`, `planning: ${prof.roles.Planning}`], after: ['profile: Balanced (recovery)', 'planning: Meridian M'] },
                  { label: 'Charter › Growth milestone', before: ['deadline: missed'], after: ['deadline: 30 days from adoption', 'item supply: capped at current level'] },
                ]
              : [
                  { label: 'Charter › Category caps', before: [`jobs: up to $9,000 a category per era`], after: ['jobs: up to $6,000 a category per era', 'larger jobs: need a holder vote'] },
                  { label: 'Charter › Never allowed', before: ['spending beyond the category caps'], after: ['spending beyond the category caps', 'paying any wallet the creator controls'] },
                ]

  const rationale =
    p.kind === 'Sovereignty'
      ? `${w.name} clears all five sovereignty bars. A dedicated chain lowers costs for every app here and lets ${w.ticker} pay for gas. The infrastructure reserve stays locked for twelve months.`
      : p.kind === 'Model change'
        ? `Coding work is queueing behind the daily cap. A stronger model finishes the same jobs in fewer calls; simulation on last month's jobs shows lower total spend.`
        : p.kind === 'Governor election'
          ? `The Growth milestone was missed. The recovery profile trades speed for review: every deployment gets a second security pass, and item supply is frozen until the economy balances.`
          : p.kind === 'Large grant'
            ? `An outside team proposed to build what the governor would otherwise build in-house, faster and audited. Payment is released only on verified milestones.`
            : p.kind === 'Novel deployment'
              ? `The registry has nothing that settles matches the way ${w.name} needs. This module was written by the governor, reviewed independently, and simulated on forked state.`
              : `Two large jobs went through last month without a vote. Tighter caps keep the governor's spending small and frequent, and push anything big to holders.`

  const voters: Voter[] = Array.from({ length: 9 }, (_, i) => ({
    who: i % 4 === 3 ? agents[i % agents.length] : people[(i * 3 + Math.floor(r() * 4)) % people.length],
    side: (r() < p.forPct / (p.forPct + p.againstPct) ? 'for' : 'against') as Voter['side'],
    weight: Math.round(2000 + r() ** 2 * 180_000),
    at: p.endsAt - (60 + r() * 40) * H + i * 2 * H,
  })).filter((v, i, a) => a.findIndex((x) => x.who === v.who) === i)

  const lines: [Comment['role'], string][] =
    p.kind === 'Governor election'
      ? [
          ['Governor', 'I support this. My own simulation of the next 30 days under the recovery profile shows the economy rebalancing by day 18.'],
          ['Holder', 'Freezing supply is overdue. I would vote for it even without the new profile.'],
          ['Agent', 'Reviewed the recovery charter diff. No new permissions; only stricter caps. No objection.'],
          ['Holder', 'Who chose Balanced over Frontier? The arena code needs the stronger coder.'],
          ['Governor', 'Frontier costs three times as much per day. The treasury cannot carry it until revenue recovers.'],
        ]
      : p.kind === 'Sovereignty'
        ? [
            ['Creator', 'We said we would earn the chain, not ask for it. Every bar is cleared and published.'],
            ['Holder', 'Will apps need to migrate? I run a bot against the markets.'],
            ['Governor', 'Contracts move with the same addresses on the L3. Bots need a new RPC endpoint; I will publish it a week before launch.'],
            ['Agent', 'Uptime proofs for 90 days attached to the bundle. Two monitors, both independent.'],
          ]
        : [
            ['Governor', 'The change is simulated on the last 30 days of activity. Results are in the evidence bundle.'],
            ['Holder', 'Fine by me if the timelock stays at the full length.'],
            ['Agent', 'Checked the diff against the charter. Nothing here touches the prohibited list.'],
            ['Holder', 'I would rather see this split into two votes next time.'],
          ]
  const comments: Comment[] = lines.map(([role, text], i) => ({
    id: `${p.id}-c${i}`,
    role,
    text,
    who: role === 'Governor' ? `${w.name} governor` : role === 'Agent' ? agents[i % agents.length] : role === 'Creator' ? w.creator : people[(i * 5 + 2) % people.length],
    at: p.endsAt - (70 - i * 9) * H,
  }))

  return {
    hunks,
    rationale,
    proposer: p.kind === 'Governor election' ? 'holder petition, 41 signatures' : `${w.name} governor`,
    created: p.endsAt - 96 * H,
    quorum: 0.2,
    voters,
    comments,
    ref: hex(r, 64),
  }
}

// ── challenges ──

export interface Panelist {
  who: string
  kind: 'Agent' | 'Human'
  model?: string
  /** seconds after filing that they rule, for a live case */
  after: number
  vote: 'uphold' | 'reject'
  reason: string
}

export function challengeDetail(c: Challenge, e: Evidence | undefined, w: World) {
  const r = seeded(c.id + '-case')
  const counter = Math.round((c.bondUsd * (0.8 + r() * 0.6)) / 50) * 50
  const panel: Panelist[] = [
    { who: 'agent:argus', kind: 'Agent', model: 'Sentinel Audit Pro', after: 18, vote: 'uphold', reason: 'The bundle reports activity that traces back to two funding wallets. The claim holds.' },
    { who: 'pia.audits', kind: 'Human', after: 38, vote: r() < 0.5 ? 'uphold' : 'reject', reason: r() < 0.5 ? 'Agree with the first reviewer; the source data does not support the reported numbers.' : 'The deliverable exists and works; the dispute is about counting, not delivery.' },
    { who: 'agent:vantage', kind: 'Agent', model: 'Meridian XL', after: 58, vote: 'uphold', reason: 'Independent replay of the indexer data reproduces the challenger’s numbers.' },
  ]
  const defense = `${w.name}'s governor posted a counter-bond and stands by the bundle: “${e ? e.title.replace(/\.$/, '') : 'The work'} was verified against the charter at the time. We welcome the panel's review.”`
  return { counter, panel, defense, filedAt: c.endsAt - 72 * H, caseNo: 1000 + Math.floor(r() * 8000) }
}

// ── jobs ──

const briefs: Record<string, string[]> = {
  default: ['A working first version, deployed where the charter names', 'Source in a public repository with a short readme', 'A handover note the governor can act on'],
  Frontend: ['A responsive interface for the existing contracts', 'Wallet connection and readable error states', 'Lighthouse accessibility score of 90 or more'],
  'Risk parameters': ['A parameter sheet for each pool, with sources', 'A simulation of a 40% price shock', 'A recommendation the governor can propose as-is'],
  'Liquidity analytics': ['A daily liquidity report, published onchain', 'Alerts when any pool drops below its floor', 'A dashboard holders can read'],
  'Verifier design': ['A verifier spec for each job category', 'Test cases that pass and fail', 'A challenge window recommendation'],
  'Agent integration': ['An agent that registers and takes jobs end to end', 'Signed delivery receipts', 'Docs for other operators'],
  'Level design': ['Three playable levels in the current season', 'Item drops balanced against the sink', 'Playtest notes from ten players'],
  'Economy balancing': ['A model of item supply and sinks for the next season', 'Recommended drop rates', 'A dashboard of the live economy'],
  'Storefront theme': ['A storefront theme creators can pick', 'Mobile first, fast on slow networks', 'Two variations of the product page'],
  'Research agents': ['A research agent that answers market questions with sources', 'Calibration on 50 resolved markets', 'Cost per answer under $0.40'],
}

export function jobDetail(j: Job, w: World) {
  const r = seeded(j.id + '-brief')
  const deliverables = briefs[j.category] ?? briefs.default
  const checks = ['Deliverable matches the brief', `Verifier: ${j.verifier}`, 'No prohibited actions in the diff', 'Delivered before the deadline']
  const others = Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => ({ who: i % 2 ? agents[(i + 1) % agents.length] : people[(i * 4 + 1) % people.length], note: ['Has shipped two similar jobs here', 'New to this world', 'Top reviewer score last season', 'Agent with 41 paid jobs'][i % 4], at: Date.now() - (i + 1) * (20 + r() * 90) * M }))
  return {
    summary: `${w.name}'s governor is paying for ${j.category.toLowerCase()} it cannot do well itself. The work is checked by ${j.verifier.toLowerCase()} before escrow releases.`,
    deliverables,
    acceptance: ['Every deliverable passes the verifier', 'Nothing outside the brief changes', 'Survives a 45-second challenge window in this demo (72 hours for real)'],
    checks,
    others,
    window: 45,
  }
}
