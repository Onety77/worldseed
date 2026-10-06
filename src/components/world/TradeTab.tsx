import { useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Check, Wallet } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { CURVE_TARGET_USD, SUPPLY, history, holders, market, usePrice, type Range } from '@/lib/market'
import { FEE, quote, trade, wallet } from '@/lib/wallet'
import { ago, change, count, num, pct, price, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { enter, exit } from '@/lib/motion'
import { PriceChart } from '@/components/charts/PriceChart'
import { Meter, Segmented } from '@/components/ui/bits'
import { Ticking } from '@/components/motion/Ticking'
import { connectOpen } from '@/components/wallet/Connect'
import { Card, Section } from './parts'
import { Who } from '@/components/ui/Who'

export function TradeTab({ w }: { w: World }) {
  const live = usePrice(w.id)
  const now = useNow()
  const [range, setRange] = useState<Range>('1D')
  // the history is drawn once per range from where the price stood; the live price extends it
  const [start] = useState(() => ({ at: Date.now(), p: live }))
  const base = useMemo(() => history(w.id, range, start.at, start.p, w.change24h, w.seededAt), [w.id, range, start, w.change24h, w.seededAt])
  const points = useMemo(() => [...base.slice(0, -1), { t: Math.max(now, start.at), p: live }], [base, live, now, start.at])
  const open = points[0].p
  const delta = live / open - 1

  return (
    <>
      <section className="px-5 pt-6 lg:px-6" aria-label="Price">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">{w.ticker} price</p>
            <p className="mt-1 font-display text-[34px] leading-none font-[560] tracking-[-0.02em]">
              <Ticking value={Math.round(live * 1e7)} text={price(live)} />
            </p>
            <p className={cn('mt-1.5 font-mono text-[12.5px] tabular', delta >= 0 ? 'text-green' : 'text-red')}>
              {change(delta)} <span className="text-ink-3">{range === 'All' ? 'since launch' : `over ${range}`}</span>
            </p>
          </div>
          <Segmented label="Chart range" layoutId="chart-range" size="sm" value={range} onChange={setRange} options={(['1D', '7D', '30D', 'All'] as Range[]).map((r) => ({ id: r, name: r }))} />
        </div>
        <PriceChart key={range} points={points} up={delta >= 0} className="mt-4" />
        <dl className="mt-3 grid grid-cols-3 gap-4 border-t border-line pt-3">
          <div>
            <dt className="label">Market cap</dt>
            <dd className="mt-0.5 font-mono text-[13.5px] tabular">{usd(live * SUPPLY)}</dd>
          </div>
          <div>
            <dt className="label">Holders</dt>
            <dd className="mt-0.5 font-mono text-[13.5px] tabular">{count(w.holders)}</dd>
          </div>
          <div>
            <dt className="label">Creator fee</dt>
            <dd className="mt-0.5 font-mono text-[13.5px]">{pct(FEE)} to treasury</dd>
          </div>
        </dl>
      </section>

      <Section title={w.stage === 'seed' ? 'Bonding curve' : 'Liquidity'} note={w.stage === 'seed' ? `${w.ticker} trades on its pons bonding curve until it raises ${usd(CURVE_TARGET_USD)}, then moves to the pons pool.` : `${w.ticker} graduated from its bonding curve and trades in the pons pool, with liquidity locked.`}>
        <Curve w={w} />
      </Section>

      <Section title="Trade">
        <TradeBox w={w} />
      </Section>

      <Section title="Recent trades" note="Live from the pool.">
        <TapeList w={w} />
      </Section>

      <Section title="Top holders">
        <Holders w={w} />
      </Section>
    </>
  )
}

function Curve({ w }: { w: World }) {
  const raised = market.use().raised[w.id]
  if (w.stage === 'seed' && raised !== undefined) {
    const k = raised / CURVE_TARGET_USD
    return (
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[24px] font-[560] tracking-[-0.02em] tabular">{pct(k)}</p>
          <p className="font-mono text-[12px] text-ink-2 tabular">
            {usd(raised)} <span className="text-ink-3">of {usd(CURVE_TARGET_USD)}</span>
          </p>
        </div>
        <div className="relative mt-3">
          <Meter value={k} className="h-2.5" />
        </div>
        <p className="mt-2.5 text-[12.5px] text-ink-3">Every buy on the curve moves it closer. At 100% liquidity seeds the pool and the curve closes.</p>
      </Card>
    )
  }
  const liq = w.holders * 118 + w.treasury.balanceUsd * 0.2
  return (
    <Card className="grid grid-cols-3 gap-px overflow-hidden bg-line">
      {[
        ['Pool liquidity', usd(liq)],
        ['LP locked', 'Until wind-down'],
        ['Venue', w.stage === 'sovereign' ? `pons on chain ${w.chain?.chainId}` : 'pons, Robinhood Chain'],
      ].map(([k, v]) => (
        <div key={k} className="bg-raised px-3.5 py-3">
          <p className="label">{k}</p>
          <p className="mt-1 truncate text-[13.5px] font-semibold">{v}</p>
        </div>
      ))}
    </Card>
  )
}

const buyChips = [25, 100, 500]
const sellChips = [0.25, 0.5, 1]

function TradeBox({ w }: { w: World }) {
  const me = wallet.use()
  usePrice(w.id)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [raw, setRaw] = useState('100')
  const [state, setState] = useState<'idle' | 'confirm' | 'done'>('idle')
  const [last, setLast] = useState<{ tokens: number; usd: number } | null>(null)
  const held = me.holdings[w.id]?.tokens ?? 0
  const amount = Math.max(0, Number(raw.replace(/,/g, '')) || 0)
  const q = amount > 0 ? quote(w, side, amount) : null
  const short = side === 'buy' ? amount > me.cashUsd : amount > held
  const swap = (s: 'buy' | 'sell') => {
    setSide(s)
    setRaw(s === 'buy' ? '100' : held ? String(Math.floor(held / 2)) : '')
    setState('idle')
  }

  const submit = () => {
    if (!me.connected) return connectOpen.set(true)
    if (!q || short) return
    setState('confirm')
    window.setTimeout(() => {
      const r = trade(w, side, amount)
      setLast({ tokens: r.tokens, usd: r.usd })
      setState('done')
      window.setTimeout(() => setState('idle'), 3200)
    }, 1100)
  }

  return (
    <Card className="p-4">
      <Segmented
        label="Buy or sell"
        layoutId="trade-side"
        value={side}
        onChange={swap}
        options={[
          { id: 'buy', name: `Buy ${w.ticker}` },
          { id: 'sell', name: `Sell ${w.ticker}` },
        ]}
      />
      <label htmlFor="trade-amount" className="mt-4 flex items-baseline justify-between text-[13px] font-semibold">
        {side === 'buy' ? 'You pay' : 'You sell'}
        {me.connected && (
          <span className="font-mono text-[11.5px] font-normal text-ink-3">
            {side === 'buy' ? `${usd(me.cashUsd)} available` : `${num(held)} ${w.ticker} held`}
          </span>
        )}
      </label>
      <div className="mt-1.5 flex items-center rounded-control bg-paper ring-1 ring-line-2 ring-inset focus-within:ring-2 focus-within:ring-ink">
        {side === 'buy' && <span className="pl-3.5 font-mono text-[18px] text-ink-3">$</span>}
        <input id="trade-amount" inputMode="decimal" autoComplete="off" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ''))} className="h-12 min-w-0 flex-1 bg-transparent px-2 font-mono text-[18px] outline-none tabular" />
        <span className="pr-3.5 font-mono text-[12px] text-ink-3">{side === 'buy' ? 'USDC' : w.ticker}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {side === 'buy'
          ? buyChips.map((c) => (
              <button key={c} onClick={() => setRaw(String(c))} className="h-7 rounded-full px-3 text-[12px] font-semibold ring-1 ring-line-2 ring-inset hover-device:hover:bg-hover">
                ${c}
              </button>
            ))
          : sellChips.map((c) => (
              <button key={c} disabled={!held} onClick={() => setRaw(String(Math.floor(held * c)))} className="h-7 rounded-full px-3 text-[12px] font-semibold ring-1 ring-line-2 ring-inset hover-device:hover:bg-hover disabled:opacity-40">
                {c === 1 ? 'All' : pct(c)}
              </button>
            ))}
      </div>

      <dl className="mt-4 grid gap-1.5 text-[12.5px]">
        <div className="flex justify-between">
          <dt className="text-ink-3">You receive</dt>
          <dd className="font-mono tabular">{q ? (side === 'buy' ? `${num(q.tokens)} ${w.ticker}` : usd(q.usd)) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-3">Price impact</dt>
          <dd className={cn('font-mono tabular', q && q.impact > 0.03 && 'text-red')}>{q ? `${(q.impact * 100).toFixed(2)}%` : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-3">Creator fee, to the {w.name} treasury</dt>
          <dd className="font-mono tabular">{q ? `$${q.fee.toFixed(2)}` : '—'}</dd>
        </div>
      </dl>

      <button onClick={submit} disabled={me.connected && (!q || short || state !== 'idle')} className={buttonClass(me.connected ? (side === 'buy' ? 'primary' : 'ink') : 'ink', 'lg', 'mt-4 w-full')}>
        {!me.connected ? (
          <>
            <Wallet className="size-4" /> Connect a wallet to trade
          </>
        ) : state === 'confirm' ? (
          <>
            <span className="breathe size-2 rounded-full bg-current" /> Confirm in your wallet…
          </>
        ) : short ? (
          side === 'buy' ? 'Not enough funds' : `You hold ${num(held)} ${w.ticker}`
        ) : (
          `${side === 'buy' ? 'Buy' : 'Sell'} ${w.ticker}`
        )}
      </button>
      <AnimatePresence>
        {state === 'done' && last && (
          <m.p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exit }} transition={enter} role="status">
            <Check className="size-4 text-green" strokeWidth={2.6} />
            {side === 'buy' ? 'Bought' : 'Sold'} {num(last.tokens)} {w.ticker} for {usd(last.usd)}.
          </m.p>
        )}
      </AnimatePresence>
      {me.connected && held > 0 && state !== 'done' && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          You hold <span className="font-mono text-ink">{num(held)} {w.ticker}</span>, worth {usd(held * (market.get().price[w.id] ?? 0))}.
        </p>
      )}
    </Card>
  )
}

