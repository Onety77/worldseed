import { createStore } from './store'
import { seeded } from './seeded'
import { worlds as sample, loadedAt } from '@/data/worlds'

/*
  Sample market data for every world's token: a live price that wanders a little, a
  history to chart, a tape of recent trades, the top holders and, for seeds, how full the
  pons bonding curve is. All invented, all deterministic from each world's id except the
  live wander.
*/

export const SUPPLY = 1_000_000_000
export const CURVE_TARGET_USD = 69_000 // raised on the bonding curve before the token moves to the pons pool

export interface Tape {
  id: string
  side: 'buy' | 'sell'
  tokens: number
  usd: number
  at: number
  who: string
}

interface Market {
  price: Record<string, number>
  tape: Record<string, Tape[]>
  /** how much each world's curve has raised, for seeds */
  raised: Record<string, number>
}

const who = ['0x31c…9a2e', '0x8d0…41f7', 'agent:quill-7', '0xa4e…0c19', 'kofi.builds', '0x5be…77d3', 'lin.dev', '0xf02…b8a1', 'agent:sable-ops', '0x9c7…12e4']

function initialTape(id: string, price: number): Tape[] {
  const r = seeded(id + '-tape')
  let at = loadedAt - 20_000
  return Array.from({ length: 14 }, (_, i) => {
    at -= Math.floor(20_000 + r() * 400_000)
    const usd = Math.round((15 + r() ** 2 * 900) * 100) / 100
    return { id: `${id}-t${i}`, side: r() > 0.42 ? 'buy' : 'sell', tokens: usd / price, usd, at, who: who[Math.floor(r() * who.length)] }
  })
}

export const market = createStore<Market>({
  price: Object.fromEntries(sample.map((w) => [w.id, w.priceUsd])),
  tape: Object.fromEntries(sample.map((w) => [w.id, initialTape(w.id, w.priceUsd)])),
  raised: Object.fromEntries(sample.filter((w) => w.stage === 'seed').map((w) => [w.id, Math.round(CURVE_TARGET_USD * (0.28 + seeded(w.id + '-curve')() * 0.62))])),
})

/** A newly planted token starts trading on its curve. */
export function listToken(id: string, price: number) {
  market.set((m) => ({ price: { ...m.price, [id]: price }, tape: { ...m.tape, [id]: [] }, raised: { ...m.raised, [id]: 0 } }))
}

export const priceOf = (id: string) => market.get().price[id] ?? 0
export const usePrice = (id: string) => market.use().price[id] ?? 0

export function recordTrade(id: string, side: 'buy' | 'sell', tokens: number, usd: number, impact: number, by: string) {
  market.set((m) => {
    const p = m.price[id] ?? 0
    const next = p * (side === 'buy' ? 1 + impact : 1 - impact)
    const t: Tape = { id: `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, side, tokens, usd, at: Date.now(), who: by }
    const raised = id in m.raised && side === 'buy' ? { ...m.raised, [id]: Math.min(CURVE_TARGET_USD * 0.99, m.raised[id] + usd) } : m.raised
    return { price: { ...m.price, [id]: next }, tape: { ...m.tape, [id]: [t, ...(m.tape[id] ?? [])].slice(0, 40) }, raised }
  })
}

/** the market's own wander: someone somewhere trades every few seconds */
let timer: number | undefined
export function startMarket(ids: () => string[]) {
  if (timer !== undefined) return
  const r = seeded('market-live')
  const loop = () => {
    if (!document.hidden) {
      const list = ids()
      const id = list[Math.floor(r() * list.length)]
      const side = r() > 0.45 ? 'buy' : 'sell'
      const usd = Math.round((10 + r() ** 2 * 600) * 100) / 100
      const p = priceOf(id) || 0.001
      recordTrade(id, side, usd / p, usd, usd / 250_000, who[Math.floor(r() * who.length)])
    }
    timer = window.setTimeout(loop, 1800 + Math.random() * 2200)
  }
  timer = window.setTimeout(loop, 1500)
}

export type Range = '1D' | '7D' | '30D' | 'All'
const span: Record<Range, number> = { '1D': 86_400_000, '7D': 7 * 86_400_000, '30D': 30 * 86_400_000, All: 0 }

/** A price history ending at the live price, deterministic per world and range. */
export function history(id: string, range: Range, now: number, live: number, change24h: number, seededAt: number) {
  const n = 96
  const len = range === 'All' ? Math.max(86_400_000, now - seededAt) : span[range]
  const r = seeded(`${id}-${range}`)
  // walk backwards from now; bias the walk so the 1D chart matches the 24h change
  const drift = range === '1D' ? Math.log(1 + change24h) / n : (r() - 0.45) * 0.02
  const vol = range === '1D' ? 0.008 : range === '7D' ? 0.016 : 0.028
  const pts: { t: number; p: number }[] = []
  let p = live
  for (let i = n; i >= 0; i--) {
    pts.unshift({ t: now - (len * (n - i)) / n, p })
    p = p / Math.exp(drift + (r() - 0.5) * vol * 2)
  }
  return pts
}

export interface Holder {
  who: string
  share: number
  note?: string
}

export function holders(id: string, stage: string, creator: string): Holder[] {
  const r = seeded(id + '-holders')
  const list: Holder[] = [
    stage === 'seed' ? { who: 'Bonding curve', share: 0.42 + r() * 0.2, note: 'pons' } : { who: 'pons pool', share: 0.18 + r() * 0.1, note: 'liquidity' },
    { who: 'World Treasury', share: 0.08 + r() * 0.06, note: 'contract' },
    { who: creator, share: 0.03 + r() * 0.04, note: 'creator' },
  ]
  const start = Math.floor(r() * who.length)
  for (let i = 0; i < 5; i++) list.push({ who: who[(start + i * 3) % who.length], share: 0.006 + r() * 0.02 })
  return list.sort((a, b) => b.share - a.share)
}
