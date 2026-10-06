import type { World } from './types'

/* The constants a world is measured against. One place, so every page states the same numbers. */

export const ERA_DAYS = { genesis: 7, growth: 30, sovereignty: 90 } as const

/** Starting hypotheses for how creator fees split. Simulation inputs, not final economics. */
export const SPLIT = [
  { key: 'build', label: 'Build budget', share: 0.45, note: 'Audited deployments, contributors and paid jobs' },
  { key: 'infra', label: 'Infrastructure reserve', share: 0.25, note: 'RPC, sequencing, data availability, inference, monitoring' },
  { key: 'grants', label: 'Ecosystem grants', share: 0.15, note: 'Independent apps through bounded proposals' },
  { key: 'protocol', label: 'Protocol fee', share: 0.1, note: 'WORLDSEED development, audits, shared infrastructure' },
  { key: 'security', label: 'Challenge & security', share: 0.05, note: 'Bug bounties, objective challenges, emergencies' },
] as const

/** What a world must prove before it may launch its own chain. */
export const SOVEREIGNTY = {
  retained30d: 2000,
  revenue30dUsd: 25_000,
  uptime90d: 99.5,
  runwayMonths: 12,
}

export const runwayMonths = (w: World) => (w.treasury.balanceUsd * 0.25) / w.treasury.infraMonthlyUsd

export interface Criterion {
  key: string
  label: string
  value: string
  need: string
  met: boolean
  /** progress toward the bar, 0..1 */
  progress: number
}

export function criteria(w: World): Criterion[] {
  const run = runwayMonths(w)
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(Math.round(n)))
  return [
    { key: 'users', label: 'Retained users, 30 days', value: k(w.retained30d), need: k(SOVEREIGNTY.retained30d), met: w.retained30d >= SOVEREIGNTY.retained30d, progress: Math.min(1, w.retained30d / SOVEREIGNTY.retained30d) },
    { key: 'revenue', label: 'Protocol revenue, 30 days', value: `$${k(w.treasury.revenue30dUsd)}`, need: `$${k(SOVEREIGNTY.revenue30dUsd)}`, met: w.treasury.revenue30dUsd >= SOVEREIGNTY.revenue30dUsd, progress: Math.min(1, w.treasury.revenue30dUsd / SOVEREIGNTY.revenue30dUsd) },
    { key: 'security', label: 'Independent security review', value: w.security === 'passed' ? 'Passed' : w.security === 'scheduled' ? 'Scheduled' : 'Not started', need: 'Passed', met: w.security === 'passed', progress: w.security === 'passed' ? 1 : w.security === 'scheduled' ? 0.5 : 0 },
    { key: 'uptime', label: 'Uptime, 90 days', value: `${w.uptime90d.toFixed(2)}%`, need: `${SOVEREIGNTY.uptime90d}%`, met: w.uptime90d >= SOVEREIGNTY.uptime90d, progress: Math.min(1, Math.max(0, (w.uptime90d - 95) / (SOVEREIGNTY.uptime90d - 95))) },
    { key: 'runway', label: 'Infrastructure runway', value: `${run.toFixed(1)} mo`, need: `${SOVEREIGNTY.runwayMonths} mo`, met: run >= SOVEREIGNTY.runwayMonths, progress: Math.min(1, run / SOVEREIGNTY.runwayMonths) },
  ]
}

export const readiness = (w: World) => {
  const c = criteria(w)
  return c.reduce((s, x) => s + x.progress, 0) / c.length
}
