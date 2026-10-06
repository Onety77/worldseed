import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { m } from 'motion/react'
import { ArrowRight, Rows3, Table2 } from 'lucide-react'
import type { Stage, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useMedia } from '@/lib/useMedia'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { HARROW_GRADUATES_AT, useEvidence, useWorlds } from '@/lib/sim'
import { criteria, readiness, runwayMonths } from '@/lib/rules'
import { preset } from '@/lib/templates'
import { clock, count, num, pct, price, span, usd } from '@/lib/format'
import { currentEra, eraName, genesisLeft, isTroubled, treasuryTotal } from '@/lib/world'
import { buttonClass } from '@/lib/button'
import { RISE, enter, surface } from '@/lib/motion'

let heroSeen = false
import { useCover, useField, useFieldView, fieldFilter } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { StageFilter } from '@/components/shell/StageFilter'
import { WorldMark } from '@/components/ui/WorldMark'
import { Delta, Meter, Segmented, StageTag, Ticks } from '@/components/ui/bits'
import { CountUp } from '@/components/motion/CountUp'
import { usePrice } from '@/lib/market'

type Sort = 'ready' | 'treasury' | 'new'

const groups: { stage: Stage; title: string; note: string }[] = [
  { stage: 'sovereign', title: 'Sovereign', note: 'Earned their own chain' },
  { stage: 'realm', title: 'Realms', note: 'Building toward sovereignty' },
  { stage: 'seed', title: 'Seeds', note: 'In their 7-day Genesis era' },
]

export function WorldsLens() {
  useTitle()
  useFieldView({ kind: 'atlas' })
  const detail = useCallback((w: World) => (w.stage === 'realm' ? { text: pct(readiness(w)), tone: isTroubled(w) ? ('red' as const) : undefined } : w.stage === 'sovereign' ? { text: 'L3' } : null), [])
  useLabels(detail)
  const wide = useMedia('(min-width: 1024px)')
  const [ledger, setLedger] = useState(false)

  return (
    <>
      {wide && !ledger && <Hero />}
      <Panel label="Worlds" width={ledger && wide ? 'xl' : 'md'} rest={0.5}>
        {!wide && <Hero compact />}
        <WorldList ledger={ledger && wide} setLedger={setLedger} wide={wide} />
      </Panel>
    </>
  )
}

/** The pitch, standing over the Field on wide screens and at the top of the sheet on phones. */
function Hero({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useCover(ref, 'top', !compact)
  const worlds = useWorlds()
  const ev = useEvidence()
  const now = useNow()
  const harrow = worlds.find((w) => w.id === 'harrow')
  const today = ev.filter((e) => now - e.at < 86_400_000).length
  const left = HARROW_GRADUATES_AT - now

  return (
    <m.div
      ref={ref}
      className={cn(compact ? 'px-5 pt-3 pb-6' : 'pointer-events-none fixed top-6 right-[488px] left-[300px] z-[5] xl:right-[500px] xl:left-[316px]')}
      // it rises in on the first arrival of the visit; coming back, it is simply there
      initial={heroSeen ? { opacity: 0 } : { opacity: 0, y: RISE }}
      animate={{ opacity: 1, y: 0 }}
      transition={heroSeen ? enter : { ...surface, delay: 0.15 }}
      onAnimationComplete={() => void (heroSeen = true)}
    >
      <p className="label">An AI-native launchpad on Robinhood Chain</p>
      <h1 className={cn('mt-2 font-display text-display', compact ? 'text-[2.4rem] leading-[1.02]' : 'text-[clamp(2.6rem,1rem+2.9vw,4.1rem)] leading-[0.98]')}>Every token gets a world.</h1>
      <p className={cn('mt-3 max-w-[50ch] text-ink-2', compact ? 'text-[15px]' : 'text-[15.5px]')}>
        Seed a token and an AI governor builds a world around it: contracts, apps, paid jobs and a treasury, every action published with its proof. Only the worlds that grow earn their own chain.
      </p>
      <div className="pointer-events-auto mt-5 flex flex-wrap gap-2">
        <Link to="/seed" className={buttonClass('primary', 'md')}>
          Seed a world <ArrowRight className="size-4" />
        </Link>
        <Link to="/how" className={buttonClass('outline', 'md')}>
          How it works
        </Link>
      </div>
      <dl className={cn('mt-5 grid gap-x-7 gap-y-3', compact ? 'grid-cols-2' : 'w-fit grid-cols-4')}>
        <HeroStat label="Worlds">
          <CountUp value={worlds.length} format={(n) => String(Math.round(n))} />
        </HeroStat>
        <HeroStat label="Treasuries">
          <CountUp value={treasuryTotal(worlds)} format={usd} />
        </HeroStat>
        <HeroStat label="Proofs, 24h">
          <span className="tabular">{today}</span>
        </HeroStat>
        {harrow && (
          <HeroStat label={harrow.stage === 'sovereign' ? 'Newest chain' : 'Harrow graduates in'}>
            <Link to="/sovereignty" className="pointer-events-auto tabular underline decoration-ink-4 underline-offset-4 hover-device:hover:decoration-ink">
              {harrow.stage === 'sovereign' ? 'Harrow L3' : left > 0 ? clock(left) : 'now'}
            </Link>
          </HeroStat>
        )}
      </dl>
    </m.div>
  )
}

function HeroStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 font-display text-[20px] font-[560] tracking-[-0.02em] whitespace-nowrap">{children}</dd>
    </div>
  )
}

