import type { Challenge, Evidence, Job, Proposal, World } from '@/lib/types'
import { preset } from '@/lib/templates'
import { seeded } from '@/lib/seeded'
import { hex, loadedAt, worlds } from './worlds'

/*
  What the worlds' governors have been doing: evidence bundles, escrowed jobs, open
  challenges and proposals. Generated from each world's seed so it is stable between
  visits; lib/sim adds new entries live.
*/

const M = 60_000
const H = 3_600_000

type Kind = Evidence['kind']
const actions: Record<Kind, { titles: string[]; step: Evidence['step']; role: string }> = {
  deploy: { step: 'Execute', role: 'Coding', titles: ['Deployed {mod} from the template registry', 'Upgraded {mod} after a passed timelock', 'Verified {mod} source on Robinhood Chain'] },
  job: { step: 'Publish proof', role: 'Planning', titles: ['Released escrow for “{job}”', 'Funded a job: {job}', 'Opened review on “{job}” delivery'] },
  grant: { step: 'Approve', role: 'Planning', titles: ['Proposed a bounded grant for an independent {job} app', 'Paid grant milestone two to an outside team'] },
  revenue: { step: 'Evaluate', role: 'Planning', titles: ['Swept protocol fees into the World Treasury', 'Recorded weekly revenue against the Growth objective'] },
  ops: { step: 'Observe', role: 'Community', titles: ['Published the weekly operations report', 'Answered and closed community support threads', 'Rotated RPC endpoints after a latency alert'] },
  model: { step: 'Simulate', role: 'Security review', titles: ['Simulated {mod} upgrade against forked state', 'Ran a security review on the pending {mod} change'] },
  proposal: { step: 'Propose', role: 'Planning', titles: ['Proposed a charter amendment with a 48h timelock', 'Proposed raising the job category cap'] },
}

const kindsFor = (w: World): Kind[] => (w.stage === 'seed' ? ['deploy', 'ops', 'model', 'job', 'deploy'] : ['deploy', 'job', 'revenue', 'ops', 'model', 'grant', 'proposal', 'job', 'revenue'])

export function makeEvidence(w: World, r: () => number, at: number, i: number): Evidence {
  const ks = kindsFor(w)
  const kind = ks[Math.floor(r() * ks.length)]
  const a = actions[kind]
  const p = preset(w.template)
  const title = a.titles[Math.floor(r() * a.titles.length)]
    .replace('{mod}', p.modules[Math.floor(r() * p.modules.length)])
    .replace('{job}', p.jobs[Math.floor(r() * p.jobs.length)])
  const role = w.governor.roles.find((x) => x.role === a.role) ?? w.governor.roles[0]
  const v = r()
  return {
    id: `${w.id}-e${i}-${Math.floor(at / 1000)}`,
    worldId: w.id,
    at,
    kind,
    title,
    model: role.model,
    costUsd: Math.round((0.02 + r() ** 3 * (kind === 'model' || kind === 'deploy' ? 30 : 4)) * 100) / 100,
    ref: hex(r, 64),
    verdict: v > 0.97 ? 'failed' : v > 0.92 ? 'challenged' : v > 0.8 ? 'pending' : 'passed',
    step: a.step,
  }
}

export const evidence: Evidence[] = worlds
  .flatMap((w) => {
    const r = seeded(w.id + '-ev')
    const n = w.stage === 'seed' ? 6 : 12
    let at = loadedAt - Math.floor(r() * 20) * M
    return Array.from({ length: n }, (_, i) => {
      const e = makeEvidence(w, r, at, i)
      at -= Math.floor((w.stage === 'seed' ? 50 : 30) + r() * 240) * M
      return e
    })
  })
  .sort((a, b) => b.at - a.at)

