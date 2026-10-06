import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, Check, Copy } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { HARROW_GRADUATES_AT, useWorld } from '@/lib/sim'
import { readiness, runwayMonths } from '@/lib/rules'
import { preset } from '@/lib/templates'
import { clock, count, hash, pct, price, usd } from '@/lib/format'
import { dayOf } from '@/lib/world'
import { EASE_OUT, SPRING_UI } from '@/lib/motion'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { WorldMark } from '@/components/ui/WorldMark'
import { Delta, Meter, StageTag, Stat } from '@/components/ui/bits'
import { Ticking } from '@/components/motion/Ticking'
import { Overview } from '@/components/world/Overview'
import { GovernorLog } from '@/components/world/GovernorLog'
import { CharterTab } from '@/components/world/CharterTab'
import { TreasuryTab } from '@/components/world/TreasuryTab'
import { WorkTab } from '@/components/world/WorkTab'
import { GovernanceTab } from '@/components/world/GovernanceTab'
import { NotFound } from './NotFound'

const tabs = [
  { id: 'overview', name: 'Overview' },
  { id: 'log', name: 'Governor log' },
  { id: 'charter', name: 'Charter' },
  { id: 'treasury', name: 'Treasury' },
  { id: 'work', name: 'Jobs' },
  { id: 'governance', name: 'Governance' },
] as const
export type Tab = (typeof tabs)[number]['id']

export function WorldPage() {
  const { id } = useParams()
  const w = useWorld(id)
  useFieldView(w ? { kind: 'world', id: w.id } : null, w?.id ?? null)
  const none = useCallback(() => null, [])
  useLabels(none, w?.id ?? null, true)
  useTitle(w?.name)
  if (!w) return <NotFound />
  return <Dossier key={w.id} w={w} />
}

function Dossier({ w }: { w: World }) {
  const { hash: h } = useLocation()
  const nav = useNavigate()
  const fromHash = (x: string) => (tabs.some((t) => `#${t.id}` === x) ? (x.slice(1) as Tab) : null)
  const [tab, setTab] = useState<Tab>(() => fromHash(h) ?? 'overview')
  const [seen, setSeen] = useState(h)
  if (seen !== h) {
    setSeen(h)
    const t = fromHash(h)
    if (t) setTab(t)
  }
  const choose = (t: Tab) => {
    setTab(t)
    nav({ hash: t === 'overview' ? '' : t }, { replace: true })
  }

  return (
    <Panel label={`${w.name} dossier`} width="lg" rest={0.52}>
      <Header w={w} />
      <div className="sticky top-5 z-[6] border-y border-line bg-panel/95 backdrop-blur-md lg:top-0">
        <div role="tablist" aria-label="Sections" className="no-scrollbar flex gap-1 overflow-x-auto px-3 lg:px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="world-tab"
              onClick={() => choose(t.id)}
              className={cn('relative h-11 shrink-0 px-2.5 text-[13.5px] font-semibold transition-colors', tab === t.id ? 'text-ink' : 'text-ink-3 hover-device:hover:text-ink')}
            >
              {t.name}
              {tab === t.id && <m.span layoutId="world-tab" transition={SPRING_UI} className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-ink" />}
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={tab}
          id="world-tab"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="pb-10"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          {tab === 'overview' && <Overview w={w} go={choose} />}
          {tab === 'log' && <GovernorLog w={w} />}
          {tab === 'charter' && <CharterTab w={w} />}
          {tab === 'treasury' && <TreasuryTab w={w} />}
          {tab === 'work' && <WorkTab w={w} />}
          {tab === 'governance' && <GovernanceTab w={w} />}
        </m.div>
      </AnimatePresence>
    </Panel>
  )
}

function Header({ w }: { w: World }) {
  const nav = useNavigate()
  const now = useNow()
  const p = preset(w.template)
  const latest = w.charter.versions[w.charter.versions.length - 1]
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav('/'))

  return (
    <header className="px-5 pt-4 pb-5 lg:px-6 lg:pt-5">
      <div className="flex items-center justify-between">
        <button onClick={back} className="-ml-2 flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
          <ArrowLeft className="size-4" /> Atlas
        </button>
        <span className="font-mono text-[11px] tracking-wide text-ink-3">
          Day {dayOf(w, now)} · by {w.creator}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-4">
        <WorldMark world={w} className="size-14 rounded-[12px] shadow-[0_0_0_1px_var(--line)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="text-h1">{w.name}</h1>
            <span className="font-mono text-[12px] tracking-wide text-ink-3">{w.ticker}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StageTag stage={w.stage} />
            <span className="text-[12.5px] text-ink-3">{p.name}</span>
            {w.mine && <span className="rounded-full bg-sprout px-2 py-0.5 text-[11px] font-semibold text-on-sprout">You seeded this</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[15px] font-medium tabular">{price(w.priceUsd)}</p>
          <Delta value={w.change24h} />
        </div>
      </div>
      <p className="mt-4 text-[15px] text-ink-2">{w.lore}</p>

      <CharterHash version={latest.version} value={latest.hash} />
      <Graduation w={w} now={now} />
      <Planted w={w} />

      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        <Stat label="Treasury">
          <Ticking value={Math.round(w.treasury.balanceUsd / 100)} text={usd(w.treasury.balanceUsd)} flash={false} />
        </Stat>
        <Stat label="Infra runway">
          <span className={cn(runwayMonths(w) >= 12 && 'text-green')}>{runwayMonths(w).toFixed(1)} mo</span>
        </Stat>
        {w.stage === 'sovereign' ? (
          <Stat label="Own chain">{w.chain?.chainId}</Stat>
        ) : (
          <Stat label="Sovereignty">
            <span className="flex items-center gap-2">
              {pct(readiness(w))}
              <Meter value={readiness(w)} className="w-12" />
            </span>
          </Stat>
        )}
        <Stat label="Holders">{count(w.holders)}</Stat>
      </dl>
    </header>
  )
}

function CharterHash({ version, value }: { version: number; value: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {})
        setCopied(true)
      }}
      className="mt-4 flex w-full items-center gap-2 rounded-[10px] bg-ink/[0.04] px-3 py-2 text-left ring-1 ring-line ring-inset hover-device:hover:bg-ink/[0.06]"
      aria-label={`Copy charter hash, version ${version}`}
    >
      <span className="label shrink-0">Charter v{version}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">{hash(value, 10, 8)}</span>
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink-3">
        {copied ? <Check className="size-3.5 text-green" /> : <Copy className="size-3.5" />}
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </span>
    </button>
  )
}