function WorldList({ ledger, setLedger, wide }: { ledger: boolean; setLedger: (v: boolean) => void; wide: boolean }) {
  const worlds = useWorlds()
  const filter = fieldFilter.use()
  const [sort, setSort] = useState<Sort>('ready')
  const sorted = useMemo(() => {
    const key = (w: World) => (sort === 'ready' ? (w.stage === 'sovereign' ? 2 : readiness(w)) : sort === 'treasury' ? w.treasury.balanceUsd : w.seededAt)
    return [...worlds].sort((a, b) => key(b) - key(a))
  }, [worlds, sort])
  const shown = groups.filter((g) => filter === 'all' || filter === g.stage)

  return (
    <>
      <PanelHead>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2">Worlds</h2>
          {wide && (
            <Segmented
              label="Layout"
              layoutId="worlds-layout"
              size="sm"
              value={ledger ? 'ledger' : 'list'}
              onChange={(v) => setLedger(v === 'ledger')}
              options={[
                { id: 'list', name: <><Rows3 className="size-3.5" /> List</> },
                { id: 'ledger', name: <><Table2 className="size-3.5" /> Ledger</> },
              ]}
            />
          )}
        </div>
        {!wide && <StageFilter layoutId="sheet-filter" className="mt-3" />}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="label">Sort</p>
          <Segmented
            label="Sort worlds"
            layoutId="worlds-sort"
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { id: 'ready', name: 'Readiness' },
              { id: 'treasury', name: 'Treasury' },
              { id: 'new', name: 'Newest' },
            ]}
          />
        </div>
      </PanelHead>

      {ledger ? (
        <Ledger worlds={sorted.filter((w) => filter === 'all' || w.stage === filter)} />
      ) : (
        <div className="pb-6">
          {shown.map((g) => {
            const list = sorted.filter((w) => w.stage === g.stage)
            return (
              <section key={g.stage} aria-labelledby={`g-${g.stage}`} className="pt-4">
                <div className="flex items-baseline justify-between px-5 pb-1.5 lg:px-6">
                  <h3 id={`g-${g.stage}`} className="text-[13px] font-semibold">
                    {g.title} <span className="font-mono text-[11px] font-medium text-ink-3">{list.length}</span>
                  </h3>
                  <p className="text-[12px] text-ink-3">{g.note}</p>
                </div>
                <ul className="px-2 lg:px-3">
                  {list.map((w) => (
                    <WorldRow key={w.id} world={w} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function WorldRow({ world: w }: { world: World }) {
  const engine = useField()
  const now = useNow()
  const c = criteria(w)
  const era = currentEra(w)
  const troubled = isTroubled(w)
  return (
    <li>
      <Link
        to={`/w/${w.id}`}
        onMouseEnter={() => engine?.setHover(w.id)}
        onMouseLeave={() => engine?.setHover(null)}
        onFocus={() => engine?.setHover(w.id)}
        onBlur={() => engine?.setHover(null)}
        className="group flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors hover-device:hover:bg-raised hover-device:hover:shadow-[0_0_0_1px_var(--line)]"
      >
        <WorldMark world={w} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5">
            <span className="truncate text-[14.5px] font-semibold">{w.name}</span>
            <span className="font-mono text-[10.5px] tracking-wide text-ink-3">{w.ticker}</span>
            {w.mine && <span className="rounded-full bg-sprout px-1.5 text-[10.5px] font-semibold text-on-sprout">Yours</span>}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
            {w.stage === 'sovereign' && (
              <span className="truncate">
                Chain {w.chain?.chainId} · {usd(w.treasury.balanceUsd)} treasury
              </span>
            )}
            {w.stage === 'realm' && (
              <>
                <Ticks met={c.map((x) => x.met)} />
                <span className={cn('truncate', troubled && 'text-red')}>{troubled ? `${eraName[era]} milestone ${w.charter.objectives.some((o) => o.status === 'failed') ? 'missed' : 'challenged'}` : `${pct(readiness(w))} ready · ${preset(w.template).short}`}</span>
              </>
            )}
            {w.stage === 'seed' && (
              <span className="truncate">
                Genesis · <span className="tabular">{span(genesisLeft(w, now))}</span> left · {preset(w.template).short}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <LivePrice w={w} />
        </div>
      </Link>
    </li>
  )
}

/** The same worlds as a ledger, for comparing numbers side by side. */
function Ledger({ worlds }: { worlds: World[] }) {
  const engine = useField()
  return (
    <div className="px-3 pt-2 pb-6">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="label [&>th]:px-2.5 [&>th]:py-2 [&>th]:font-normal">
            <th>World</th>
            <th>Stage</th>
            <th>Era</th>
            <th className="text-right">Treasury</th>
            <th className="text-right">Runway</th>
            <th className="w-[110px]">Readiness</th>
            <th className="text-right">Holders</th>
            <th className="text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {worlds.map((w) => (
            <tr
              key={w.id}
              onMouseEnter={() => engine?.setHover(w.id)}
              onMouseLeave={() => engine?.setHover(null)}
              className="border-t border-line transition-colors hover-device:hover:bg-raised [&>td]:px-2.5 [&>td]:py-2.5"
            >
              <td>
                <Link to={`/w/${w.id}`} className="flex items-center gap-2 font-semibold">
                  <WorldMark world={w} className="size-6" />
                  {w.name}
                </Link>
              </td>
              <td>
                <StageTag stage={w.stage} />
              </td>
              <td className="text-ink-2">{eraName[currentEra(w)]}</td>
              <td className="text-right font-mono tabular">{usd(w.treasury.balanceUsd)}</td>
              <td className="text-right font-mono tabular">{runwayMonths(w).toFixed(1)} mo</td>
              <td>
                <div className="flex items-center gap-2">
                  <Meter value={w.stage === 'sovereign' ? 1 : readiness(w)} className="flex-1" />
                  <span className="w-8 text-right font-mono text-[11px] text-ink-3 tabular">{w.stage === 'sovereign' ? '—' : pct(readiness(w))}</span>
                </div>
              </td>
              <td className="text-right font-mono tabular">{w.holders >= 10_000 ? num(w.holders) : count(w.holders)}</td>
              <td className="text-right">
                <LivePrice w={w} inline />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A token's live price and its move over 24 hours. */
function LivePrice({ w, inline = false }: { w: World; inline?: boolean }) {
  const p = usePrice(w.id) || w.priceUsd
  const d = (1 + w.change24h) * (p / w.priceUsd) - 1
  return inline ? (
    <>
      <span className="font-mono tabular">{price(p)}</span> <Delta value={d} />
    </>
  ) : (
    <>
      <p className="font-mono text-[12.5px] tabular">{price(p)}</p>
      <Delta value={d} />
    </>
  )
}
