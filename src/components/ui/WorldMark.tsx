import { useMemo } from 'react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { seeded } from '@/lib/seeded'

/*
  A world's emblem: its hill seen from above, as contour rings. One ring per era it has
  reached, wobbling the way its coastline does; a sovereign world sits inside a dashed ring,
  its orbit; the seed at the centre is sprout while the world is still growing.
*/

function ring(r: () => number, radius: number) {
  const a = r() * 6.28
  const b = r() * 6.28
  const k1 = 0.05 + r() * 0.05
  const k2 = 0.03 + r() * 0.04
  const pts = Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2
    const rr = radius * (1 + k1 * Math.sin(t * 3 + a) + k2 * Math.sin(t * 5 + b))
    return [16 + Math.cos(t) * rr, 16 + Math.sin(t) * rr]
  })
  return 'M' + pts.map((p) => p.map((n) => n.toFixed(2)).join(' ')).join('L') + 'Z'
}

export function WorldMark({ world, className }: { world: Pick<World, 'id' | 'stage' | 'charter'>; className?: string }) {
  const passed = world.charter.objectives.filter((o) => !o.custom && o.status === 'passed').length
  const failed = world.charter.objectives.some((o) => o.status === 'failed')
  const rings = world.stage === 'seed' ? 1 : Math.max(2, passed + 1)
  const paths = useMemo(() => {
    const r = seeded(world.id + '-mark')
    return Array.from({ length: Math.min(3, rings) }, (_, i) => ring(r, 4.5 + ((i + 1) / Math.min(3, rings)) * 7.5))
  }, [world.id, rings])
  const sovereign = world.stage === 'sovereign'
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="9" fill={sovereign ? 'var(--water)' : 'var(--raised)'} />
      {sovereign && <circle cx="16" cy="16" r="14.2" fill="none" stroke="var(--ink)" strokeOpacity=".3" strokeWidth=".8" strokeDasharray="1.4 1.6" />}
      {paths
        .slice()
        .reverse()
        .map((d, i) => (
          <path key={i} d={d} fill={i === 0 ? 'var(--paper)' : 'none'} stroke="var(--ink)" strokeOpacity={0.28 + (i / paths.length) * 0.4} strokeWidth="1" />
        ))}
      <circle cx="16" cy="16" r="2.6" fill={failed ? 'var(--red)' : sovereign ? 'var(--ink)' : 'var(--sprout)'} stroke="var(--ink)" strokeOpacity={sovereign ? 0 : 0.5} strokeWidth=".8" />
    </svg>
  )
}
