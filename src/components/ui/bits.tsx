import type { ReactNode } from 'react'
import { m } from 'motion/react'
import type { Stage, Verdict } from '@/lib/types'
import { cn } from '@/lib/cn'
import { change } from '@/lib/format'
import { SPRING_UI } from '@/lib/motion'
import { StageGlyph } from './StageGlyph'

const stageName: Record<Stage, string> = { seed: 'Seed', realm: 'Realm', sovereign: 'Sovereign' }

export function StageTag({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold',
        stage === 'sovereign' ? 'bg-ink text-paper' : stage === 'realm' ? 'bg-raised text-ink ring-1 ring-line-2 ring-inset' : 'bg-sprout-soft text-ink ring-1 ring-green/25 ring-inset',
        className,
      )}
    >
      <StageGlyph stage={stage} className="size-3" />
      {stageName[stage]}
    </span>
  )
}

export function Delta({ value, className }: { value: number; className?: string }) {
  return <span className={cn('font-mono text-[11.5px] tabular', value > 0 ? 'text-green' : value < 0 ? 'text-red' : 'text-ink-3', className)}>{change(value)}</span>
}

/** A slim bar toward a bar to clear. Sprout when cleared. */
export function Meter({ value, className, tone }: { value: number; className?: string; tone?: 'red' }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className={cn('relative block h-1.5 overflow-hidden rounded-full bg-ink/[0.08]', className)}>
      <m.span
        className={cn('absolute inset-y-0 left-0 rounded-full', tone === 'red' ? 'bg-red' : v >= 1 ? 'bg-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.18)]' : 'bg-ink/70')}
        initial={false}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </span>
  )
}

/** Five ticks, one per sovereignty criterion. */
export function Ticks({ met, total = 5, className }: { met: boolean[]; total?: number; className?: string }) {
  return (
    <span className={cn('flex gap-[3px]', className)} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-2.5 w-1.5 rounded-[2px]', met[i] ? 'bg-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.25)]' : 'bg-ink/[0.12]')} />
      ))}
    </span>
  )
}

const verdictStyle: Record<Verdict, string> = {
  passed: 'text-green',
  pending: 'text-ink-3',
  challenged: 'text-red',
  failed: 'text-red',
}
const verdictName: Record<Verdict, string> = { passed: 'Verified', pending: 'In window', challenged: 'Challenged', failed: 'Failed' }

export function VerdictTag({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium tracking-wide uppercase', verdictStyle[verdict], className)}>
      <span className={cn('size-1.5 rounded-full', verdict === 'passed' ? 'bg-green' : verdict === 'pending' ? 'bg-ink-4' : 'bg-red')} />
      {verdictName[verdict]}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, layoutId, label, className, size = 'md' }: { value: T; options: { id: T; name: ReactNode }[]; onChange: (v: T) => void; layoutId: string; label: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('no-scrollbar flex max-w-full overflow-x-auto rounded-control bg-ink/[0.05] p-0.5', className)}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn('relative flex flex-1 shrink-0 items-center justify-center gap-1 rounded-[8px] px-2.5 font-semibold whitespace-nowrap transition-colors', size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[12.5px]', on ? 'text-ink' : 'text-ink-3 hover-device:hover:text-ink')}
          >
            {on && <m.span layoutId={layoutId} transition={SPRING_UI} className="absolute inset-0 rounded-[8px] bg-raised shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(20_24_19/0.08)]" />}
            <span className="relative flex items-center gap-1">{o.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A label over a value, the basic unit of every stat strip. */
export function Stat({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="label truncate">{label}</dt>
      <dd className="mt-1 truncate text-[17px] font-semibold tracking-[-0.01em] tabular">{children}</dd>
    </div>
  )
}

/** When a list has nothing in it: a quiet survey mark, a plain line, and what to do next. */
export function Empty({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid justify-items-center rounded-[12px] px-5 py-7 text-center ring-1 ring-line ring-inset', className)}>
      <svg viewBox="0 0 48 28" className="h-7 w-12 text-ink-4" aria-hidden>
        <ellipse cx="24" cy="18" rx="22" ry="9" fill="none" stroke="currentColor" strokeDasharray="2 3" />
        <ellipse cx="24" cy="17" rx="13" ry="5.5" fill="none" stroke="currentColor" />
        <path d="M24 16V4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M24 4h7l-2 2.2 2 2.2h-7" fill="var(--sprout)" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <p className="mt-2.5 text-[14px] font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-[36ch] text-[13px] text-ink-3">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
