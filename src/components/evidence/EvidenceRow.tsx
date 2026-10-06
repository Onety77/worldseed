import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown, ShieldAlert } from 'lucide-react'
import type { Evidence, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { ago, hash, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { EASE_OUT } from '@/lib/motion'
import { fileChallenge, filed } from '@/lib/civic'
import { wallet } from '@/lib/wallet'
import { notify } from '@/lib/inbox'
import { connectOpen } from '@/components/wallet/Connect'
import { VerdictTag } from '@/components/ui/bits'
import { WorldMark } from '@/components/ui/WorldMark'
import { toast } from '@/lib/toast'

/*
  One evidence bundle: what a governor did, which model did it, what it cost and where the
  proof lives. Open it to see the inputs that make it auditable, and to put up a bond
  challenging it if you think the proof is wrong.
*/

const stepTone: Record<Evidence['step'], string> = {
  Observe: 'bg-ink/[0.06]',
  Propose: 'bg-ink/[0.06]',
  Simulate: 'bg-water',
  Approve: 'bg-ink/[0.06]',
  Execute: 'bg-sprout-soft',
  'Publish proof': 'bg-sprout-soft',
  Evaluate: 'bg-water',
}

export function EvidenceRow({ e, world, showWorld = false, arrive = false }: { e: Evidence; world: World; showWorld?: boolean; arrive?: boolean }) {
  const now = useNow()
  const [open, setOpen] = useState(false)
  const mine = filed.use().find((c) => c.evidenceId === e.id)
  const verdict = mine ? 'challenged' : e.verdict
  const id = useId()

  return (
    <m.li
      className={cn('overflow-hidden rounded-[12px] transition-colors', open ? 'bg-raised shadow-[0_0_0_1px_var(--line)]' : 'hover-device:hover:bg-raised/70')}
      initial={arrive ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="flex w-full items-start gap-3 px-3 py-3 text-left">
        {showWorld ? <WorldMark world={world} className="mt-0.5 size-7" /> : <span className={cn('mt-0.5 shrink-0 rounded-[6px] px-1.5 py-1 font-mono text-[10px] leading-none tracking-wide uppercase', stepTone[e.step])}>{e.step}</span>}
        <span className="min-w-0 flex-1">
          {showWorld && (
            <span className="mb-0.5 flex items-center gap-2 text-[12px] text-ink-3">
              <span className="font-semibold text-ink">{world.name}</span>
              <span className={cn('rounded-[5px] px-1 py-0.5 font-mono text-[9.5px] leading-none tracking-wide uppercase', stepTone[e.step])}>{e.step}</span>
            </span>
          )}
          <span className="block text-[14px] leading-snug font-medium">{e.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3">
            <span>{e.model}</span>
            <span>{e.costUsd < 1 ? `$${e.costUsd.toFixed(2)}` : usd(e.costUsd)} compute</span>
            <span className="tabular">{ago(e.at, now)} ago</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <VerdictTag verdict={verdict} />
          <ChevronDown className={cn('size-4 text-ink-3 transition-transform duration-300', open && 'rotate-180')} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="overflow-hidden">
            <Bundle e={e} world={world} mine={Boolean(mine)} mineId={mine?.id} />
          </m.div>
        )}
      </AnimatePresence>
    </m.li>
  )
}

function Bundle({ e, world, mine, mineId }: { e: Evidence; world: World; mine: boolean; mineId?: string }) {
  const charter = world.charter.versions[world.charter.versions.length - 1]
  const role = world.governor.roles.find((r) => r.model === e.model)?.role ?? 'Planning'
  const rows: [string, string][] = [
    ['Charter', `v${charter.version} · ${hash(charter.hash, 8, 6)}`],
    ['Policy check', e.kind === 'grant' ? 'Within the grants cap, timelocked 24h' : e.kind === 'deploy' ? 'Registry module, audited source' : 'Within category caps'],
    ['Model', `${e.model} · ${role}`],
    ['Simulation', e.step === 'Observe' ? 'Not required' : 'Forked state, passed'],
    ['Proof', hash(e.ref, 10, 8)],
  ]
  return (
    <div className="px-3 pb-3">
      <dl className="grid gap-1.5 rounded-[10px] bg-paper/70 p-3 ring-1 ring-line ring-inset">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 text-[12.5px]">
            <dt className="text-ink-3">{k}</dt>
            <dd className="truncate text-right font-mono text-[11.5px] text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
      {mine ? (
        <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-red-soft px-3 py-2.5 text-[13px] text-ink">
          <ShieldAlert className="size-4 shrink-0 text-red" />
          <span className="flex-1">You challenged this bundle. Its payout is held while the panel reviews it.</span>
          <Link to={`/c/${mineId}`} className="shrink-0 font-semibold underline underline-offset-4">
            Follow the case
          </Link>
        </p>
      ) : e.verdict === 'pending' || e.verdict === 'passed' ? (
        <Challenge e={e} />
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-3">{e.verdict === 'challenged' ? 'Already under challenge. Bonds are held until it resolves.' : 'This bundle failed verification; the governor was not paid for it.'}</p>
      )}
    </div>
  )
}

const reasons = ['The proof does not show what the title claims', 'The users or revenue counted look manufactured', 'It breaks a prohibited action in the charter', 'It was delivered after the deadline']

/** Put up a bond against a bundle. If the challenge is upheld you get it back with a reward. */
function Challenge({ e }: { e: Evidence }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(reasons[0])
  const bond = Math.max(250, Math.round((e.costUsd * 40) / 50) * 50)
  const me = wallet.use()
  if (!open) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-3">Think this proof is wrong? Anyone can challenge it with a bond.</p>
        <button onClick={() => (me.connected ? setOpen(true) : connectOpen.set(true))} className={buttonClass('danger', 'sm')}>
          Challenge
        </button>
      </div>
    )
  }
  return (
    <form
      className="mt-3 rounded-[10px] p-3 ring-1 ring-red/30 ring-inset"
      onSubmit={(ev) => {
        ev.preventDefault()
        const c = fileChallenge({ worldId: e.worldId, evidenceId: e.id, bondUsd: bond, claim: reason })
        toast({ text: `Challenge filed with a $${bond} bond` })
        notify({ kind: 'challenge', title: 'Challenge filed', body: `Bond of $${bond} posted against “${e.title}”. A verifier panel is reviewing it now.`, worldId: e.worldId, href: `/c/${c.id}` })
      }}
    >
      <fieldset>
        <legend className="text-[13px] font-semibold">What is wrong with it?</legend>
        <div className="mt-2 grid gap-1">
          {reasons.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px] hover-device:hover:bg-hover">
              <input type="radio" name={`reason-${e.id}`} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--red)]" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-2">
          Bond <span className="font-mono font-medium text-ink">{usd(bond)}</span> · returned with a reward if upheld
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'sm')}>
            Cancel
          </button>
          <button type="submit" className={buttonClass('ink', 'sm')}>
            Post bond and challenge
          </button>
        </div>
      </div>
    </form>
  )
}
