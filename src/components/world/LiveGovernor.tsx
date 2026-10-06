import { AnimatePresence, m } from 'motion/react'
import { Check } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useGovernorLive, STEPS } from '@/lib/governor'
import { usd } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'
import { Meter } from '@/components/ui/bits'

/** The governor at work right now: which step of the loop, on what, with which model, at what cost. */
export function LiveGovernor({ w }: { w: World }) {
  const g = useGovernorLive(w)
  const cap = w.treasury.modelCapDailyUsd
  return (
    <section aria-label="The governor, working now" className="overflow-hidden rounded-[14px] bg-ink text-paper">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="ping relative size-2 rounded-full bg-sprout" />
          Governor, working now
        </p>
        <p className="font-mono text-[11px] text-paper/60">{g.model}</p>
      </div>

      <ol className="mt-3 flex gap-1 px-4" aria-label="Loop">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === g.index ? 'step' : undefined}>
            <span className="relative block h-1 overflow-hidden rounded-full bg-paper/15">
              {i < g.index && <span className="absolute inset-0 bg-paper/70" />}
              {i === g.index && <span className="absolute inset-y-0 left-0 bg-sprout transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(8, g.progress * 100)}%` }} />}
            </span>
            <span className={cn('mt-1.5 hidden truncate text-[10.5px] sm:block', i === g.index ? 'font-semibold text-paper' : 'text-paper/50')}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="px-4 pt-3" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={g.step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
            <p className="label text-paper/55">{g.step}</p>
            <p className="mt-0.5 text-[14px] leading-snug">{g.detail}</p>
          </m.div>
        </AnimatePresence>
      </div>

      <ul className="mt-3 grid gap-1 px-4">
        {g.plan.map((t, i) => {
          const done = i < g.taskIndex
          const now = i === g.taskIndex
          return (
            <li key={t} className={cn('flex items-center gap-2 text-[12.5px]', now ? 'text-paper' : done ? 'text-paper/55 line-through decoration-paper/30' : 'text-paper/55')}>
              <span className={cn('grid size-3.5 shrink-0 place-items-center rounded-full', done ? 'bg-paper/70 text-ink' : now ? 'ring-1 ring-sprout' : 'ring-1 ring-paper/30')}>
                {done && <Check className="size-2.5" strokeWidth={3} />}
                {now && <span className="size-1.5 rounded-full bg-sprout" />}
              </span>
              {t}
            </li>
          )
        })}
      </ul>

      <div className="mt-3.5 border-t border-paper/10 px-4 py-3">
        <div className="flex justify-between text-[12px]">
          <span className="text-paper/60">Compute today</span>
          <span className="font-mono tabular">
            {usd(g.spent)} <span className="text-paper/50">of {usd(cap)}</span>
          </span>
        </div>
        <Meter value={g.spent / cap} className="mt-1.5 bg-paper/15 [&>span]:bg-paper/80" />
      </div>
    </section>
  )
}
