import { m } from 'motion/react'
import { SPLIT } from '@/lib/rules'
import { cn } from '@/lib/cn'
import { usd } from '@/lib/format'
import { EASE_OUT } from '@/lib/motion'

const tone = ['bg-ink', 'bg-ink/55', 'bg-sprout', 'bg-ink/25', 'bg-red']

/** How creator fees split across the five buckets, as one bar and a legend. */
export function Split({ base, className, shares }: { base?: number; className?: string; shares?: number[] }) {
  const s = shares ?? SPLIT.map((x) => x.share)
  return (
    <div className={className}>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {SPLIT.map((x, i) => (
          <m.span key={x.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', tone[i], i === 2 && 'shadow-[inset_0_0_0_1px_rgb(20_24_19/0.2)]')} initial={false} animate={{ width: `${s[i] * 100}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
        ))}
      </div>
      <dl className="mt-3 grid gap-2">
        {SPLIT.map((x, i) => (
          <div key={x.key} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2.5">
            <dt className="contents">
              <span aria-hidden className={cn('size-2.5 translate-y-[1px] rounded-[3px]', tone[i], i === 2 && 'shadow-[inset_0_0_0_1px_rgb(20_24_19/0.25)]')} />
              <span className="min-w-0">
                <span className="text-[13.5px] font-medium">{x.label}</span>
                <span className="block text-[12px] text-ink-3">{x.note}</span>
              </span>
            </dt>
            <dd className="text-right font-mono text-[12px] tabular">
              {Math.round(s[i] * 100)}%{base !== undefined && <span className="block text-ink-3">{usd(base * s[i])}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
