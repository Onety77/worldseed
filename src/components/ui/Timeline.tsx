import { Check } from 'lucide-react'
import { m } from 'motion/react'
import { cn } from '@/lib/cn'
import { EASE_OUT } from '@/lib/motion'

/**
 * Where something is in its process: done steps checked, the current one lit, the rest
 * waiting. Reads as a row on wide panels and stays a row (scrolling) on phones.
 */
export function Timeline({ steps, current, tone = 'green', className }: { steps: { name: string; note?: string }[]; current: number; tone?: 'green' | 'red'; className?: string }) {
  return (
    <ol className={cn('grid gap-1', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current
        const now = i === current
        return (
          <li key={s.name} className="min-w-0" aria-current={now ? 'step' : undefined}>
            <span className="relative block h-1 overflow-hidden rounded-full bg-ink/[0.1]">
              {(done || now) && (
                <m.span
                  className={cn('absolute inset-y-0 left-0', done ? 'bg-ink' : tone === 'red' ? 'bg-red' : 'bg-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.25)]')}
                  initial={false}
                  animate={{ width: done ? '100%' : '55%' }}
                  transition={{ duration: 0.6, ease: EASE_OUT }}
                />
              )}
            </span>
            <span className={cn('mt-2 flex items-center gap-1 truncate text-[11px] font-semibold sm:text-[12px]', now ? 'text-ink' : done ? 'text-ink-2' : 'text-ink-3')}>
              {done && <Check className="hidden size-3 shrink-0 sm:block" strokeWidth={3} />}
              {s.name}
            </span>
            {s.note && <span className="block truncate text-[11px] text-ink-3">{s.note}</span>}
          </li>
        )
      })}
    </ol>
  )
}
