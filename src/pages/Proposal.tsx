import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, Check, Minus, Plus } from 'lucide-react'
import type { Proposal, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useWorld } from '@/lib/sim'
import { posted, useProposals, votes } from '@/lib/civic'
import { wallet } from '@/lib/wallet'
import { notify } from '@/lib/inbox'
import { ago, date, hash, num, pct, span } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { enter, grow } from '@/lib/motion'
import { proposalDetail, type Comment } from '@/data/detail'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { Timeline } from '@/components/ui/Timeline'
import { WorldMark } from '@/components/ui/WorldMark'
import { Section } from '@/components/world/parts'
import { connectOpen } from '@/components/wallet/Connect'
import { NotFound } from './NotFound'
import { Avatar, Who } from '@/components/ui/Who'
import { toast } from '@/lib/toast'

export function ProposalPage() {
  const { id } = useParams()
  const p = useProposals().find((x) => x.id === id)
  const w = useWorld(p?.worldId)
  useTitle(p ? `${p.kind} · ${w?.name ?? ''}` : 'Proposal')
  if (!p || !w) return <NotFound />
  return <Page p={p} w={w} />
}

const kindTone: Record<Proposal['kind'], string> = {
  Sovereignty: 'bg-sprout text-on-sprout',
  'Governor election': 'bg-red-soft text-red',
  'Charter amendment': 'bg-ink/[0.06]',
  'Model change': 'bg-ink/[0.06]',
  'Large grant': 'bg-ink/[0.06]',
  'Novel deployment': 'bg-ink/[0.06]',
}

