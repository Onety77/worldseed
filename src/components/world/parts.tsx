import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A titled block inside a dossier tab. */
export function Section({ title, note, action, children, className }: { title: string; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('px-5 pt-6 lg:px-6', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
          {note && <p className="mt-0.5 text-[13px] text-ink-3">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[12px] bg-raised/80 ring-1 ring-line ring-inset', className)}>{children}</div>
}
