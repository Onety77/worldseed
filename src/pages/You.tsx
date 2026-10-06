import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, LogOut, Plus, Wallet } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useWorlds } from '@/lib/sim'
import { disconnect, usePortfolio, claimed } from '@/lib/wallet'
import { filed, jobs, votes, useProposals } from '@/lib/civic'
import { priceOf } from '@/lib/market'
import { ago, change, hash, num, price, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { WorldMark } from '@/components/ui/WorldMark'
import { Stat } from '@/components/ui/bits'
import { Ticking } from '@/components/motion/Ticking'
import { connectOpen } from '@/components/wallet/Connect'

export function YouPage() {
  useTitle('You')
  useFieldView({ kind: 'atlas' })
  const me = usePortfolio()
  const held = useMemo(() => new Set(me.rows.map((r) => r.id)), [me.rows])
  const detail = useCallback((w: World) => (held.has(w.id) ? { text: 'held', tone: 'green' as const } : w.mine ? { text: 'yours', tone: 'green' as const } : null), [held])
  useLabels(detail)

  return (
    <Panel label="You" rest={0.5}>
      {me.connected ? <Connected /> : <NotConnected />}
    </Panel>
  )
}

function NotConnected() {
  return (
    <div className="px-5 pt-5 pb-10 lg:px-6">
      <p className="label">You</p>
      <h1 className="mt-1 text-h2">Your worlds, in one place</h1>
      <p className="mt-2 text-[14px] text-ink-2">Connect a wallet to see what you hold, the worlds you seeded, your votes, your bonds and the jobs you've taken on.</p>
      <button onClick={() => connectOpen.set(true)} className={buttonClass('ink', 'lg', 'mt-5 w-full')}>
        <Wallet className="size-4" /> Connect a wallet
      </button>
      <ul className="mt-6 grid gap-2">
        {['Holdings across every world, valued live', 'Worlds you seeded and how their governors are doing', 'Votes you cast and challenges you bonded', 'Jobs you claimed and when they pay'].map((t) => (
          <li key={t} className="flex items-center gap-3 rounded-[12px] px-3.5 py-3 text-[13.5px] text-ink-2 ring-1 ring-line ring-inset">
            <span className="size-1.5 rounded-full bg-ink-4" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Connected() {
  const me = usePortfolio()
  const worlds = useWorlds()
  const find = (id: string) => worlds.find((w) => w.id === id)
  const mine = worlds.filter((w) => w.mine)

  return (
    <>
      <PanelHead>
        <div className="flex items-center gap-3">
          <Identicon address={me.address} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[13px] font-medium">{hash(me.address, 6, 4)}</p>
            <p className="text-[12px] text-ink-3">{me.provider} · Robinhood Chain</p>
          </div>
          <button onClick={disconnect} className={buttonClass('ghost', 'sm', '-mr-2')}>
            <LogOut className="size-3.5" /> Disconnect
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-4">
          <Stat label="Holdings">
            <Ticking value={Math.round(me.value)} text={usd(me.value)} />
          </Stat>
          <Stat label="Profit / loss">
            <span className={cn(me.pnl >= 0 ? 'text-green' : 'text-red')}>
              {me.pnl >= 0 ? '+' : '−'}
              {usd(Math.abs(me.pnl))}
            </span>
          </Stat>
          <Stat label="Cash">{usd(me.cashUsd)}</Stat>
        </dl>
      </PanelHead>

      <section className="px-3 pt-4 lg:px-4" aria-labelledby="holdings">
        <h2 id="holdings" className="px-2 text-[15px] font-semibold">
          Holdings
        </h2>
        <ul className="mt-1">
          {me.rows.map((r) => {
            const w = find(r.id)
            if (!w) return null
            const gain = r.costUsd ? r.value / r.costUsd - 1 : 0
            return (
              <li key={r.id}>
                <Link to={`/w/${w.id}#trade`} className="flex items-center gap-3 rounded-[11px] px-2 py-2.5 hover-device:hover:bg-raised">
                  <WorldMark world={w} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{w.name}</span>
                    <span className="block font-mono text-[11.5px] text-ink-3">
                      {num(r.tokens)} {w.ticker} at {price(priceOf(w.id))}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[13px] tabular">{usd(r.value)}</span>
                    <span className={cn('block font-mono text-[11.5px] tabular', gain >= 0 ? 'text-green' : 'text-red')}>{change(gain)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
          {!me.rows.length && <li className="px-2 py-4 text-[13px] text-ink-3">Nothing held yet. Open any world and trade its token.</li>}
        </ul>
      </section>

      <section className="px-3 pt-5 lg:px-4" aria-labelledby="seeded">
        <h2 id="seeded" className="px-2 text-[15px] font-semibold">
          Seeded by you
        </h2>
        {mine.length ? (
          <ul className="mt-1">
            {mine.map((w) => (
              <li key={w.id}>
                <Link to={`/w/${w.id}`} className="flex items-center gap-3 rounded-[11px] px-2 py-2.5 hover-device:hover:bg-raised">
                  <WorldMark world={w} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{w.name}</span>
                    <span className="block text-[12px] text-ink-3">Genesis era · governor working</span>
                  </span>
                  <ArrowRight className="size-4 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Link to="/seed" className="mx-2 mt-2 flex items-center justify-between rounded-[12px] px-3.5 py-3 text-[13.5px] ring-1 ring-line ring-inset hover-device:hover:bg-raised">
            <span className="text-ink-2">You haven't seeded a world yet.</span>
            <span className="flex items-center gap-1 font-semibold">
              <Plus className="size-3.5" /> Seed one
            </span>
          </Link>
        )}
      </section>

      <Activity />
    </>
  )
}

/** Everything you did this session, newest first. */
function Activity() {
  const me = usePortfolio()
  const v = votes.use()
  const props = useProposals()
  const mineCh = filed.use()
  const jobIds = claimed.use()
  const worlds = useWorlds()
  const now = useNow()
  const name = (id: string) => worlds.find((w) => w.id === id)?.name ?? id
  const ticker = (id: string) => worlds.find((w) => w.id === id)?.ticker ?? ''
  const rows = [
    ...me.trades.map((t) => ({ id: t.id, at: t.at, title: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${num(t.tokens)} ${ticker(t.worldId)}`, note: `${usd(t.usd)} · ${name(t.worldId)}`, href: `/w/${t.worldId}#trade` })),
    ...Object.entries(v).map(([pid, side]) => {
      const p = props.find((x) => x.id === pid)
      return { id: pid, at: 0, title: `Voted ${side}`, note: p ? `${p.title} · ${name(p.worldId)}` : '', href: p ? `/w/${p.worldId}#governance` : '/governance' }
    }),
    ...mineCh.map((c) => ({ id: c.id, at: c.endsAt - 72 * 3_600_000, title: `Bonded ${usd(c.bondUsd)} on a challenge`, note: `${c.claim} · ${name(c.worldId)}`, href: `/w/${c.worldId}#governance` })),
    ...jobIds.map((id) => {
      const j = jobs.find((x) => x.id === id)
      return { id, at: 0, title: 'Claimed a job', note: j ? `${j.title} · ${usd(j.escrowUsd)} in escrow` : '', href: j ? `/w/${j.worldId}#work` : '/jobs' }
    }),
  ].sort((a, b) => b.at - a.at)

  return (
    <section className="px-3 pt-5 pb-10 lg:px-4" aria-labelledby="activity">
      <h2 id="activity" className="px-2 text-[15px] font-semibold">
        Your activity
      </h2>
      {rows.length ? (
        <ul className="mt-1">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={r.href} className="block rounded-[11px] px-2 py-2.5 hover-device:hover:bg-raised">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold">{r.title}</span>
                  {r.at > 0 && <span className="shrink-0 font-mono text-[11px] text-ink-3">{ago(r.at, now)} ago</span>}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{r.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 pt-2 text-[13px] text-ink-3">Trades, votes, challenges and claimed jobs will show up here.</p>
      )}
    </section>
  )
}

/** A mark drawn from your address, so you recognise yourself. */
export function Identicon({ address, className }: { address: string; className?: string }) {
  const n = parseInt(address.slice(2, 10), 16) || 1
  const hue = n % 360
  const rings = 2 + (n % 3)
  return (
    <svg viewBox="0 0 32 32" className={cn('size-10 shrink-0 rounded-[11px]', className)} aria-hidden>
      <rect width="32" height="32" fill={`hsl(${hue} 30% 88%)`} />
      {Array.from({ length: rings }, (_, i) => (
        <circle key={i} cx={10 + ((n >> (i * 3)) % 12)} cy={10 + ((n >> (i * 4 + 2)) % 12)} r={14 - i * 4} fill="none" stroke={`hsl(${hue} 25% 25%)`} strokeOpacity={0.35 + i * 0.15} strokeWidth="1.2" />
      ))}
      <circle cx="16" cy="16" r="3" fill="var(--sprout)" stroke="var(--ink)" strokeOpacity=".4" />
    </svg>
  )
}