function TapeList({ w }: { w: World }) {
  const tape = market.use().tape[w.id] ?? []
  const now = useNow()
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[52px_1fr_1fr_56px] gap-3 border-b border-line px-3.5 py-2 label">
        <span>Side</span>
        <span>Amount</span>
        <span>Who</span>
        <span className="text-right">When</span>
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {tape.slice(0, 10).map((t) => (
            <m.li
              key={t.id}
              className={cn('grid grid-cols-[52px_1fr_1fr_56px] items-center gap-3 overflow-hidden border-b border-line px-3.5 text-[12.5px] last:border-0', t.who === 'you' && 'bg-sprout-soft')}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 38, opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exit }}
              transition={enter}
            >
              <span className={cn('font-mono text-[11px] font-medium uppercase', t.side === 'buy' ? 'text-green' : 'text-red')}>{t.side}</span>
              <span className="truncate font-mono tabular">{usd(t.usd)}</span>
              <Who handle={t.who} className={cn('truncate font-mono text-[11.5px]', t.who === 'you' ? 'font-semibold text-ink' : 'text-ink-3')} />
              <span className="text-right font-mono text-[11px] text-ink-3 tabular">{ago(t.at, now)}</span>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  )
}

function Holders({ w }: { w: World }) {
  const list = useMemo(() => holders(w.id, w.stage, w.creator), [w.id, w.stage, w.creator])
  const me = wallet.use()
  const mine = me.holdings[w.id]?.tokens ?? 0
  const rows = mine > 0 ? [...list, { who: 'You', share: mine / SUPPLY, note: 'you' }].sort((a, b) => b.share - a.share) : list
  const top = rows[0].share
  return (
    <Card className="divide-y divide-line">
      {rows.map((h) => (
        <div key={h.who} className={cn('grid grid-cols-[1fr_88px_56px] items-center gap-3 px-3.5 py-2.5', h.note === 'you' && 'bg-sprout-soft')}>
          <span className="min-w-0 truncate text-[13px]">
            <Who handle={h.who} className={cn(h.note && h.note !== 'you' ? 'font-semibold' : 'font-mono text-[12px]', h.note === 'you' && 'font-semibold')} />
            {h.note && h.note !== 'you' && <span className="ml-1.5 text-[11.5px] text-ink-3">{h.note}</span>}
          </span>
          <Meter value={h.share / top} />
          <span className="text-right font-mono text-[12px] tabular">{h.share < 0.0001 ? '<0.01%' : pct(h.share, h.share < 0.1 ? 2 : 1)}</span>
        </div>
      ))}
    </Card>
  )
}
