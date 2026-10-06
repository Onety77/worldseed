import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/cn'
import { seeded } from '@/lib/seeded'
import { personFor } from '@/data/people'

/** Where a handle's public record lives. */
export const profilePath = (handle: string) => `/u/${encodeURIComponent(handle)}`

/**
 * A name that opens its owner's record. Handles without one (wallet addresses, "You", a
 * world's governor) stay plain text.
 */
export function Who({ handle, className, children }: { handle: string; className?: string; children?: ReactNode }) {
  const label = children ?? handle
  if (!personFor(handle)) return <span className={className}>{label}</span>
  return (
    <Link to={profilePath(handle)} onClick={(e) => e.stopPropagation()} className={cn('rounded-[3px] underline-offset-2 hover-device:hover:underline', className)}>
      {label}
    </Link>
  )
}

/** A small mark for a person or an agent: initials on a quiet tint, or a bot on water. */
export function Avatar({ handle, className }: { handle: string; className?: string }) {
  const agent = handle.startsWith('agent:')
  if (agent)
    return (
      <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-[9px] bg-water text-ink ring-1 ring-line ring-inset', className)}>
        <Bot className="size-[55%]" strokeWidth={1.8} />
      </span>
    )
  const r = seeded(handle + '-face')
  const hue = Math.floor(r() * 360)
  const initials = handle.replace(/[^a-z.]/gi, '').split('.').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('')
  return (
    <span aria-hidden style={{ '--hue': hue } as CSSProperties} className={cn('avatar grid size-8 shrink-0 place-items-center rounded-full font-display text-[12px] font-[600] ring-1 ring-line ring-inset', className)}>
      {initials}
    </span>
  )
}
