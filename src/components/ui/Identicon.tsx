import { cn } from '@/lib/cn'

/** A wallet's mark, drawn from its address: rings on a tint of its own. */
export function Identicon({ address, className }: { address: string; className?: string }) {
  const n = parseInt(address.slice(2, 10), 16) || 1
  const hue = n % 360
  const rings = 2 + (n % 3)
  return (
    <svg viewBox="0 0 32 32" className={cn('size-10 shrink-0 rounded-[11px]', className)} aria-hidden>
      <rect width="32" height="32" fill={`hsl(${hue} 30% 88%)`} />
      {Array.from({ length: rings }, (_, i) => (
        <circle key={i} cx={10 + ((n >> (i * 3)) % 12)} cy={10 + ((n >> (i * 4 + 2)) % 12)} r={14 - i * 4} fill="none" stroke={`hsl(${hue} 25% 25%)`} strokeOpacity={0.35 + i * 0.15} strokeWidth="1.2" />
      ))}
      <circle cx="16" cy="16" r="3" fill="var(--sprout)" stroke="var(--ink)" strokeOpacity=".4" />
    </svg>
  )
}
