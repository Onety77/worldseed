import { cn } from '@/lib/cn'

/** The WORLDSEED mark: a seed inside the first two contour rings of the hill it will become. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <g fill="none" stroke="var(--paper)" strokeWidth="1.6">
        <path d="M16 5.5c6.2 0 10.5 4.6 10.5 10.3S22 26.5 16 26.5 5.5 21.6 5.5 15.8 9.8 5.5 16 5.5Z" opacity=".55" />
        <path d="M16 10c3.5 0 6 2.6 6 5.9s-2.6 6-6 6-6-2.7-6-6S12.5 10 16 10Z" opacity=".8" />
      </g>
      <circle cx="16" cy="15.9" r="2.6" fill="var(--sprout)" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-display text-[15px] font-[640] tracking-[0.14em]', className)}>WORLDSEED</span>
}
