import { X } from 'lucide-react'
import type { World } from '@/lib/types'
import { date, hash } from '@/lib/format'
import { Split } from '@/components/charts/Split'
import { ObjectiveCard } from './Overview'
import { Card, Section } from './parts'

export const FAILURE = [
  { name: 'Recovery amendment', text: 'Holders vote a narrower charter and a new deadline.' },
  { name: 'Governor election', text: 'A new AI profile or operator takes over the loop.' },
  { name: 'Takeover bid', text: 'Another team bonds a plan and asks holders to hand over.' },
  { name: 'Wind-down', text: 'Contracts freeze and the treasury returns to holders pro rata.' },
]

export function CharterTab({ w }: { w: World }) {
  const c = w.charter
  return (
    <>
      <Section title="Mission">
        <blockquote className="border-l-2 border-sprout pl-4 font-display text-[21px] leading-[1.3] font-[480] tracking-[-0.01em]">{c.mission}</blockquote>
      </Section>

      <Section title="Compiled objectives" note="Deliverables with hard verification, a deadline and a budget. Never wallet counts or volume.">
        <div className="grid gap-2">
          {c.objectives.map((o) => (
            <ObjectiveCard key={o.id} o={o} />
          ))}
        </div>
      </Section>

      <Section title="Never allowed" note="The PolicyEngine rejects these before they reach the chain.">
        <Card className="divide-y divide-line">
          {c.prohibited.map((p) => (
            <p key={p} className="flex items-start gap-2.5 px-3.5 py-2.5 text-[13.5px]">
              <X className="mt-0.5 size-3.5 shrink-0 text-red" strokeWidth={2.6} />
              {p}
            </p>
          ))}
        </Card>
      </Section>

      <Section title="Treasury policy" note="How creator fees split. Changing it needs a charter amendment.">
        <Split />
      </Section>

      <Section title="If a milestone is missed" note="The charter fixes the options in advance; holders pick one.">
        <div className="grid gap-2 sm:grid-cols-2">
          {FAILURE.map((f) => (
            <Card key={f.name} className="p-3.5">
              <p className="text-[14px] font-semibold">{f.name}</p>
              <p className="mt-1 text-[12.5px] text-ink-2">{f.text}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Versions" note="Every version's hash is stored onchain in the CharterRegistry.">
        <ol className="relative grid gap-4 border-l border-line-2 pl-5">
          {[...c.versions].reverse().map((v, i) => (
            <li key={v.version} className="relative">
              <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-2 ring-panel ${i === 0 ? 'bg-ink' : 'bg-ink-4'}`} />
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                <span className="font-semibold">Version {v.version}</span>
                <span className="text-[12px] text-ink-3">{date(v.at)}</span>
                {i === 0 && <span className="rounded-full bg-sprout px-1.5 text-[10.5px] font-semibold text-on-sprout">In force</span>}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-2">{v.summary}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-3">{hash(v.hash, 12, 10)}</p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  )
}
