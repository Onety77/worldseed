import { createStore } from './store'
import type { World } from './types'
import { market, priceOf, recordTrade } from './market'
import { notify } from './inbox'

/*
  A pretend wallet, for the prototype. Connecting gives you a sample address with test
  funds and a few holdings, so every screen that depends on "you" has something to show.
  Nothing leaves the page.
*/

export interface MyTrade {
  id: string
  worldId: string
  side: 'buy' | 'sell'
  tokens: number
  usd: number
  at: number
}

interface Wallet {
  connected: boolean
  provider: string
  address: string
  cashUsd: number
  holdings: Record<string, { tokens: number; costUsd: number }>
  trades: MyTrade[]
}

const start: Wallet = { connected: false, provider: '', address: '', cashUsd: 0, holdings: {}, trades: [] }
export const wallet = createStore<Wallet>(start)
/** jobs you have claimed */
export const claimed = createStore<string[]>([])

export const FEE = 0.01 // the creator fee on every trade; it funds the World Treasury

export function connect(provider: string) {
  wallet.set({
    connected: true,
    provider,
    address: '0x7a3f9c41e2d8b06f5a1c9e37d4b28f6a0c5eb21c',
    cashUsd: 2480,
    // sample positions, so the portfolio has something in it
    holdings: {
      harrow: { tokens: 21_400, costUsd: 940 },
      marrowind: { tokens: 38_000, costUsd: 690 },
      lattice: { tokens: 2_150, costUsd: 760 },
    },
    trades: [],
  })
  notify({ kind: 'wallet', title: 'Wallet connected', body: `${provider} · sample funds of $2,480 for this prototype.`, href: '/you' })
}

export function disconnect() {
  wallet.set(start)
  claimed.set([])
}

/** How a trade of this size would fill: what you get and how far it moves the price. */
export function quote(w: World, side: 'buy' | 'sell', amount: number) {
  const p = priceOf(w.id)
  // thinner markets move more: a seed is still on its bonding curve
  const depth = w.stage === 'seed' ? 40_000 : w.stage === 'realm' ? 400_000 : 2_500_000
  const usdIn = side === 'buy' ? amount : amount * p
  const impact = Math.min(0.25, usdIn / depth)
  const fee = usdIn * FEE
  if (side === 'buy') return { tokens: ((usdIn - fee) / p) * (1 - impact / 2), usd: usdIn, impact, fee, price: p }
  return { tokens: amount, usd: (usdIn - fee) * (1 - impact / 2), impact, fee, price: p }
}

export function trade(w: World, side: 'buy' | 'sell', amount: number) {
  const q = quote(w, side, amount)
  const s = wallet.get()
  const h = s.holdings[w.id] ?? { tokens: 0, costUsd: 0 }
  const next =
    side === 'buy'
      ? { tokens: h.tokens + q.tokens, costUsd: h.costUsd + q.usd }
      : { tokens: Math.max(0, h.tokens - q.tokens), costUsd: h.tokens ? h.costUsd * (1 - q.tokens / h.tokens) : 0 }
  const t: MyTrade = { id: `me-${Date.now()}`, worldId: w.id, side, tokens: q.tokens, usd: q.usd, at: Date.now() }
  wallet.set({ ...s, cashUsd: s.cashUsd + (side === 'buy' ? -q.usd : q.usd), holdings: { ...s.holdings, [w.id]: next }, trades: [t, ...s.trades] })
  recordTrade(w.id, side, q.tokens, q.usd, q.impact, 'you')
  notify({ kind: 'trade', title: `${side === 'buy' ? 'Bought' : 'Sold'} ${w.ticker}`, body: `${Math.round(q.tokens).toLocaleString('en-US')} ${w.ticker} for $${q.usd.toFixed(2)}. $${q.fee.toFixed(2)} went to the ${w.name} treasury.`, worldId: w.id, href: `/w/${w.id}#trade` })
  return q
}

export function claimJob(id: string, title: string, worldId: string) {
  claimed.set((l) => (l.includes(id) ? l : [...l, id]))
  notify({ kind: 'job', title: 'Job claimed', body: `“${title}”. Submit your work before the window closes; payment releases after verification.`, worldId, href: `/w/${worldId}#work` })
}

export const usePortfolio = () => {
  const s = wallet.use()
  market.use()
  const rows = Object.entries(s.holdings)
    .filter(([, h]) => h.tokens > 0.5)
    .map(([id, h]) => ({ id, ...h, value: h.tokens * priceOf(id) }))
    .sort((a, b) => b.value - a.value)
  const value = rows.reduce((t, r) => t + r.value, 0)
  const cost = rows.reduce((t, r) => t + r.costUsd, 0)
  return { ...s, rows, value, pnl: value - cost }
}
