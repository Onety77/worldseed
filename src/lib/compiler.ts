import type { Template } from './types'
import { preset } from './templates'
import { seeded } from './seeded'

/*
  The Charter Compiler, in miniature. It reads what a creator wrote and turns it into a
  milestone the ObjectiveVerifier can check: a deliverable, hard verification, a deadline,
  a budget, what the governor may and may not do, and what happens on failure.

  It refuses vanity metrics (holder counts, volume, price) because those can be bought,
  and swaps them for retained users or revenue. A production compiler would be a model
  with a schema; this one is rules, so the demo is deterministic.
*/

export interface Compiled {
  deliverable: string
  verification: string[]
  deadlineDays: number
  budgetUsd: number
  allowed: string[]
  prohibited: string[]
  failure: string
  notes: string[]
}

const VANITY = /\b(holders?|volume|transactions?|txs?|price|market ?cap|mcap|followers|wallets? connected)\b/i

const checks: [RegExp, string][] = [
  [/\b(users?|players?|members?|readers?|customers?|people)\b/i, 'Retained users: distinct wallets active in 3 of the last 4 weeks, sybil-filtered'],
  [/\b(revenue|fees?|sales?|earn|paid|pay(s|ing)?|royalt)/i, 'Revenue paid into the World Treasury, net of anything routed from the treasury itself'],
  [/\b(deploy|launch|ship|build|contract|app|market|store|registry|game)\b/i, 'Contracts verified on Robinhood Chain and a public, working build'],
  [/\b(report|research|publish|stud(y|ies)|paper|dataset|data)\b/i, 'Each output hashed onchain, with reader scores from distinct holders'],
  [/\b(audit|security|review)\b/i, 'Published report from an approved independent reviewer'],
  [/\b(uptime|stable|reliab)/i, 'Uptime proofs from two independent monitors'],
  [/\b(jobs?|bount(y|ies)|tasks?|agents?)\b/i, 'Escrow released only after a verifier passes the work and the challenge window closes'],
]

function parseDays(text: string) {
  const m = text.match(/(\d+)\s*(day|days|d|week|weeks|wk|month|months|mo)\b/i)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  return unit.startsWith('w') ? n * 7 : unit.startsWith('mo') || unit === 'month' ? n * 30 : n
}

/** A budget: "$8k budget", "budget of $8,000", "with a $5k budget". Other dollar figures are targets, not budgets. */
function parseUsd(text: string) {
  const amt = String.raw`\$\s?(\d+(?:[.,]\d+)?)\s*(k|m)?`
  const m = text.match(new RegExp(`${amt}\\s*budget|budget\\s*(?:of\\s*)?${amt}|(?:with|for|using)\\s+(?:a\\s+)?${amt}`, 'i'))
  if (!m) return null
  const g = m.slice(1).filter((x) => x !== undefined)
  const n = Number(g[0].replace(',', ''))
  const mult = (g[1] ?? '').toLowerCase()
  return Math.round(n * (mult === 'k' ? 1000 : mult === 'm' ? 1_000_000 : 1))
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function compile(text: string, template: Template): Compiled {
  const p = preset(template)
  const t = clean(text)
  const notes: string[] = []

  // the deliverable: the first clause, without time and money phrases
  let first = t.split(/(?<=[.;!?])\s|\n/)[0] ?? t
  first = first.replace(/\b(within|in|by)\s+\d+\s*(days?|weeks?|months?|d|wk|mo)\b/gi, '').replace(/(with|for|using)\s+(a\s+)?\$\s?\d[\d.,]*\s*(k|m)?(\s+budget)?/gi, '')
  first = first.replace(/,?\s*(an?\s+)?\$\s?\d[\d.,]*\s*(k|m)?\b(\s+budget)?/gi, '').replace(/,?\s*\d[\d.,]*\s*(k|m)?\s*(usd|dollars)\b(\s+budget)?/gi, '')
  first = first.replace(/^(we|i|the world|this world)\s+(will|want to|should|must|plan to)\s+/i, '').replace(/\s+,/g, ',').replace(/[\s,.;!?]+$/, '')
  // targets that can be bought are rewritten into ones that can't
  first = first.replace(/(\$\s?)?\b\d[\d.,]*\s*(k|m)?\s+(holders?|wallets?)\b/gi, 'retained users').replace(/(\$\s?)?\b\d[\d.,]*\s*(k|m)?\s+(in\s+|trading\s+)?volume\b/gi, 'real fee revenue')
  first = first.replace(/\bholders\b/gi, 'retained users').replace(/\b(trading )?volume\b/gi, 'fee revenue')
  const deliverable = capital(clean(first)) || p.objectives.genesis.title

  const verification = checks.filter(([re]) => re.test(t)).map(([, v]) => v)
  if (VANITY.test(t)) {
    notes.push('Holder counts, volume and price can be bought, so the compiler measures retained users and revenue instead.')
    if (!verification.some((v) => v.startsWith('Retained'))) verification.unshift(checks[0][1])
  }
  if (!verification.length) {
    verification.push('Deployment verified against this deliverable, plus a public demo')
    notes.push('No measurable outcome found, so the compiler fell back to a verified deployment. Name users, revenue or an output to make it stricter.')
  }

  const days = parseDays(t)
  const deadlineDays = Math.min(120, Math.max(7, days ?? 14))
  if (days === null) notes.push('No deadline given; set to 14 days.')
  else if (days < 7) notes.push('Deadlines shorter than 7 days are raised to 7.')

  const usd = parseUsd(t)
  const budgetUsd = Math.min(60_000, Math.max(1000, usd ?? p.objectives.genesis.budgetUsd))
  if (usd === null) notes.push(`No budget given; set from the ${p.name} template.`)
  else if (usd > 60_000) notes.push('Budgets above $60K need a separate grant vote, so this was capped.')

  return {
    deliverable,
    verification: verification.slice(0, 3),
    deadlineDays,
    budgetUsd,
    allowed: [`Deploy ${p.modules.slice(0, 2).join(' and ')} from the template registry`, `Fund jobs in ${p.jobs.slice(0, 2).join(' and ').toLowerCase()}`, `Spend up to $${budgetUsd.toLocaleString('en-US')} from the build budget`],
    prohibited: ['Anything outside this deliverable without a holder vote', 'Paying itself, the creator or related wallets for the work'],
    failure: 'If unmet by the deadline, holders choose a recovery amendment, a new governor, a takeover or a wind-down.',
    notes,
  }
}

/** A charter's fingerprint: what gets stored in the CharterRegistry. */
export function charterHash(doc: unknown) {
  const r = seeded(JSON.stringify(doc))
  return '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('')
}
