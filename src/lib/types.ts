/** Where a world is in its life. A dedicated chain is earned, never given. */
export type Stage = 'seed' | 'realm' | 'sovereign'
export type Era = 'genesis' | 'growth' | 'sovereignty'
export type Template = 'defi' | 'agents' | 'game' | 'creator' | 'prediction' | 'frontier'
export type Profile = 'fast' | 'balanced' | 'frontier'
export type Verdict = 'passed' | 'pending' | 'challenged' | 'failed'

export interface Objective {
  id: string
  era: Era
  title: string
  /** how it is verified, in hard evidence */
  verify: string
  deadline: number
  budgetUsd: number
  status: 'passed' | 'active' | 'failed' | 'challenged' | 'locked'
  custom?: boolean
}

export interface CharterVersion {
  version: number
  hash: string
  at: number
  summary: string
}

export interface Charter {
  mission: string
  prohibited: string[]
  objectives: Objective[]
  versions: CharterVersion[]
}

export interface Treasury {
  balanceUsd: number
  /** monthly cost of RPC, sequencing, data availability, inference and monitoring */
  infraMonthlyUsd: number
  revenue30dUsd: number
  modelCapDailyUsd: number
  modelSpentTodayUsd: number
}

export interface ModelRole {
  role: 'Planning' | 'Coding' | 'Security review' | 'Community' | 'Visual'
  model: string
}

export interface Governor {
  profile: Profile
  roles: ModelRole[]
  fallback: string
  since: number
}

export interface Evidence {
  id: string
  worldId: string
  at: number
  kind: 'deploy' | 'job' | 'grant' | 'revenue' | 'ops' | 'model' | 'proposal'
  title: string
  model: string
  costUsd: number
  ref: string
  verdict: Verdict
  /** the step of the governor loop this action completed */
  step: 'Observe' | 'Propose' | 'Simulate' | 'Approve' | 'Execute' | 'Publish proof' | 'Evaluate'
}

export interface Job {
  id: string
  worldId: string
  title: string
  category: string
  escrowUsd: number
  verifier: string
  status: 'open' | 'in review' | 'challenge window' | 'paid'
  endsAt: number
  claimant?: string
}

export interface Challenge {
  id: string
  worldId: string
  evidenceId: string
  bondUsd: number
  claim: string
  status: 'open' | 'upheld' | 'rejected'
  endsAt: number
  by: string
}

export interface Proposal {
  id: string
  worldId: string
  kind: 'Charter amendment' | 'Model change' | 'Large grant' | 'Novel deployment' | 'Sovereignty' | 'Governor election'
  title: string
  forPct: number
  againstPct: number
  turnoutPct: number
  endsAt: number
  timelockH: number
  status: 'voting' | 'timelock' | 'passed' | 'rejected'
}

export interface App {
  name: string
  module: string
  deployedAt: number
  users30d: number
  revenue30dUsd: number
  audited: boolean
}

export interface World {
  id: string
  name: string
  ticker: string
  template: Template
  stage: Stage
  lore: string
  seededAt: number
  creator: string
  /** where it sits on the Field, in field units */
  x: number
  z: number
  retained30d: number
  uptime90d: number
  security: 'none' | 'scheduled' | 'passed'
  holders: number
  priceUsd: number
  change24h: number
  treasury: Treasury
  governor: Governor
  charter: Charter
  apps: App[]
  chain?: { chainId: number; launchedAt: number }
  /** a coin you seeded this visit */
  mine?: boolean
}