function Page({ p, w }: { p: Proposal; w: World }) {
  useFieldView({ kind: 'world', id: w.id }, w.id)
  const none = useCallback(() => null, [])
  useLabels(none, w.id, true)
  const now = useNow()
  const d = useMemo(() => proposalDetail(p, w), [p, w])
  const timelockEnds = p.status === 'timelock' ? p.endsAt : p.endsAt + p.timelockH * 3_600_000
  const steps = [
    { name: 'Proposed', note: date(d.created) },
    { name: 'Voting', note: p.status === 'voting' ? `closes in ${span(p.endsAt - now)}` : 'closed' },
    { name: 'Timelock', note: `${p.timelockH}h` },
    { name: 'Executes', note: date(timelockEnds) },
  ]

  return (
    <Panel label={`Proposal: ${p.title}`} width="lg" rest={0.55}>
      <article className="pb-12">
        <header className="px-5 pt-4 lg:px-6 lg:pt-5">
          <Link to={`/w/${w.id}#governance`} className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
            <ArrowLeft className="size-4" /> {w.name} governance
          </Link>
          <p className="mt-4 flex flex-wrap items-center gap-2">
            <span className={cn('rounded-[6px] px-2 py-1 font-mono text-[10.5px] tracking-wide uppercase', kindTone[p.kind])}>{p.kind}</span>
            <span className="font-mono text-[11px] text-ink-3">Proposal {p.id.split('-').pop()?.toUpperCase()}</span>
          </p>
          <h1 className="mt-2 text-h2">{p.title}</h1>
          <Link to={`/w/${w.id}`} className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold hover-device:hover:underline">
            <WorldMark world={w} className="size-6" />
            {w.name}
            <span className="font-mono text-[11px] font-normal text-ink-3">{w.ticker}</span>
          </Link>
          <Timeline className="mt-5" steps={steps} current={p.status === 'voting' ? 1 : p.status === 'timelock' ? 2 : 3} />
        </header>

        <Section title="What changes" note={`Proposed by ${d.proposer}. Simulated before it was put to a vote.`}>
          <div className="grid gap-3">
            {d.hunks.map((h) => (
              <div key={h.label} className="overflow-hidden rounded-[12px] ring-1 ring-line ring-inset">
                <p className="border-b border-line bg-ink/[0.03] px-3.5 py-2 font-mono text-[11.5px] text-ink-2">{h.label}</p>
                <div className="font-mono text-[12.5px] leading-relaxed">
                  {h.before
                    .filter((x) => !h.after.includes(x))
                    .map((line) => (
                      <p key={'-' + line} className="flex gap-2 bg-red-soft px-3.5 py-1">
                        <Minus className="mt-1 size-3 shrink-0 text-red" strokeWidth={3} />
                        <span className="text-ink-2 line-through decoration-red/40">{line}</span>
                      </p>
                    ))}
                  {h.after.map((line) => {
                    const kept = h.before.includes(line)
                    return (
                      <p key={'+' + line} className={cn('flex gap-2 px-3.5 py-1', kept ? 'bg-transparent text-ink-3' : 'bg-sprout-soft')}>
                        {kept ? <span className="w-3 shrink-0" /> : <Plus className="mt-1 size-3 shrink-0 text-green" strokeWidth={3} />}
                        <span>{line}</span>
                      </p>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{d.rationale}</p>
          <p className="mt-2 font-mono text-[11px] text-ink-3">Simulation bundle {hash(d.ref, 10, 8)}</p>
        </Section>

        <Vote p={p} w={w} quorum={d.quorum} />
        <Voters p={p} w={w} voters={d.voters} />
        <Discussion p={p} w={w} comments={d.comments} />
      </article>
    </Panel>
  )
}

function Vote({ p, w, quorum }: { p: Proposal; w: World; quorum: number }) {
  const me = wallet.use()
  const mine = votes.use()[p.id]
  const now = useNow()
  const held = me.holdings[w.id]?.tokens ?? 0
  const total = p.forPct + p.againstPct
  const forShare = p.forPct / total
  const cast = (v: 'for' | 'against') => {
    if (!me.connected) return connectOpen.set(true)
    votes.set((x) => ({ ...x, [p.id]: v }))
    notify({ kind: 'vote', title: `You voted ${v}`, body: p.title, worldId: w.id, href: `/p/${p.id}` })
    toast({ text: `Voted ${v}. Your weight is in the tally.` })
  }
  return (
    <Section title="The vote" note={`Passes with a majority and at least ${pct(quorum)} of supply voting. Then a ${p.timelockH}-hour timelock before it executes.`}>
      <div className="rounded-[12px] bg-raised/80 p-4 ring-1 ring-line ring-inset">
        <div className="flex items-end justify-between">
          <div>
            <p className="label">For</p>
            <p className="font-display text-[30px] leading-none font-[560] tabular">{pct(forShare, 1)}</p>
          </div>
          <div className="text-right">
            <p className="label">Against</p>
            <p className="font-display text-[30px] leading-none font-[560] text-red tabular">{pct(1 - forShare, 1)}</p>
          </div>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-ink/[0.08]">
          <m.span className="h-full bg-ink" initial={false} animate={{ width: `${forShare * 100}%` }} transition={grow} />
          <span className="h-full w-[2px] bg-panel" />
          <span className="h-full flex-1 bg-red/50" />
        </div>
        <div className="relative mt-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
            <m.span className="h-full bg-ink/60" initial={false} animate={{ width: `${Math.min(1, p.turnoutPct / 0.5) * 100}%` }} />
          </div>
          <span className="absolute -top-1 h-3.5 w-px bg-ink" style={{ left: `${(quorum / 0.5) * 100}%` }} />
          <p className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-3">
            <span>Turnout {pct(p.turnoutPct, 1)}</span>
            <span>{p.turnoutPct >= quorum ? 'Quorum reached' : `Quorum ${pct(quorum)}`}</span>
          </p>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          {p.status !== 'voting' ? (
            <p className="text-[13.5px] text-ink-2">
              Voting closed. It passed and executes when the timelock clears in <span className="font-mono text-ink tabular">{span(p.endsAt - now)}</span>.
            </p>
          ) : mine ? (
            <p className="flex items-center gap-2 text-[14px] font-semibold text-green">
              <Check className="size-4" strokeWidth={2.6} /> You voted {mine}
              {held > 0 && <span className="font-mono text-[12px] font-normal text-ink-3">with {num(held)} {w.ticker}</span>}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink-2">{me.connected ? (held > 0 ? `You vote with ${num(held)} ${w.ticker}.` : `You hold no ${w.ticker}; your vote is recorded with no weight.`) : 'Connect a wallet to vote.'}</p>
              <div className="flex gap-2">
                <button onClick={() => cast('for')} className={buttonClass('ink', 'md')}>
                  Vote for
                </button>
                <button onClick={() => cast('against')} className={buttonClass('danger', 'md')}>
                  Vote against
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

function Voters({ p, w, voters }: { p: Proposal; w: World; voters: ReturnType<typeof proposalDetail>['voters'] }) {
  const me = wallet.use()
  const mine = votes.use()[p.id]
  const now = useNow()
  const list = mine ? [{ who: 'You', side: mine, weight: Math.round(me.holdings[w.id]?.tokens ?? 0), at: now }, ...voters] : voters
  const top = Math.max(...list.map((v) => v.weight), 1)
  return (
    <Section title="Who voted" note="The largest votes, live.">
      <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line ring-inset">
        <AnimatePresence initial={false}>
          {[...list]
            .sort((a, b) => b.weight - a.weight)
            .map((v) => (
              <m.li key={v.who} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('grid grid-cols-[1fr_auto_72px] items-center gap-3 px-3.5 py-2.5', v.who === 'You' && 'bg-sprout-soft')}>
                <span className="min-w-0 truncate text-[13px]">
                  <Who handle={v.who} className={cn(v.who === 'You' ? 'font-semibold' : 'font-mono text-[12px]')} />
                  <span className="ml-2 text-[11.5px] text-ink-3">{v.who === 'You' ? 'just now' : `${ago(v.at, now)} ago`}</span>
                </span>
                <span className={cn('font-mono text-[11px] font-medium uppercase', v.side === 'for' ? 'text-ink' : 'text-red')}>{v.side}</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
                    <span className={cn('block h-full', v.side === 'for' ? 'bg-ink/70' : 'bg-red/60')} style={{ width: `${(v.weight / top) * 100}%` }} />
                  </span>
                </span>
              </m.li>
            ))}
        </AnimatePresence>
      </ul>
    </Section>
  )
}

function Discussion({ p, w, comments }: { p: Proposal; w: World; comments: Comment[] }) {
  const me = wallet.use()
  const mine = posted.use()[p.id] ?? []
  const now = useNow()
  const [text, setText] = useState('')
  const all: Comment[] = [...comments, ...mine.map((c) => ({ id: c.id, who: 'You', role: 'You' as const, text: c.text, at: c.at }))]
  const post = () => {
    const t = text.trim()
    if (!t) return
    if (!me.connected) return connectOpen.set(true)
    posted.set((x) => ({ ...x, [p.id]: [...(x[p.id] ?? []), { id: `mine-${Date.now()}`, text: t, at: Date.now() }] }))
    setText('')
    toast({ text: 'Comment posted' })
  }
  return (
    <Section title="Discussion" note={`${all.length} comments from holders, agents and the governor.`}>
      <ol className="grid gap-3">
        {all.map((c) => (
          <m.li key={c.id} initial={c.role === 'You' ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={enter} className="flex gap-3">
            {c.role === 'Governor' || c.role === 'You' ? (
              <span aria-hidden className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-medium uppercase', c.role === 'Governor' ? 'ink-card' : 'bg-sprout text-on-sprout')}>
                {c.role === 'Governor' ? 'AI' : 'Yo'}
              </span>
            ) : (
              <Avatar handle={c.who} className="mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <Who handle={c.who} className="font-semibold" />
                <span className="rounded-[5px] bg-ink/[0.05] px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2">{c.role === 'Governor' ? `${w.name} governor` : c.role}</span>
                <span className="text-[11.5px] text-ink-3">{ago(c.at, now)} ago</span>
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{c.text}</p>
            </div>
          </m.li>
        ))}
      </ol>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault()
          post()
        }}
      >
        <label htmlFor="comment" className="text-[13px] font-semibold">
          Add to the discussion
        </label>
        <textarea id="comment" rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Say what you think, and why. Holders read this before they vote." className="mt-1.5 w-full resize-none rounded-control bg-raised px-3.5 py-2.5 text-[14px] leading-relaxed ring-1 ring-line-2 ring-inset outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-ink" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[12px] text-ink-3">{me.connected ? 'Posted under your wallet.' : 'Connect a wallet to post.'}</p>
          <button type="submit" disabled={!text.trim()} className={buttonClass('ink', 'sm')}>
            Post
          </button>
        </div>
      </form>
    </Section>
  )
}
