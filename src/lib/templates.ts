import type { Era, Profile, Template } from './types'

/*
  The world templates a creator can start from, and the three eras every template moves
  through. Objectives are written as deliverables with hard verification, never as
  wallet counts or transaction volume.
*/

export interface Preset {
  id: Template
  name: string
  short: string
  pitch: string
  modules: string[]
  jobs: string[]
  objectives: Record<Era, { title: string; verify: string; budgetUsd: number }>
}

export const presets: Preset[] = [
  {
    id: 'defi',
    name: 'DeFi Kingdom',
    short: 'DeFi',
    pitch: 'Exchange, payments or lending infrastructure with real liquidity and protocol revenue.',
    modules: ['Swap AMM v2', 'Payments router', 'Isolated lending pool', 'Fee splitter'],
    jobs: ['Liquidity analytics', 'Frontend', 'Risk parameters', 'Integration'],
    objectives: {
      genesis: { title: 'Deploy a swap market and payments router from the template registry', verify: 'Contracts verified on Robinhood Chain, first 50 non-creator swaps settled', budgetUsd: 6000 },
      growth: { title: 'Hold $250K of real liquidity and earn protocol revenue', verify: 'Time-weighted liquidity over 30 days and fee revenue paid into the World Treasury', budgetUsd: 22000 },
      sovereignty: { title: 'Pass a security review and fund twelve months of chain operations', verify: 'Published audit report and infrastructure reserve ≥ 12 months of costs', budgetUsd: 40000 },
    },
  },
  {
    id: 'agents',
    name: 'Agent Republic',
    short: 'Agents',
    pitch: 'An agent registry, job escrow, reputation and a marketplace with completed paid jobs.',
    modules: ['Agent registry', 'Job escrow', 'Reputation ledger', 'Marketplace'],
    jobs: ['Agent integration', 'Verifier design', 'Marketplace UX', 'Evaluation set'],
    objectives: {
      genesis: { title: 'Launch an agent registry and escrowed job market', verify: 'Registry and JobEscrow verified; 10 agents registered by distinct operators', budgetUsd: 5000 },
      growth: { title: 'Complete 300 paid jobs released through verifiers', verify: 'JobEscrow releases after challenge windows, repeat clients counted once', budgetUsd: 18000 },
      sovereignty: { title: 'Run the marketplace for 90 days with a reviewed codebase', verify: '99.5% uptime proofs, audit report and a funded infrastructure reserve', budgetUsd: 36000 },
    },
  },
  {
    id: 'game',
    name: 'Game World',
    short: 'Game',
    pitch: 'A playable game, native assets and a functioning player economy.',
    modules: ['Item registry', 'Crafting economy', 'Match settlement', 'Season pass'],
    jobs: ['Level design', 'Art direction', 'Economy balancing', 'Anti-cheat'],
    objectives: {
      genesis: { title: 'Ship a playable first season and native items', verify: 'Public build, item contracts verified, 100 matches settled onchain', budgetUsd: 8000 },
      growth: { title: 'Retain players and run a balanced item economy', verify: 'Day-30 retention ≥ 20% and an item sink that offsets new supply', budgetUsd: 26000 },
      sovereignty: { title: 'Stable seasons and a reviewed economy, ready for its own chain', verify: 'Two completed seasons, audit report and twelve months of runway', budgetUsd: 42000 },
    },
  },
  {
    id: 'creator',
    name: 'Creator Nation',
    short: 'Creator',
    pitch: 'Minting, storefronts, memberships, royalties and creator monetisation.',
    modules: ['Edition minter', 'Storefront', 'Membership passes', 'Royalty router'],
    jobs: ['Storefront theme', 'Creator onboarding', 'Royalty reporting', 'Moderation'],
    objectives: {
      genesis: { title: 'Open storefronts with minting and memberships', verify: 'Minter and storefront verified; 25 creators with a first paid sale', budgetUsd: 4500 },
      growth: { title: 'Pay creators real royalties every week', verify: 'Royalty router payouts to 150 distinct creators over 30 days', budgetUsd: 16000 },
      sovereignty: { title: 'Sustain creator revenue and fund chain operations', verify: 'Audit report, uptime proofs and an infrastructure reserve ≥ 12 months', budgetUsd: 34000 },
    },
  },
  {
    id: 'prediction',
    name: 'Prediction Civilization',
    short: 'Prediction',
    pitch: 'Verifiable markets, research agents and a public forecasting record.',
    modules: ['Market factory', 'Resolution oracle', 'Research desk', 'Forecast ledger'],
    jobs: ['Resolution sources', 'Research agents', 'Market design', 'Calibration'],
    objectives: {
      genesis: { title: 'Launch markets with verifiable resolution', verify: 'Market factory verified; first 20 markets resolved against named sources', budgetUsd: 5500 },
      growth: { title: 'Publish a calibrated forecasting record', verify: 'Brier score over 200 resolved markets and fee revenue to the treasury', budgetUsd: 20000 },
      sovereignty: { title: 'Run disputes and resolution at chain scale', verify: 'Audit report, zero unresolved disputes over 90 days, twelve months of runway', budgetUsd: 38000 },
    },
  },
  {
    id: 'frontier',
    name: 'Open Frontier',
    short: 'Frontier',
    pitch: 'Describe a custom world; the Charter Compiler proposes measurable milestones.',
    modules: ['Governance kit', 'Payments router', 'Bounty board', 'Custom (reviewed)'],
    jobs: ['Research', 'Prototyping', 'Community', 'Security'],
    objectives: {
      genesis: { title: 'Deliver the first usable product named in the charter', verify: 'Deployment verified against the compiled deliverable and a public demo', budgetUsd: 6000 },
      growth: { title: 'Reach the usage and revenue targets set in the charter', verify: 'Retained users and treasury revenue measured by the ObjectiveVerifier', budgetUsd: 20000 },
      sovereignty: { title: 'Prove stable operation and fund a dedicated chain', verify: 'Audit report, uptime proofs and twelve months of infrastructure runway', budgetUsd: 38000 },
    },
  },
]