/** Straight after planting: what just happened, and what the governor does next. */
function Planted({ w }: { w: World }) {
  const { state } = useLocation()
  if (!w.mine || !(state as { planted?: boolean } | null)?.planted) return null
  return (
    <m.div className="mt-3 flex items-start gap-3 rounded-[10px] bg-sprout px-3 py-2.5 text-[13px] text-on-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.15)]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.3 }}>
      <Check className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} />
      <p>
        <span className="font-semibold">{w.name} is planted.</span> Its charter is stored, {w.ticker} is trading on pons, and the governor has started Genesis. Seven days to prove the first milestone.
      </p>
    </m.div>
  )
}

/** Harrow's moment: the sovereignty vote's timelock running out, then the chain going live. */
function Graduation({ w, now }: { w: World; now: number }) {
  if (w.id !== 'harrow') return null
  const left = HARROW_GRADUATES_AT - now
  const done = w.stage === 'sovereign'
  return (
    <div className={cn('mt-3 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px]', done ? 'bg-ink text-paper' : 'bg-sprout-soft ring-1 ring-green/25 ring-inset')}>
      <span className={cn('relative size-2 shrink-0 rounded-full', done ? 'bg-sprout' : 'ping bg-green')} />
      {done ? (
        <p>
          <span className="font-semibold">Harrow is sovereign.</span> Its Orbit L3 (chain {w.chain?.chainId}) is live, settling to Robinhood Chain, with HRW as gas.
        </p>
      ) : (
        <p className="flex-1">
          <span className="font-semibold">Sovereignty vote passed.</span> Timelock clears in <span className="font-mono tabular">{clock(left)}</span>, then Harrow launches its own chain.
        </p>
      )}
      {!done && (
        <Link to="/sovereignty" className="shrink-0 text-[12.5px] font-semibold underline decoration-ink-4 underline-offset-4">
          The race
        </Link>
      )}
    </div>
  )
}
