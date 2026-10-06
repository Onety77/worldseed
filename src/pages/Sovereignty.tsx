import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { HARROW_GRADUATES_AT, useGraduations, useWorlds } from '@/lib/sim'
import { criteria, readiness, runwayMonths, SOVEREIGNTY } from '@/lib/rules'
import { ago, clock, date, pct, usd } from '@/lib/format'
import { isTroubled } from '@/lib/world'
import { useField, useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { WorldMark } from '@/components/ui/WorldMark'
import { Meter, Ticks } from '@/components/ui/bits'
import { Ticking } from '@/components/motion/Ticking'

const bars = [
  { label: 'Retained users', need: `${SOVEREIGNTY.retained30d.toLocaleString()} over 30 days` },
  { label: 'Protocol revenue', need: `${usd(SOVEREIGNTY.revenue30dUsd)} over 30 days` },
  { label: 'Security review', need: 'Independent, published' },
  { label: 'Uptime', need: `${SOVEREIGNTY.uptime90d}% over 90 days` },
  { label: 'Runway', need: `${SOVEREIGNTY.runwayMonths} months of chain costs` },
]

export function SovereigntyLens() {
  useTitle('Sovereignty')
  useFieldView({ kind: 'coast' })
  const detail = useCallback((w: World) => (w.stage === 'realm' ? { text: pct(readiness(w)), tone: isTroubled(w) ? ('red' as const) : readiness(w) > 0.95 ? ('green' as const) : undefined } : w.stage === 'sovereign' ? { text: 'L3' } : null), [])
  useLabels(detail)
  const worlds = useWorlds()
  const realms = worlds.filter((w) => w.stage === 'realm').sort((a, b) => readiness(b) - readiness(a))
  const sovereign = worlds.filter((w) => w.stage === 'sovereign').sort((a, b) => (b.chain?.launchedAt ?? 0) - (a.chain?.launchedAt ?? 0))

  return (
    <Panel label="Sovereignty" rest={0.5}>
      <PanelHead>
        <h1 className="text-h2">Sovereignty</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">No world is given a chain. It earns one by clearing five bars, then its holders vote, then a timelock runs out.</p>
      </PanelHead>

      <Harrow />

      <section className="px-5 pt-6 lg:px-6" aria-labelledby="bar">
        <h2 id="bar" className="text-[15px] font-semibold">The bar</h2>
        <ol className="mt-2 grid gap-px overflow-hidden rounded-[12px] bg-line ring-1 ring-line">
          {bars.map((b, i) => (
            <li key={b.label} className="flex items-baseline gap-3 bg-raised/90 px-3.5 py-2.5">
              <span className="font-mono text-[11px] text-ink-3">{i + 1}</span>
              <span className="flex-1 text-[13.5px] font-medium">{b.label}</span>
              <span className="text-right text-[12.5px] text-ink-2">{b.need}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-3 pt-6 lg:px-4" aria-labelledby="race">
        <div className="flex items-baseline justify-between px-2">
          <h2 id="race" className="text-[15px] font-semibold">The race</h2>
          <p className="text-[12px] text-ink-3">Realms by readiness</p>
        </div>
        <ol className="mt-1.5">
          {realms.map((w, i) => (
            <RaceRow key={w.id} w={w} rank={i + 1} />
          ))}
        </ol>
      </section>

      <section className="px-3 pt-6 pb-8 lg:px-4" aria-labelledby="sov">
        <h2 id="sov" className="px-2 text-[15px] font-semibold">Running their own chains</h2>
        <ul className="mt-1.5">
          {sovereign.map((w) => (
            <li key={w.id}>
              <Link to={`/w/${w.id}`} className="flex items-center gap-3 rounded-[11px] px-2 py-2.5 hover-device:hover:bg-raised">
                <WorldMark world={w} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{w.name}</span>
                  <span className="block text-[12px] text-ink-3">
                    Chain {w.chain?.chainId} · since {w.chain ? date(w.chain.launchedAt) : ''}
                  </span>
                </span>
                <span className="font-mono text-[12px] text-ink-2 tabular">{usd(w.treasury.balanceUsd)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Panel>
  )
}

/** The world about to graduate, live: its runway climbing, then the timelock running out. */
function Harrow() {
  const w = useWorlds().find((x) => x.id === 'harrow')
  const grads = useGraduations()
  const now = useNow()
  const engine = useField()
  if (!w) return null
  const done = w.stage === 'sovereign'
  const grad = grads.find((g) => g.worldId === 'harrow')
  const run = runwayMonths(w)
  return (
    <section aria-label="Graduating now" className="px-5 pt-5 lg:px-6">
      <div className={cn('overflow-hidden rounded-[14px] ring-1 ring-inset', done ? 'ink-card ring-transparent' : 'bg-raised ring-line')} onMouseEnter={() => engine?.setHover('harrow')} onMouseLeave={() => engine?.setHover(null)}>
        <div className="flex items-center gap-3 px-4 pt-4">
          <WorldMark world={w} className="size-10" />
          <div className="min-w-0 flex-1">
            <p className={cn('label', done && 'text-paper/70')}>{done ? `Graduated ${grad ? ago(grad.at, now) : ''} ago` : 'Graduating now'}</p>
            <p className="text-[18px] font-semibold">Harrow</p>
          </div>
          <span className={cn('relative size-2.5 rounded-full', done ? 'bg-sprout' : 'ping bg-green')} />
        </div>
        {done ? (
          <p className="px-4 pt-3 pb-4 text-[13.5px] text-paper/85">
            Chain {w.chain?.chainId} is live. Its forecasters now pay gas in HRW, and the Field has opened water around its hill.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 px-4 pt-4">
              <div>
                <p className="label">Timelock clears in</p>
                <p className="mt-1 font-display text-[28px] font-[560] tracking-[-0.02em] tabular">{clock(Math.max(0, HARROW_GRADUATES_AT - now))}</p>
              </div>
              <div>
                <p className="label">Infra runway</p>
                <p className={cn('mt-1 font-display text-[28px] font-[560] tracking-[-0.02em]', run >= 12 && 'text-green')}>
                  <Ticking value={Math.round(run * 100)} text={`${run.toFixed(2)} mo`} />
                </p>
              </div>
            </div>
            <div className="px-4 pt-3">
              <Ticks met={criteria(w).map((c) => c.met)} />
              <p className="mt-2 text-[12.5px] text-ink-3">Holders voted yes; revenue is still landing in the reserve. When the timelock clears, its Orbit L3 launches.</p>
            </div>
          </>
        )}
        <div className={cn('mt-1 border-t px-4 py-2.5', done ? 'border-paper/15' : 'border-line')}>
          <Link to="/w/harrow" className={cn('flex items-center justify-between text-[13px] font-semibold', done ? 'text-paper' : 'text-ink')}>
            Watch it on the Field <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function RaceRow({ w, rank }: { w: World; rank: number }) {
  const engine = useField()
  const c = criteria(w)
  const troubled = isTroubled(w)
  return (
    <li>
      <Link to={`/w/${w.id}`} onMouseEnter={() => engine?.setHover(w.id)} onMouseLeave={() => engine?.setHover(null)} className="grid grid-cols-[18px_auto_1fr_auto] items-center gap-3 rounded-[11px] px-2 py-2.5 hover-device:hover:bg-raised">
        <span className="font-mono text-[11px] text-ink-3">{rank}</span>
        <WorldMark world={w} className="size-8" />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">{w.name}</span>
            {troubled && <span className="text-[11px] font-semibold text-red">Recovering</span>}
          </span>
          <Meter value={readiness(w)} className="mt-1.5" tone={troubled ? 'red' : undefined} />
        </span>
        <span className="text-right">
          <span className="block font-mono text-[12px] tabular">{pct(readiness(w))}</span>
          <Ticks met={c.map((x) => x.met)} className="mt-1" />
        </span>
      </Link>
    </li>
  )
}
