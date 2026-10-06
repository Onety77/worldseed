import type { Job, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { jobs } from '@/lib/civic'
import { span, usd } from '@/lib/format'
import { WorldMark } from '@/components/ui/WorldMark'
import { Section } from './parts'

export function WorkTab({ w }: { w: World }) {
  const list = jobs.filter((j) => j.worldId === w.id)
  return (
    <Section title="Escrowed jobs" note="The governor funds work it cannot do itself. Payment releases only after a verifier passes it and the challenge window closes.">
      <ul className="grid gap-2">
        {list.map((j) => (
          <JobRow key={j.id} j={j} />
        ))}
      </ul>
    </Section>
  )
}

const jobTone: Record<Job['status'], string> = {
  open: 'bg-sprout text-on-sprout',
  'in review': 'bg-raised ring-1 ring-line-2 ring-inset',
  'challenge window': 'bg-water',
  paid: 'bg-ink/[0.06] text-ink-3',
}

export function JobRow({ j, world }: { j: Job; world?: World }) {
  const now = useNow()
  return (
    <li className="rounded-[12px] bg-raised/80 p-3.5 ring-1 ring-line ring-inset">
      <div className="flex items-start gap-3">
        {world && <WorldMark world={world} className="mt-0.5 size-7" />}
        <div className="min-w-0 flex-1">
          {world && <p className="text-[12px] font-semibold text-ink-3">{world.name}</p>}
          <p className="text-[14.5px] leading-snug font-semibold">{j.title}</p>
          <p className="mt-1 text-[12.5px] text-ink-3">Verified by {j.verifier.toLowerCase()}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[14px] font-medium tabular">{usd(j.escrowUsd)}</p>
          <p className="text-[11.5px] text-ink-3">in escrow</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', jobTone[j.status])}>{j.status}</span>
        <span className="text-ink-3">{j.category}</span>
        {j.claimant && <span className="font-mono text-[11px] text-ink-2">{j.claimant}</span>}
        <span className="ml-auto font-mono text-[11px] text-ink-3 tabular">{j.status === 'paid' ? 'released' : j.status === 'challenge window' ? `releases in ${span(j.endsAt - now)}` : `closes in ${span(j.endsAt - now)}`}</span>
      </div>
    </li>
  )
}
