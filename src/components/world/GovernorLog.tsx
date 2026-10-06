import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import type { Evidence, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useEvidence } from '@/lib/sim'
import { profiles } from '@/lib/templates'
import { date, usd } from '@/lib/format'
import { EASE_IN_OUT } from '@/lib/motion'
import { Meter, Segmented } from '@/components/ui/bits'
import { EvidenceRow } from '@/components/evidence/EvidenceRow'
import { Card, Section } from './parts'

export const LOOP: Evidence['step'][] = ['Observe', 'Propose', 'Simulate', 'Approve', 'Execute', 'Publish proof', 'Evaluate']

export function GovernorLog({ w }: { w: World }) {
  const all = useEvidence().filter((e) => e.worldId === w.id)
  const [filter, setFilter] = useState<'all' | 'flagged'>('all')
  const list = filter === 'all' ? all : all.filter((e) => e.verdict !== 'passed')
  const g = w.governor
  const prof = profiles.find((p) => p.id === g.profile)!

  return (
    <>
      <Section title="The governor" note={`An AI operator bound by the charter. ${prof.name} profile since ${date(g.since)}.`}>
        <Card className="grid gap-4 p-4 sm:grid-cols-[176px_1fr]">
          <Loop step={all[0]?.step ?? 'Observe'} pulse={all[0]?.id} />
          <div className="min-w-0">
            <p className="label">Models by role</p>
            <dl className="mt-2 grid gap-1.5">
              {g.roles.map((r) => (
                <div key={r.role} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className="text-ink-3">{r.role}</dt>
                  <dd className="truncate font-mono text-[12px]">{r.model}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <dt className="text-ink-3">Fallback</dt>
                <dd className="truncate font-mono text-[12px]">{g.fallback}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className="text-ink-3">Compute today</span>
                <span className="font-mono tabular">
                  {usd(w.treasury.modelSpentTodayUsd)} <span className="text-ink-3">of {usd(w.treasury.modelCapDailyUsd)} cap</span>
                </span>
              </div>
              <Meter value={w.treasury.modelSpentTodayUsd / w.treasury.modelCapDailyUsd} className="mt-1.5" />
              <p className="mt-1.5 text-[12px] text-ink-3">Above the cap, work queues until tomorrow or holders raise it by vote.</p>
            </div>
          </div>
        </Card>
      </Section>

      <Section
        title="Evidence bundles"
        note="Open one to see its inputs, or challenge it."
        action={
          <Segmented
            label="Filter bundles"
            layoutId="log-filter"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', name: 'All' },
              { id: 'flagged', name: 'Open or flagged' },
            ]}
          />
        }
      >
        <ul className="-mx-3 grid gap-0.5">
          <AnimatePresence initial={false}>
            {list.map((e) => (
              <EvidenceRow key={e.id} e={e} world={w} arrive />
            ))}
          </AnimatePresence>
          {!list.length && <li className="px-3 py-6 text-center text-[13px] text-ink-3">Nothing open or flagged. Every bundle verified.</li>}
        </ul>
      </Section>
    </>
  )
}

/** The governor loop as a ring of seven steps; the step it last completed is lit. */
export function Loop({ step, pulse, className }: { step: Evidence['step']; pulse?: string; className?: string }) {
  const i = LOOP.indexOf(step)
  const R = 62
  const at = (k: number) => {
    const a = (k / LOOP.length) * Math.PI * 2 - Math.PI / 2
    return { x: 88 + Math.cos(a) * R, y: 88 + Math.sin(a) * R }
  }
  const p = at(i)
  return (
    <div className={cn('relative mx-auto size-[176px]', className)}>
      <svg viewBox="0 0 176 176" className="absolute inset-0" aria-hidden>
        <circle cx="88" cy="88" r={R} fill="none" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 3" />
        {LOOP.map((s, k) => {
          const q = at(k)
          return <circle key={s} cx={q.x} cy={q.y} r={k === i ? 0 : 3} fill="var(--panel)" stroke="var(--ink)" strokeOpacity=".5" />
        })}
        <m.circle r="7" fill="var(--sprout)" stroke="var(--ink)" strokeWidth="1.2" initial={false} animate={{ cx: p.x, cy: p.y }} transition={{ duration: 0.8, ease: EASE_IN_OUT }} />
        <m.circle key={pulse} r="7" fill="none" stroke="var(--green)" initial={{ cx: p.x, cy: p.y, r: 7, opacity: 0.8 }} animate={{ cx: p.x, cy: p.y, r: 16, opacity: 0 }} transition={{ duration: 1.4, delay: 0.6 }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="label">Last step</p>
          <p className="mt-0.5 text-[14px] font-semibold">{step}</p>
        </div>
      </div>
      <ol className="sr-only">
        {LOOP.map((s) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}
