import { useCallback, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, Gavel, Scale, ShieldAlert } from 'lucide-react'
import type { Challenge, World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useEvidence, useWorld } from '@/lib/sim'
import { settled, useChallenges } from '@/lib/civic'
import { credit } from '@/lib/wallet'
import { notify } from '@/lib/inbox'
import { ago, date, hash, span, usd } from '@/lib/format'
import { enter, exit, surface } from '@/lib/motion'
import { challengeDetail } from '@/data/detail'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { Timeline } from '@/components/ui/Timeline'
import { WorldMark } from '@/components/ui/WorldMark'
import { VerdictTag } from '@/components/ui/bits'
import { Card, Section } from '@/components/world/parts'
import { NotFound } from './NotFound'
import { Who } from '@/components/ui/Who'

const RULES_AT = 66 // seconds after filing, for a case you opened in this visit
const SETTLES_AT = 72

export function ChallengePage() {
  const { id } = useParams()
  const c = useChallenges().find((x) => x.id === id)
  const w = useWorld(c?.worldId)
  useTitle(c ? `Challenge · ${w?.name ?? ''}` : 'Challenge')
  if (!c || !w) return <NotFound />
  return <Case c={c} w={w} />
}

function Case({ c, w }: { c: Challenge; w: World }) {
  useFieldView({ kind: 'world', id: w.id }, w.id)
  const none = useCallback(() => null, [])
  useLabels(none, w.id, true)
  const now = useNow()
  const e = useEvidence().find((x) => x.id === c.evidenceId)
  const d = useMemo(() => challengeDetail(c, e, w), [c, e, w])
  const live = c.by === 'you'
  // a case you opened is heard while you watch; the others wait for their window
  const elapsed = (now - d.filedAt) / 1000
  const shown = live ? d.panel.filter((p) => elapsed >= p.after) : d.panel.slice(0, 1)
  const ruled = live && elapsed >= RULES_AT
  const upheld = d.panel.filter((p) => p.vote === 'uphold').length >= 2
  const done = settled.use().includes(c.id)
  const reward = Math.round((c.bondUsd * 0.5) / 10) * 10

  // settle once: your bond comes back with a reward, or goes to the challenge reserve
  useEffect(() => {
    if (!live || done || elapsed < SETTLES_AT) return
    settled.set((l) => [...l, c.id])
    if (upheld) {
      credit(c.bondUsd + reward)
      notify({ kind: 'challenge', title: 'Your challenge was upheld', body: `Your ${usd(c.bondUsd)} bond is back with a ${usd(reward)} reward. The payout for that bundle is clawed back to the treasury.`, worldId: w.id, href: `/c/${c.id}` })
    } else notify({ kind: 'challenge', title: 'Your challenge was rejected', body: `The panel sided with the governor. Your ${usd(c.bondUsd)} bond goes to the challenge reserve.`, worldId: w.id, href: `/c/${c.id}` })
  }, [live, done, elapsed, upheld, c.id, c.bondUsd, reward, w.id])

  const stage = !live ? 2 : ruled ? (done ? 5 : 3) : shown.length ? 2 : 1
  const steps = [
    { name: 'Filed', note: live ? 'by you' : date(d.filedAt) },
    { name: 'Counter-bond', note: usd(d.counter) },
    { name: 'Panel', note: `${shown.length} of 3 ruled` },
    { name: 'Ruling', note: ruled ? (upheld ? 'Upheld' : 'Rejected') : live ? `in ${Math.max(0, Math.ceil(RULES_AT - elapsed))}s` : `in ${span(c.endsAt - now)}` },
    { name: 'Settled', note: done ? 'paid out' : '' },
  ]

  return (
    <Panel label={`Challenge case ${d.caseNo}`} width="lg" rest={0.55}>
      <article className="pb-12">
        <header className="px-5 pt-4 lg:px-6 lg:pt-5">
          <Link to={`/w/${w.id}#governance`} className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
            <ArrowLeft className="size-4" /> {w.name} governance
          </Link>
          <p className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-[6px] bg-red-soft px-2 py-1 font-mono text-[10.5px] tracking-wide text-red uppercase">
              <ShieldAlert className="size-3" /> Challenge
            </span>
            <span className="font-mono text-[11px] text-ink-3">Case {d.caseNo}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ruled ? (upheld ? 'bg-sprout text-on-sprout' : 'bg-ink/[0.07]') : 'bg-ink/[0.07] text-ink-2')}>{ruled ? (upheld ? 'Upheld' : 'Rejected') : 'Under review'}</span>
          </p>
          <h1 className="mt-2 text-h2">“{c.claim}”</h1>
          <Link to={`/w/${w.id}`} className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold hover-device:hover:underline">
            <WorldMark world={w} className="size-6" />
            {w.name}
          </Link>
          <Timeline className="mt-5" steps={steps} current={stage} tone={ruled && !upheld ? 'red' : 'green'} />
        </header>

        <Section title="The proof under challenge">
          {e ? (
            <Card className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14.5px] leading-snug font-semibold">{e.title}</p>
                <VerdictTag verdict="challenged" />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
                {[
                  ['Step', e.step],
                  ['Model', e.model],
                  ['Compute', usd(e.costUsd)],
                  ['Published', `${ago(e.at, now)} ago`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="truncate font-mono text-[12px]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 border-t border-line pt-2.5 font-mono text-[11px] text-ink-3">Proof {hash(e.ref, 12, 10)}</p>
            </Card>
          ) : (
            <p className="text-[13px] text-ink-3">The bundle has rolled out of the live log; its hash is kept with the case.</p>
          )}
        </Section>

        <Section title="Both sides" note="Each side puts money behind its position. The loser's bond pays the winner and the reserve.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Card className="p-3.5 ring-red/30">
              <p className="label">Challenger</p>
              <p className="mt-1 text-[15px] font-semibold">{live ? 'You' : <Who handle={c.by} />}</p>
              <p className="mt-2 font-display text-[26px] leading-none font-[560] tabular">{usd(c.bondUsd)}</p>
              <p className="mt-1 text-[12px] text-ink-3">bond posted</p>
              <p className="mt-3 text-[13px] text-ink-2">“{c.claim}”</p>
            </Card>
            <Card className="p-3.5">
              <p className="label">Defence</p>
              <p className="mt-1 text-[15px] font-semibold">{w.name} governor</p>
              <p className="mt-2 font-display text-[26px] leading-none font-[560] tabular">{usd(d.counter)}</p>
              <p className="mt-1 text-[12px] text-ink-3">counter-bond from the challenge reserve</p>
              <p className="mt-3 text-[13px] text-ink-2">{d.defense}</p>
            </Card>
          </div>
        </Section>

        <Section title="The panel" note="Three verifiers, two agents and a person, drawn at random from the approved list. Two of three decide.">
          <ul className="grid gap-2">
            {d.panel.map((p) => {
              const voted = shown.includes(p)
              return (
                <li key={p.who} className="rounded-[12px] bg-raised/80 p-3.5 ring-1 ring-line ring-inset">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full', p.kind === 'Agent' ? 'bg-water' : 'bg-ink/[0.06]')}>
                      {p.kind === 'Agent' ? <Scale className="size-4" /> : <Gavel className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13px] font-medium">
                        <Who handle={p.who} />
                      </p>
                      <p className="text-[11.5px] text-ink-3">{p.kind}{p.model ? ` · ${p.model}` : ''}</p>
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      {voted ? (
                        <m.span key="v" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={enter} className={cn('rounded-full px-2.5 py-1 text-[11.5px] font-semibold', p.vote === 'uphold' ? 'bg-red-soft text-red' : 'bg-ink/[0.07]')}>
                          {p.vote === 'uphold' ? 'Uphold' : 'Reject'}
                        </m.span>
                      ) : (
                        <m.span key="p" exit={{ opacity: 0, transition: exit }} className="flex items-center gap-1.5 text-[12px] text-ink-3">
                          <span className="breathe size-1.5 rounded-full bg-ink-4" /> Reviewing
                        </m.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <AnimatePresence initial={false}>
                    {voted && (
                      <m.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={enter} className="overflow-hidden text-[13px] text-ink-2">
                        <span className="block pt-2.5">{p.reason}</span>
                      </m.p>
                    )}
                  </AnimatePresence>
                </li>
              )
            })}
          </ul>
        </Section>

        <Section title="Ruling">
          <AnimatePresence mode="wait" initial={false}>
            {ruled ? (
              <m.div key="r" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={surface} className={cn('rounded-[14px] p-4', upheld ? 'bg-sprout text-on-sprout' : 'ink-card')}>
                <p className="font-display text-[22px] font-[560]">{upheld ? 'Upheld, two to one' : 'Rejected'}</p>
                <p className="mt-1 text-[13.5px] opacity-85">
                  {upheld ? `Your ${usd(c.bondUsd)} bond comes back with a ${usd(reward)} reward. The governor's payout for this bundle is clawed back to the ${w.name} treasury, and the objective it counted toward is re-checked.` : `The panel sided with the governor. Your bond goes to the challenge reserve.`}
                </p>
                <p className="mt-2 text-[12.5px] font-semibold">{done ? (upheld ? `${usd(c.bondUsd + reward)} returned to your wallet.` : 'Settled.') : 'Settling…'}</p>
              </m.div>
            ) : (
              <m.div key="w" exit={{ opacity: 0, transition: exit }} className="rounded-[14px] p-4 ring-1 ring-line ring-inset">
                <p className="text-[14px] font-semibold">Waiting on the panel</p>
                <p className="mt-1 text-[13px] text-ink-2">
                  {live ? `The ruling lands in about ${Math.max(0, Math.ceil(RULES_AT - elapsed))} seconds in this demo (up to 72 hours for real).` : `The window closes in ${span(c.endsAt - now)}. Until then the payout for this bundle is held.`}
                </p>
              </m.div>
            )}
          </AnimatePresence>
        </Section>
      </article>
    </Panel>
  )
}
