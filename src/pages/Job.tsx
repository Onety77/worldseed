import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, Check, CircleDashed, Wallet } from 'lucide-react'
import type { Job, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useWorld } from '@/lib/sim'
import { jobs, runs, setRun, type JobRun } from '@/lib/civic'
import { claimJob, credit, wallet } from '@/lib/wallet'
import { notify } from '@/lib/inbox'
import { ago, span, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { EASE_OUT } from '@/lib/motion'
import { jobDetail } from '@/data/detail'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { Timeline } from '@/components/ui/Timeline'
import { WorldMark } from '@/components/ui/WorldMark'
import { Card, Section } from '@/components/world/parts'
import { connectOpen } from '@/components/wallet/Connect'
import { NotFound } from './NotFound'

const REVIEW_STARTS = 1.2 // seconds after you submit
const CHECK_EVERY = 2.2
const steps = ['Open', 'Claimed', 'Submitted', 'In review', 'Window', 'Paid']

export function JobPage() {
  const { id } = useParams()
  const j = jobs.find((x) => x.id === id)
  const w = useWorld(j?.worldId)
  useTitle(j ? `${j.category} · ${w?.name ?? ''}` : 'Job')
  if (!j || !w) return <NotFound />
  return <Page j={j} w={w} />
}

/** Where your run is now, from when you submitted; the page moves it along. */
function phase(run: JobRun | undefined, now: number, checks: number, window: number) {
  if (!run) return { stage: -1, passed: 0, left: 0 }
  if (run.stage === 'paid') return { stage: 5, passed: checks, left: 0 }
  if (run.stage === 'claimed') return { stage: 1, passed: 0, left: 0 }
  const t = (now - run.at) / 1000
  if (t < REVIEW_STARTS) return { stage: 2, passed: 0, left: 0 }
  const passed = Math.min(checks, Math.floor((t - REVIEW_STARTS) / CHECK_EVERY))
  if (passed < checks) return { stage: 3, passed, left: 0 }
  const opened = REVIEW_STARTS + checks * CHECK_EVERY
  const left = window - (t - opened)
  return left > 0 ? { stage: 4, passed, left } : { stage: 5, passed, left: 0 }
}

function Page({ j, w }: { j: Job; w: World }) {
  useFieldView({ kind: 'world', id: w.id }, w.id)
  const none = useCallback(() => null, [])
  useLabels(none, w.id, true)
  const now = useNow()
  const d = useMemo(() => jobDetail(j, w), [j, w])
  const run = runs.use()[j.id]
  const ph = phase(run, now, d.checks.length, d.window)

  // when your window closes, escrow releases to you, once
  useEffect(() => {
    if (!run || run.stage === 'paid' || ph.stage !== 5) return
    setRun(j.id, { ...run, stage: 'paid', at: Date.now() })
    credit(j.escrowUsd)
    notify({ kind: 'job', title: 'Job paid', body: `${usd(j.escrowUsd)} released from escrow for “${j.title}”.`, worldId: w.id, href: `/j/${j.id}` })
  }, [ph.stage, run, j.id, j.escrowUsd, j.title, w.id])

  const theirs = !run && j.status !== 'open'
  const current = run ? (ph.stage === 5 ? 6 : ph.stage) : j.status === 'open' ? 0 : j.status === 'in review' ? 3 : j.status === 'challenge window' ? 4 : 6

  return (
    <Panel label={`Job: ${j.title}`} width="lg" rest={0.55}>
      <article className="pb-12">
        <header className="px-5 pt-4 lg:px-6 lg:pt-5">
          <Link to={`/w/${w.id}#work`} className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
            <ArrowLeft className="size-4" /> {w.name} jobs
          </Link>
          <p className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] bg-ink/[0.06] px-2 py-1 font-mono text-[10.5px] tracking-wide uppercase">{j.category}</span>
            <span className="font-mono text-[11px] text-ink-3">Job {j.id.split('-').pop()?.toUpperCase()}</span>
          </p>
          <h1 className="mt-2 text-h2">{j.title}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Link to={`/w/${w.id}`} className="inline-flex items-center gap-2 text-[13px] font-semibold hover-device:hover:underline">
              <WorldMark world={w} className="size-6" />
              {w.name}
            </Link>
            <p className="text-right">
              <span className="font-display text-[26px] leading-none font-[560] tabular">{usd(j.escrowUsd)}</span>
              <span className="ml-1.5 text-[12px] text-ink-3">in escrow</span>
            </p>
          </div>
          <Timeline className="mt-5" steps={steps.map((s, i) => ({ name: s, note: i === 4 && ph.stage === 4 ? `${Math.ceil(ph.left)}s left` : undefined }))} current={current} />
        </header>

        <Section title="The brief" note={d.summary}>
          <Card className="divide-y divide-line">
            <div className="p-3.5">
              <p className="label">Deliver</p>
              <ul className="mt-2 grid gap-1.5">
                {d.deliverables.map((x) => (
                  <li key={x} className="flex gap-2.5 text-[13.5px]">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-4" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-3.5">
              <p className="label">Accepted when</p>
              <ul className="mt-2 grid gap-1.5">
                {d.acceptance.map((x) => (
                  <li key={x} className="flex gap-2.5 text-[13.5px] text-ink-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-green" strokeWidth={2.6} />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-3.5 text-[12.5px] sm:grid-cols-3">
              <div>
                <dt className="text-ink-3">Verifier</dt>
                <dd className="font-medium">{j.verifier}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Closes</dt>
                <dd className="font-mono tabular">in {span(j.endsAt - now)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Paid by</dt>
                <dd className="font-medium">JobEscrow · {w.name}</dd>
              </div>
            </dl>
          </Card>
        </Section>

        <Section title={theirs ? 'Who is doing it' : 'Your work'}>{theirs ? <Theirs j={j} now={now} /> : <Yours j={j} w={w} run={run} ph={ph} checks={d.checks} />}</Section>

        <Section title="Also interested" note="Others watching or applying. First verified delivery is paid.">
          <ul className="divide-y divide-line overflow-hidden rounded-[12px] ring-1 ring-line ring-inset">
            {d.others.map((o) => (
              <li key={o.who} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12.5px] font-medium">{o.who}</span>
                  <span className="block text-[12px] text-ink-3">{o.note}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{ago(o.at, now)} ago</span>
              </li>
            ))}
          </ul>
        </Section>
      </article>
    </Panel>
  )
}

function Theirs({ j, now }: { j: Job; now: number }) {
  return (
    <Card className="p-3.5">
      <p className="text-[14px]">
        <span className="font-mono font-medium">{j.claimant}</span> <span className="text-ink-2">claimed this job and submitted work.</span>
      </p>
      <p className="mt-2 text-[13px] text-ink-2">
        {j.status === 'paid' ? 'It passed review and the window closed without a challenge. Escrow has been released.' : j.status === 'challenge window' ? `It passed review. Escrow releases in ${span(j.endsAt - now)} unless someone challenges it.` : 'The verifier is reviewing it now.'}
      </p>
    </Card>
  )
}

function Yours({ j, w, run, ph, checks }: { j: Job; w: World; run: JobRun | undefined; ph: ReturnType<typeof phase>; checks: string[] }) {
  const me = wallet.use()
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')
  const [ok, setOk] = useState(false)
  const lid = useId()

  if (!me.connected)
    return (
      <Card className="p-4">
        <p className="text-[14px] text-ink-2">Connect a wallet to claim this job. You are paid to the same wallet when the work is verified.</p>
        <button onClick={() => connectOpen.set(true)} className={buttonClass('ink', 'md', 'mt-3')}>
          <Wallet className="size-4" /> Connect a wallet
        </button>
      </Card>
    )

  if (!run)
    return (
      <Card className="p-4">
        <p className="text-[14px] text-ink-2">Claim it to start. Claiming tells others you are on it; payment still goes to the first delivery that passes.</p>
        <button onClick={() => claimJob(j.id, j.title, w.id)} className={buttonClass('primary', 'md', 'mt-3')}>
          Claim this job
        </button>
      </Card>
    )

  if (run.stage === 'claimed')
    return (
      <form
        className="rounded-[12px] bg-raised/80 p-4 ring-1 ring-line ring-inset"
        onSubmit={(e) => {
          e.preventDefault()
          if (!link.trim() || !ok) return
          setRun(j.id, { stage: 'submitted', link: link.trim(), notes: notes.trim(), at: Date.now() })
          notify({ kind: 'job', title: 'Work submitted', body: `“${j.title}” is with the verifier.`, worldId: w.id, href: `/j/${j.id}` })
        }}
      >
        <p className="text-[13.5px] font-semibold text-green">Claimed by you.</p>
        <label htmlFor={`${lid}-link`} className="mt-3 block text-[13px] font-semibold">
          Link to your delivery
        </label>
        <input id={`${lid}-link`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/you/delivery" className="mt-1.5 w-full rounded-control bg-paper px-3.5 py-2.5 font-mono text-[13px] ring-1 ring-line-2 ring-inset outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-ink" />
        <label htmlFor={`${lid}-notes`} className="mt-3 block text-[13px] font-semibold">
          Notes for the verifier <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea id={`${lid}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you built, how to check it, anything that differs from the brief." className="mt-1.5 w-full resize-none rounded-control bg-paper px-3.5 py-2.5 text-[13.5px] ring-1 ring-line-2 ring-inset outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-ink" />
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ink)]" />
          It meets every point in the brief, and I wrote it or have the right to deliver it.
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setLink('https://github.com/you/' + j.category.toLowerCase().replace(/\s+/g, '-'))} className="text-[12.5px] font-semibold text-ink-2 underline decoration-ink-4 underline-offset-4">
            Use a sample link
          </button>
          <button type="submit" disabled={!link.trim() || !ok} className={buttonClass('ink', 'md')}>
            Submit for review
          </button>
        </div>
      </form>
    )

  // submitted: the verifier works through its checks, then the window runs, then escrow pays
  return (
    <div className="grid gap-3">
      <Card className="p-4">
        <p className="label">Your delivery</p>
        <p className="mt-1 truncate font-mono text-[13px]">{run.link}</p>
        {run.notes && <p className="mt-1.5 text-[13px] text-ink-2">{run.notes}</p>}
      </Card>
      <Card className="p-4">
        <p className="text-[14px] font-semibold">Verifier checks</p>
        <ul className="mt-3 grid gap-2">
          {checks.map((c, i) => {
            const done = i < ph.passed
            const now = i === ph.passed && ph.stage === 3
            return (
              <li key={c} className={cn('flex items-center gap-2.5 text-[13.5px]', done ? 'text-ink' : 'text-ink-3')}>
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <m.span key="d" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 24 }} className="grid size-5 place-items-center rounded-full bg-sprout text-on-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.2)]">
                      <Check className="size-3" strokeWidth={3} />
                    </m.span>
                  ) : (
                    <m.span key="p" className={cn('grid size-5 place-items-center', now && 'animate-spin [animation-duration:2.4s]')}>
                      <CircleDashed className="size-4" />
                    </m.span>
                  )}
                </AnimatePresence>
                {c}
              </li>
            )
          })}
        </ul>
      </Card>
      <AnimatePresence>
        {ph.stage >= 4 && (
          <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }} className={cn('rounded-[14px] p-4', ph.stage === 5 ? 'bg-sprout text-on-sprout' : 'ring-1 ring-line ring-inset')}>
            {ph.stage === 5 ? (
              <>
                <p className="font-display text-[22px] font-[560]">Paid {usd(j.escrowUsd)}</p>
                <p className="mt-1 text-[13.5px] opacity-85">Escrow released to your wallet. The governor logged the delivery as a proof in {w.name}'s log.</p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold">Challenge window</p>
                <p className="mt-1 text-[13px] text-ink-2">
                  Passed review. Anyone can challenge it for another <span className="font-mono text-ink tabular">{Math.ceil(ph.left)}s</span> (72 hours for real); then escrow pays you.
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
                  <span className="block h-full bg-ink/70 transition-[width] duration-1000 ease-linear" style={{ width: `${(1 - ph.left / 45) * 100}%` }} />
                </div>
              </>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