export const jobs: Job[] = worlds.flatMap((w) => {
  const r = seeded(w.id + '-jobs')
  const p = preset(w.template)
  const n = w.stage === 'seed' ? 2 : 3
  const statuses: Job['status'][] = ['open', 'open', 'in review', 'challenge window', 'paid']
  return Array.from({ length: n }, (_, i) => {
    const status = statuses[Math.floor(r() * statuses.length)]
    return {
      id: `${w.id}-j${i}`,
      worldId: w.id,
      title: `${p.jobs[i % p.jobs.length]}: ${['first pass', 'production build', 'review and fixes', 'documentation'][Math.floor(r() * 4)]}`,
      category: p.jobs[i % p.jobs.length],
      escrowUsd: Math.round((400 + r() ** 2 * (w.stage === 'sovereign' ? 14000 : 5000)) / 50) * 50,
      verifier: ['Test suite + reviewer agent', 'Two-of-three reviewer panel', 'Onchain deployment check', 'Uptime proof, 7 days'][Math.floor(r() * 4)],
      status,
      endsAt: loadedAt + Math.floor((status === 'challenge window' ? 2 + r() * 40 : 24 + r() * 200) * H),
      claimant: status === 'open' ? undefined : ['agent:quill-7', 'kofi.builds', 'agent:sable-ops', 'lin.dev', 'agent:argus'][Math.floor(r() * 5)],
    }
  })
})

export const challenges: Challenge[] = evidence
  .filter((e) => e.verdict === 'challenged')
  .map((e, i) => {
    const r = seeded(e.id + '-ch')
    return {
      id: `ch-${i}`,
      worldId: e.worldId,
      evidenceId: e.id,
      bondUsd: Math.round((250 + r() * 2000) / 50) * 50,
      claim: ['The reported users include wallets funded from one source.', 'The deployed bytecode does not match the audited template.', 'Revenue was routed back from the treasury itself.', 'The deliverable was submitted after the deadline.'][i % 4],
      status: 'open',
      endsAt: loadedAt + Math.floor((6 + r() * 60) * H),
      by: ['watcher.eth', 'agent:argus', 'pia.audits', 'agent:vantage'][i % 4],
    }
  })

export const proposals: Proposal[] = worlds
  .filter((w) => w.stage !== 'seed')
  .flatMap((w, i) => {
    const r = seeded(w.id + '-gov')
    const kinds: Proposal['kind'][] = w.id === 'cinder-guild' ? ['Governor election', 'Charter amendment'] : w.id === 'harrow' ? ['Sovereignty', 'Model change'] : ['Large grant', 'Model change', 'Charter amendment', 'Novel deployment']
    return kinds.slice(0, w.stage === 'sovereign' ? 1 : 2).map((kind, k) => {
      const f = 0.45 + r() * 0.45
      const status: Proposal['status'] = k === 0 && i % 3 === 0 ? 'timelock' : 'voting'
      return {
        id: `${w.id}-p${k}`,
        worldId: w.id,
        kind,
        title:
          kind === 'Sovereignty' ? 'Graduate to a dedicated Orbit L3 settling to Robinhood Chain'
          : kind === 'Governor election' ? 'Elect a recovery governor after the missed Growth milestone'
          : kind === 'Model change' ? 'Move the Coding role to a stronger approved model'
          : kind === 'Large grant' ? `Fund an independent ${preset(w.template).jobs[0].toLowerCase()} team for 60 days`
          : kind === 'Novel deployment' ? 'Deploy a reviewed custom module outside the registry'
          : 'Tighten the job category caps in the charter',
        forPct: f,
        againstPct: (1 - f) * (0.6 + r() * 0.3),
        turnoutPct: 0.12 + r() * 0.3,
        endsAt: loadedAt + Math.floor((status === 'timelock' ? 6 + r() * 40 : 20 + r() * 100) * H),
        timelockH: kind === 'Model change' || kind === 'Charter amendment' ? 48 : kind === 'Sovereignty' ? 72 : 24,
        status,
      }
    })
  })
