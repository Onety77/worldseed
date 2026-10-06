import { ArrowRight, Check, Lock, X } from 'lucide-react'
import type { Era, Objective, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useEvidence } from '@/lib/sim'
import { criteria, SOVEREIGNTY } from '@/lib/rules'
import { eras } from '@/lib/templates'
import { count, date, span, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { currentEra } from '@/lib/world'
import { Meter } from '@/components/ui/bits'
import { EvidenceRow } from '@/components/evidence/EvidenceRow'
import type { Tab } from '@/pages/World'
import { Card, Section } from './parts'

export function Overview({ w, go }: { w: World; go: (t: Tab) => void }) {
  const ev = useEvidence().filter((e) => e.worldId === w.id)
  const era = currentEra(w)
  const now = w.charter.objectives.filter((o) => o.era === era || (o.custom && o.status === 'active'))

  return (
    <>
      <Section title="Eras" note="A world earns each era with a verified milestone. Fail one and holders choose how to recover.">
        <Terraces w={w} />
        <div className="mt-3 grid gap-2">
          {now.map((o) => (
            <ObjectiveCard key={o.id} o={o} />
          ))}
        </div>
      </Section>

      {w.stage === 'sovereign' ? <Chain w={w} /> : <Readiness w={w} />}

      <Section title="Built so far" note={`${w.apps.length} ${w.apps.length === 1 ? 'app' : 'apps'} deployed from the template registry`}>
        <Card className="divide-y divide-line">
          {w.apps.map((a) => (
            <div key={a.name} className="flex items-center gap-3 px-3.5 py-3">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-paper ring-1 ring-line ring-inset">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M4 16V8l6-3 6 3v8M4 8l6 3 6-3M10 11v5" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{a.name}</p>
                <p className="truncate text-[12px] text-ink-3">
                  {a.module} · deployed {date(a.deployedAt)} {a.audited && <span className="text-green">· audited</span>}
                </p>
              </div>
              <div className="shrink-0 text-right font-mono text-[11.5px] text-ink-2">
                <p className="tabular">{count(a.users30d)} users</p>
                <p className="text-ink-3 tabular">{usd(a.revenue30dUsd)} / 30d</p>
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section
        title="Latest from the governor"
        note="Every action is published as an evidence bundle."
        action={
          <button onClick={() => go('log')} className={buttonClass('ghost', 'sm', '-mr-2')}>
            Full log <ArrowRight className="size-3.5" />
          </button>
        }
      >
        <ul className="-mx-3 grid gap-0.5">
          {ev.slice(0, 3).map((e) => (
            <EvidenceRow key={e.id} e={e} world={w} />
          ))}
        </ul>
      </Section>
    </>
  )
}

/** The three eras drawn as the terraces the Field cuts into the world's hill. */
function Terraces({ w }: { w: World }) {
  const status = (e: Era) => w.charter.objectives.find((o) => o.era === e && !o.custom)?.status ?? 'locked'
  return (
    <div className="grid grid-cols-3 items-end gap-1.5">
      {eras.map((e, i) => {
        const s = status(e.id)
        return (
          <div key={e.id}>
            <div
              className={cn(
                'relative rounded-t-[8px] rounded-b-[3px]',
                s === 'passed' && 'bg-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.2)]',
                s === 'active' && 'bg-[repeating-linear-gradient(135deg,var(--sprout-soft)_0_5px,transparent_5px_10px)] shadow-[inset_0_0_0_1.5px_var(--green)]',
                (s === 'failed' || s === 'challenged') && 'bg-red-soft shadow-[inset_0_0_0_1.5px_var(--red)]',
                s === 'locked' && 'bg-ink/[0.05] shadow-[inset_0_0_0_1px_var(--line-2)]',
              )}
              style={{ height: 18 + i * 14 }}
            >
              <span className="absolute top-1.5 right-2 text-ink">
                {s === 'passed' && <Check className="size-3.5" strokeWidth={2.6} />}
                {s === 'locked' && <Lock className="size-3 text-ink-3" />}
                {(s === 'failed' || s === 'challenged') && <X className="size-3.5 text-red" strokeWidth={2.6} />}
              </span>
            </div>
            <p className="mt-2 text-[13px] font-semibold">{e.name}</p>
            <p className={cn('text-[12px]', s === 'failed' || s === 'challenged' ? 'text-red' : s === 'active' ? 'text-green' : 'text-ink-3')}>
              {s === 'passed' ? 'Passed' : s === 'active' ? 'Now' : s === 'failed' ? 'Missed' : s === 'challenged' ? 'Challenged' : e.days}
            </p>
          </div>
        )
      })}
    </div>
  )
}

const statusText: Record<Objective['status'], string> = { passed: 'Verified', active: 'In progress', failed: 'Missed', challenged: 'Under challenge', locked: 'Locked' }

export function ObjectiveCard({ o, compact = false }: { o: Objective; compact?: boolean }) {
  const now = useNow()
  const left = o.deadline - now
  const bad = o.status === 'failed' || o.status === 'challenged'
  return (
    <Card className={cn('p-3.5', bad && 'ring-red/30')}>
      <div className="flex items-center justify-between gap-3">
        <p className="label">
          {o.era === 'genesis' ? 'Genesis' : o.era === 'growth' ? 'Growth' : 'Sovereignty'} milestone{o.custom && ' · custom, compiled from the charter'}
        </p>
        <span className={cn('font-mono text-[10.5px] font-medium tracking-wide uppercase', bad ? 'text-red' : o.status === 'passed' ? 'text-green' : 'text-ink-3')}>{statusText[o.status]}</span>
      </div>
      <p className="mt-1.5 text-[15px] leading-snug font-semibold">{o.title}</p>
      {!compact && (
        <p className="mt-1.5 text-[13px] text-ink-2">
          <span className="text-ink-3">Verified by </span>
          {o.verify}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px] text-ink-3">
        <span>
          Budget <span className="text-ink tabular">{usd(o.budgetUsd)}</span>
        </span>
        <span>
          {o.status === 'active' ? (
            <>
              Deadline in <span className="text-ink tabular">{span(left)}</span>
            </>
          ) : (
            <>Deadline {date(o.deadline)}</>
          )}
        </span>
      </div>
    </Card>
  )
}

function Readiness({ w }: { w: World }) {
  const c = criteria(w)
  const met = c.filter((x) => x.met).length
  return (
    <Section title="Road to sovereignty" note={`${met} of ${c.length} bars cleared. All five, then a holder vote, before it may launch its own chain.`}>
      <Card className="divide-y divide-line">
        {c.map((x) => (
          <div key={x.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-3.5 py-3">
            <p className="text-[13.5px] font-medium">{x.label}</p>
            <p className="text-right font-mono text-[12px] tabular">
              <span className={cn(x.met ? 'text-green' : 'text-ink')}>{x.value}</span>
              <span className="text-ink-3"> / {x.need}</span>
            </p>
            <Meter value={x.progress} className="col-span-2" />
          </div>
        ))}
      </Card>
    </Section>
  )
}

function Chain({ w }: { w: World }) {
  const rows: [string, string][] = [
    ['Chain ID', String(w.chain?.chainId)],
    ['Settles to', 'Robinhood Chain'],
    ['Gas token', w.ticker],
    ['Launched', w.chain ? date(w.chain.launchedAt) : '—'],
    ['Bridge', 'Canonical, open both ways'],
    ['Runway bar', `${SOVEREIGNTY.runwayMonths} months, kept`],
  ]
  return (
    <Section title="Its own chain" note="A dedicated Orbit L3. The world's token pays for gas; the treasury pays for sequencing and data.">
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-raised px-3.5 py-3">
            <p className="label">{k}</p>
            <p className="mt-1 truncate text-[14px] font-semibold">{v}</p>
          </div>
        ))}
      </Card>
    </Section>
  )
}
