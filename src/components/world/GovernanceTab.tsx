import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useChallenges, useProposals } from '@/lib/civic'
import { ProposalCard } from '@/components/civic/ProposalCard'
import { ChallengeCard } from '@/components/civic/ChallengeCard'
import { FAILURE } from './CharterTab'
import { Card, Section } from './parts'

export function GovernanceTab({ w }: { w: World }) {
  const props = useProposals().filter((p) => p.worldId === w.id)
  const chals = useChallenges().filter((c) => c.worldId === w.id && c.status === 'open')
  const failed = w.charter.objectives.some((o) => o.status === 'failed')
  const electing = props.some((p) => p.kind === 'Governor election')

  return (
    <>
      <Section title="Votes" note="Charter changes, model changes, large grants and novel deployments all need holders, then a timelock.">
        {props.length ? (
          <ul className="grid gap-2">
            {props.map((p) => (
              <ProposalCard key={p.id} p={p} />
            ))}
          </ul>
        ) : (
          <p className="rounded-[12px] px-4 py-6 text-center text-[13px] text-ink-3 ring-1 ring-line ring-inset">No votes open. The governor is working inside its charter.</p>
        )}
      </Section>

      <Section title="Open challenges" note="Bonds against evidence bundles. Payouts are held until each one resolves.">
        {chals.length ? (
          <ul className="grid gap-2">
            {chals.map((c) => (
              <ChallengeCard key={c.id} c={c} />
            ))}
          </ul>
        ) : (
          <p className="rounded-[12px] px-4 py-6 text-center text-[13px] text-ink-3 ring-1 ring-line ring-inset">Nothing challenged. Open any bundle in the governor log to challenge it.</p>
        )}
      </Section>

      <Section title="Exit routes" note={failed ? 'A milestone was missed, so these are live. Holders are choosing now.' : 'Fixed in the charter. They open only if a milestone is missed.'}>
        <div className="grid gap-2 sm:grid-cols-2">
          {FAILURE.map((f) => {
            const live = failed && (f.name === 'Governor election' ? electing : f.name === 'Recovery amendment')
            return (
              <Card key={f.name} className={cn('p-3.5', live && 'ring-red/35')}>
                <p className="flex items-center justify-between text-[14px] font-semibold">
                  {f.name}
                  {live && <span className="font-mono text-[10px] font-medium tracking-wide text-red uppercase">{f.name === 'Recovery amendment' ? 'Adopted' : 'Voting'}</span>}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-2">{f.text}</p>
              </Card>
            )
          })}
        </div>
      </Section>
    </>
  )
}
