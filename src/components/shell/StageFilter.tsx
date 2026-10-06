import { m } from 'motion/react'
import type { Stage } from '@/lib/types'
import { cn } from '@/lib/cn'
import { fieldFilter } from '@/field/Field'
import { useWorlds } from '@/lib/sim'
import { SPRING_UI } from '@/lib/motion'

const options: { id: Stage | 'all'; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'seed', name: 'Seed' },
  { id: 'realm', name: 'Realm' },
  { id: 'sovereign', name: 'Sovereign' },
]

/** Which stages the Field shows at full strength. The rest fade back into the paper. */
export function StageFilter({ layoutId, className, grid = false }: { layoutId: string; className?: string; grid?: boolean }) {
  const filter = fieldFilter.use()
  const worlds = useWorlds()
  return (
    <div role="radiogroup" aria-label="Show worlds by stage" className={cn('rounded-control bg-ink/[0.05] p-0.5', grid ? 'grid grid-cols-2' : 'flex', className)}>
      {options.map((o) => {
        const on = filter === o.id
        const n = o.id === 'all' ? worlds.length : worlds.filter((w) => w.stage === o.id).length
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            onClick={() => fieldFilter.set(o.id)}
            className={cn('relative flex h-8 flex-1 items-center justify-center gap-1 rounded-[8px] text-[12.5px] font-semibold transition-colors', on ? 'text-ink' : 'text-ink-3 hover-device:hover:text-ink')}
          >
            {on && <m.span layoutId={layoutId} transition={SPRING_UI} className="absolute inset-0 rounded-[8px] bg-raised shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(20_24_19/0.08)]" />}
            <span className="relative">{o.name}</span>
            <span className="relative font-mono text-[10.5px] font-medium text-ink-3 tabular">{n}</span>
          </button>
        )
      })}
    </div>
  )
}
