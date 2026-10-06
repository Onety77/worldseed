import { useMemo } from 'react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { runwayMonths, SOVEREIGNTY } from '@/lib/rules'
import { seeded } from '@/lib/seeded'
import { usd } from '@/lib/format'
import { Split } from '@/components/charts/Split'
import { Meter, Stat } from '@/components/ui/bits'
import { Card, Section } from './parts'

export function TreasuryTab({ w }: { w: World }) {
  const t = w.treasury
  const run = runwayMonths(w)
  return (
    <>
      <Section title="World Treasury" note="Funded by creator fees and app revenue. The governor spends it only through the PolicyEngine.">
        <Card className="p-4">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
          <Stat label="Balance">{usd(t.balanceUsd)}</Stat>
          <Stat label="Revenue, 30d">{usd(t.revenue30dUsd)}</Stat>
          <Stat label="Infra per month">{usd(t.infraMonthlyUsd)}</Stat>
          <Stat label="Net, 30d">
            <span className={cn(t.revenue30dUsd - t.infraMonthlyUsd >= 0 ? 'text-green' : 'text-red')}>{usd(Math.abs(t.revenue30dUsd - t.infraMonthlyUsd))}</span>
          </Stat>
          </dl>
        </Card>
      </Section>

      <Section title="Infrastructure runway" note={`The infrastructure reserve (a quarter of the treasury) against monthly costs. Sovereignty needs ${SOVEREIGNTY.runwayMonths} months.`}>
        <Runway months={run} />
      </Section>

      <Section title="Where the next 30 days of fees go" note="Starting split for every world; holders can amend it.">
        <Split base={t.revenue30dUsd} />
      </Section>

      <Section title="Compute budget" note="Model spend is metered per day. The cap is part of the charter.">
        <Spend w={w} />
      </Section>
    </>
  )
}

/** Months of runway on a ruler to 18, with the sovereignty bar marked at 12. */
function Runway({ months }: { months: number }) {
  const max = 18
  const v = Math.min(max, months)
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[30px] font-[560] tracking-[-0.02em] tabular">
          {months.toFixed(1)} <span className="text-[16px] text-ink-3">months</span>
        </p>
        <p className={cn('text-[13px] font-semibold', months >= SOVEREIGNTY.runwayMonths ? 'text-green' : 'text-ink-3')}>{months >= SOVEREIGNTY.runwayMonths ? 'Clears the bar' : `${(SOVEREIGNTY.runwayMonths - months).toFixed(1)} months short`}</p>
      </div>
      <div className="relative mt-4 pb-5">
        <Meter value={v / max} className="h-2.5" />
        <div className="absolute top-0 h-2.5 w-px bg-ink" style={{ left: `${(SOVEREIGNTY.runwayMonths / max) * 100}%` }} />
        {[0, 6, 12, 18].map((n) => (
          <span key={n} className="absolute top-4 -translate-x-1/2 font-mono text-[10.5px] text-ink-3" style={{ left: `${(n / max) * 100}%` }}>
            {n}
          </span>
        ))}
      </div>
    </Card>
  )
}

function Spend({ w }: { w: World }) {
  const t = w.treasury
  const days = useMemo(() => {
    const r = seeded(w.id + '-spend')
    return Array.from({ length: 13 }, () => t.modelCapDailyUsd * (0.3 + r() * 0.65)).concat(t.modelSpentTodayUsd)
  }, [w.id, t.modelCapDailyUsd, t.modelSpentTodayUsd])
  return (
    <Card className="p-4">
      <div className="flex h-24 items-end gap-1" aria-hidden>
        {days.map((d, i) => (
          <span key={i} className={cn('flex-1 rounded-t-[3px]', i === days.length - 1 ? 'bg-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.2)]' : 'bg-ink/15')} style={{ height: `${(d / t.modelCapDailyUsd) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1 border-t border-dashed border-ink-4 pt-2 text-[12.5px] text-ink-3">
        Daily cap <span className="font-mono text-ink">{usd(t.modelCapDailyUsd)}</span> · today <span className="font-mono text-ink">{usd(t.modelSpentTodayUsd)}</span> · 14-day average{' '}
        <span className="font-mono text-ink">{usd(days.reduce((s, d) => s + d, 0) / days.length)}</span>
      </div>
    </Card>
  )
}
