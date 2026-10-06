import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { m } from 'motion/react'
import type { Proposal, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { votes } from '@/lib/civic'
import { pct, span } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { EASE_OUT } from '@/lib/motion'
import { WorldMark } from '@/components/ui/WorldMark'
import { wallet } from '@/lib/wallet'
import { notify } from '@/lib/inbox'
import { connectOpen } from '@/components/wallet/Connect'

/** A holder vote: what it changes, the tally, and when it can execute. */
export function ProposalCard({ p, world }: { p: Proposal; world?: World }) {
  const now = useNow()
  const mine = votes.use()[p.id]
  const total = p.forPct + p.againstPct
  const forShare = p.forPct / total
  const me = wallet.use()
  const vote = (v: 'for' | 'against') => {
    if (!me.connected) return connectOpen.set(true)
    votes.set((x) => ({ ...x, [p.id]: v }))
    notify({ kind: 'vote', title: `You voted ${v}`, body: p.title, worldId: p.worldId, href: `/p/${p.id}` })
  }

  return (
    <li className="rounded-[12px] bg-raised/80 p-3.5 ring-1 ring-line ring-inset">
      <div className="flex items-start gap-3">
        {world && <WorldMark world={world} className="mt-0.5 size-7" />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
            {world && <span className="font-semibold text-ink">{world.name}</span>}
            <span className={cn('rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase', p.kind === 'Sovereignty' ? 'bg-sprout text-on-sprout' : p.kind === 'Governor election' ? 'bg-red-soft text-red' : 'bg-ink/[0.06]')}>{p.kind}</span>
          </p>
          <Link to={`/p/${p.id}`} className="mt-1 block text-[14.5px] leading-snug font-semibold underline-offset-4 hover-device:hover:underline">
            {p.title}
          </Link>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex h-2 overflow-hidden rounded-full bg-ink/[0.08]">
          <m.span className="h-full bg-ink" initial={false} animate={{ width: `${forShare * 100}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
          <span className="h-full w-[2px] bg-panel" />
          <span className="h-full flex-1 bg-red/50" />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular">
          <span>For {pct(forShare)}</span>
          <span className="text-ink-3">turnout {pct(p.turnoutPct)}</span>
          <span className="text-red">Against {pct(1 - forShare)}</span>
        </div>
      </div>

      <Link to={`/p/${p.id}`} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-2 hover-device:hover:text-ink">
        What changes, and the discussion <ArrowRight className="size-3.5" />
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-3">
          {p.status === 'timelock' ? (
            <>
              Passed · executes after timelock in <span className="font-mono text-ink tabular">{span(p.endsAt - now)}</span>
            </>
          ) : (
            <>
              Voting closes in <span className="font-mono text-ink tabular">{span(p.endsAt - now)}</span> · {p.timelockH}h timelock
            </>
          )}
        </p>
        {p.status === 'voting' &&
          (mine ? (
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-green">
              <Check className="size-3.5" strokeWidth={2.6} /> You voted {mine}
            </span>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={() => vote('for')} className={buttonClass('ink', 'sm')}>
                Vote for
              </button>
              <button onClick={() => vote('against')} className={buttonClass('outline', 'sm')}>
                Against
              </button>
            </div>
          ))}
      </div>
    </li>
  )
}
