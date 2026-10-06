import { ShieldAlert } from 'lucide-react'
import type { Challenge, World } from '@/lib/types'
import { useNow } from '@/lib/clock'
import { span, usd } from '@/lib/format'
import { useEvidence } from '@/lib/sim'

/** An open challenge: who bonded what against which proof, and when it resolves. */
export function ChallengeCard({ c, world }: { c: Challenge; world?: World }) {
  const now = useNow()
  const e = useEvidence().find((x) => x.id === c.evidenceId)
  return (
    <li className="rounded-[12px] bg-raised/80 p-3.5 ring-1 ring-red/25 ring-inset">
      <p className="flex items-center gap-2 text-[12px] text-ink-3">
        <ShieldAlert className="size-3.5 text-red" />
        {world && <span className="font-semibold text-ink">{world.name}</span>}
        <span>
          {c.by === 'you' ? 'You' : c.by} bonded <span className="font-mono text-ink">{usd(c.bondUsd)}</span>
        </span>
      </p>
      <p className="mt-1.5 text-[14px] leading-snug font-semibold">“{c.claim}”</p>
      {e && <p className="mt-1 truncate text-[12.5px] text-ink-3">Against: {e.title}</p>}
      <p className="mt-2 text-[12px] text-ink-3">
        Verifier panel rules in <span className="font-mono text-ink tabular">{span(c.endsAt - now)}</span>. Upheld: the bond returns with a reward and the payout is clawed back.
      </p>
    </li>
  )
}
