import { createStore } from './store'
import type { Challenge, Proposal } from './types'
import { challenges as sampleChallenges, jobs, proposals as sampleProposals } from '@/data/activity'

/*
  What visitors do this session: challenges they bond against evidence and votes they cast.
  Kept in memory beside the sample data; a real build sends these to ChallengeManager and
  the governance contracts.
*/

export const filed = createStore<Challenge[]>([])
/** comments you posted, by proposal */
export const posted = createStore<Record<string, { id: string; text: string; at: number }[]>>({})
/** your progress on jobs you took */
export interface JobRun {
  stage: 'claimed' | 'submitted' | 'review' | 'window' | 'paid'
  link?: string
  notes?: string
  at: number
}
export const runs = createStore<Record<string, JobRun>>({})
export const setRun = (id: string, r: JobRun) => runs.set((x) => ({ ...x, [id]: r }))
/** challenges of yours that have been ruled on and paid out */
export const settled = createStore<string[]>([])
export const votes = createStore<Record<string, 'for' | 'against'>>({})

export function fileChallenge(c: Omit<Challenge, 'id' | 'status' | 'endsAt' | 'by'>) {
  const next: Challenge = { ...c, id: `mine-${Date.now()}`, status: 'open', endsAt: Date.now() + 72 * 3_600_000, by: 'you' }
  filed.set((l) => [next, ...l])
  return next
}

export const useChallenges = () => {
  const mine = filed.use()
  return mine.length ? [...mine, ...sampleChallenges] : sampleChallenges
}

export const useProposals = (): Proposal[] => {
  const v = votes.use()
  // a vote nudges the tally by your (small) weight, so you can see it land
  return sampleProposals.map((p) => (v[p.id] ? { ...p, forPct: p.forPct + (v[p.id] === 'for' ? 0.004 : 0), againstPct: p.againstPct + (v[p.id] === 'against' ? 0.004 : 0), turnoutPct: p.turnoutPct + 0.002 } : p))
}

export { jobs }
export const openJobs = jobs.filter((j) => j.status === 'open' || j.status === 'in review')