export const preset = (t: Template) => presets.find((p) => p.id === t)!

export const eras: { id: Era; name: string; days: string; blurb: string }[] = [
  { id: 'genesis', name: 'Genesis', days: '7 days', blurb: 'Core contracts, the world site and a first usable product.' },
  { id: 'growth', name: 'Growth', days: '30 days', blurb: 'Retained users, meaningful economic actions and revenue.' },
  { id: 'sovereignty', name: 'Sovereignty', days: '90 days or later', blurb: 'Security review, stable operation and runway for a dedicated chain.' },
]

/** Model routing by profile. Names are illustrative placeholders for approved providers. */
export const profiles: { id: Profile; name: string; blurb: string; capUsd: number; roles: Record<string, string> }[] = [
  {
    id: 'fast',
    name: 'Fast',
    blurb: 'Inexpensive models for moderation, support and routine operations.',
    capUsd: 40,
    roles: { Planning: 'Relay Mini', Coding: 'Forge Coder S', 'Security review': 'Sentinel Lite', Community: 'Relay Mini', Visual: 'Prism Sketch' },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    blurb: 'Stronger planning and coding inside a moderate compute budget.',
    capUsd: 140,
    roles: { Planning: 'Meridian M', Coding: 'Forge Coder 2', 'Security review': 'Sentinel Audit', Community: 'Relay Mini', Visual: 'Prism Vision' },
  },
  {
    id: 'frontier',
    name: 'Frontier',
    blurb: 'The most capable approved models, with a larger compute reserve.',
    capUsd: 420,
    roles: { Planning: 'Meridian XL', Coding: 'Forge Coder XL', 'Security review': 'Sentinel Audit Pro', Community: 'Meridian M', Visual: 'Prism Vision' },
  },
]
