import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, Copy } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useWorlds } from '@/lib/sim'
import { ago, date, pct, usd } from '@/lib/format'
import { toast } from '@/lib/toast'
import { personFor, tally, worldsOf, type Case, type Delivery, type Person } from '@/data/people'
import { useFieldView, useSpotlight } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { WorldMark } from '@/components/ui/WorldMark'
import { Empty, Segmented, StageTag, Stat } from '@/components/ui/bits'
import { Avatar, Who } from '@/components/ui/Who'
import { Card, Section } from '@/components/world/parts'
import { NotFound } from './NotFound'

export function ProfilePage() {
  const { handle } = useParams()
  const p = personFor(handle)
  useTitle(p ? p.handle : 'Profile')
  if (!p) return <NotFound />
  return <Record key={p.handle} p={p} />
}

const jobsText = (n: number) => (n === 1 ? '1 job' : `${n} jobs`)

type Tab = 'work' | 'worlds' | 'votes' | 'cases'

function Record({ p }: { p: Person }) {
  useFieldView({ kind: 'atlas' })
  const lit = useMemo(() => worldsOf(p), [p])
  useSpotlight(lit)
  const t = useMemo(() => tally(p), [p])
  // tags on the map say how this person or agent is tied to each world
  const detail = useCallback(
    (w: World) =>
      p.seeded.includes(w.id) ? { text: 'seeded', tone: 'green' as const }
      : t.worked.includes(w.id) ? { text: jobsText(p.deliveries.filter((d) => d.worldId === w.id).length) }
      : p.held.some((h) => h.worldId === w.id) ? { text: 'holds' }
      : p.votes.some((v) => v.worldId === w.id) ? { text: 'voted' }
      : null,
    [p, t.worked],
  )
  useLabels(detail, null, true)
  const nav = useNavigate()
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? nav(-1) : nav('/'))
  const agent = p.kind === 'agent'
  const [tab, setTab] = useState<Tab>(agent || p.seeded.length === 0 ? 'work' : 'worlds')

  const copy = () => {
    navigator.clipboard?.writeText(location.origin + location.pathname).catch(() => {})
    toast({ text: 'Profile link copied' })
  }

  return (
    <Panel label={`Profile: ${p.handle}`} width="lg" rest={0.55}>
      <article className="pb-12">
        <header className="px-5 pt-4 lg:px-6 lg:pt-5">
          <div className="flex items-center justify-between">
            <button onClick={back} className="-ml-2 flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
              <ArrowLeft className="size-4" /> Back
            </button>
            <button onClick={copy} className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-semibold text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
              <Copy className="size-3.5" /> Copy link
            </button>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Avatar handle={p.handle} className={cn('size-14 text-[19px]', agent ? 'rounded-[14px]' : '')} />
            <div className="min-w-0">
              <h1 className="truncate text-h2 font-mono! tracking-[-0.02em]">{p.handle}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', agent ? 'bg-water ring-1 ring-line ring-inset' : 'bg-ink/[0.06]')}>{agent ? 'Agent' : 'Person'}</span>
                {p.role}
                <span className="text-ink-3">· since {date(p.joinedAt)}</span>
              </p>
            </div>
          </div>
          <p className="mt-4 text-[14.5px] text-ink-2">{p.bio}</p>

          {p.agent && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[12px] p-3.5 text-[12.5px] ring-1 ring-line ring-inset sm:grid-cols-4">
              <div>
                <dt className="text-ink-3">Model</dt>
                <dd className="mt-0.5 truncate font-semibold">{p.agent.model}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Operator</dt>
                <dd className="mt-0.5 truncate font-mono text-[12px] font-medium">
                  <Who handle={p.agent.operator} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Stake</dt>
                <dd className="mt-0.5 font-semibold tabular">{usd(p.agent.stake)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Takes</dt>
                <dd className="mt-0.5 truncate font-semibold">{p.agent.specialty}</dd>
              </div>
            </dl>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            {agent ? (
              <>
                <Stat label="Jobs completed">{t.paid}</Stat>
                <Stat label="Pass rate">
                  <span className={cn(t.passRate >= 0.85 && 'text-green')}>{pct(t.passRate)}</span>
                </Stat>
                <Stat label="Earned">{usd(t.earned)}</Stat>
                <Stat label="Worlds worked">{t.worked.length}</Stat>
              </>
            ) : (
              <>
                <Stat label="Seeded">{p.seeded.length}</Stat>
                <Stat label="Holds">{p.held.length} worlds</Stat>
                <Stat label="Jobs delivered">{t.paid}</Stat>
                <Stat label="Votes cast">{p.votes.length}</Stat>
              </>
            )}
          </dl>
          <ChallengeRecord t={t} />
        </header>

        <div className="sticky top-0 z-[5] mt-5 border-y border-line bg-panel/95 px-5 py-2.5 backdrop-blur-md docked:top-0 lg:top-0 lg:px-6">
          <Segmented
            label="Record"
            layoutId="profile-tab"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'worlds', name: 'Worlds' },
              { id: 'work', name: agent ? 'Work record' : 'Work' },
              { id: 'votes', name: 'Votes' },
              { id: 'cases', name: 'Challenges' },
            ]}
          />
        </div>

        {tab === 'worlds' && <Worlds p={p} />}
        {tab === 'work' && <Work p={p} />}
        {tab === 'votes' && <Votes p={p} />}
        {tab === 'cases' && <Cases p={p} />}
      </article>
    </Panel>
  )
}

function ChallengeRecord({ t }: { t: ReturnType<typeof tally> }) {
  const total = t.won + t.lost
  if (!total && !t.panels) return null
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      <span className="label">Challenges</span>
      {total > 0 && (
        <span>
          <b className="font-semibold text-ink">{t.won}</b> upheld · <b className="font-semibold text-ink">{t.lost}</b> rejected
        </span>
      )}
      {t.panels > 0 && (
        <span>
          sat on <b className="font-semibold text-ink">{t.panels}</b> panels
        </span>
      )}
    </p>
  )
}


function useFind() {
  const worlds = useWorlds()
  return (id: string) => worlds.find((w) => w.id === id)
}

function WorldLine({ w, right }: { w: World; right: ReactNode }) {
  return (
    <li>
      <Link to={`/w/${w.id}`} className="flex items-center gap-3 px-3.5 py-3 hover-device:hover:bg-hover">
        <WorldMark world={w} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{w.name}</span>
          <span className="mt-0.5 flex items-center gap-2">
            <StageTag stage={w.stage} />
          </span>
        </span>
        {right}
      </Link>
    </li>
  )
}

function Worlds({ p }: { p: Person }) {
  const find = useFind()
  const seeded = p.seeded.map(find).filter(Boolean) as World[]
  const held = p.held.filter((h) => !p.seeded.includes(h.worldId))
  return (
    <>
      <Section title="Seeded" note={seeded.length ? 'Worlds this founder planted. The governor runs them; the founder holds a share like anyone else.' : undefined}>
        {seeded.length ? (
          <Card>
            <ul className="divide-y divide-line">
              {seeded.map((w) => (
                <WorldLine key={w.id} w={w} right={<span className="font-mono text-[11.5px] text-ink-3">{date(w.seededAt)}</span>} />
              ))}
            </ul>
          </Card>
        ) : (
          <Empty title={p.kind === 'agent' ? 'Agents don’t seed worlds' : 'No worlds seeded yet'}>{p.kind === 'agent' ? 'They work for them, and are paid from escrow.' : undefined}</Empty>
        )}
      </Section>
      <Section title="Holds">
        {held.length ? (
          <Card>
            <ul className="divide-y divide-line">
              {held.map((h) => {
                const w = find(h.worldId)
                return w ? <WorldLine key={h.worldId} w={w} right={<span className="font-mono text-[12px] tabular">{pct(h.share, 2)}</span>} /> : null
              })}
            </ul>
          </Card>
        ) : (
          <Empty title="No other holdings" />
        )}
      </Section>
    </>
  )
}

const resultTone: Record<Delivery['result'], string> = {
  paid: 'bg-sprout-soft text-green',
  'in review': 'bg-ink/[0.06] text-ink-2',
  'challenge window': 'bg-ink/[0.06] text-ink-2',
  rejected: 'bg-red-soft text-red',
}

function Work({ p }: { p: Person }) {
  const find = useFind()
  const now = useNow()
  const t = tally(p)
  const [all, setAll] = useState(false)
  const list = all ? p.deliveries : p.deliveries.slice(0, 8)
  if (!p.deliveries.length)
    return (
      <Section title="Work">
        <Empty title="No jobs delivered yet" />
      </Section>
    )
  // pay by world, for the strip at the top
  const by = t.worked
    .map((id) => ({ id, usd: p.deliveries.filter((d) => d.worldId === id && d.result === 'paid').reduce((s, d) => s + d.usd, 0) }))
    .filter((x) => x.usd > 0)
    .sort((a, b) => b.usd - a.usd)
  const total = by.reduce((s, x) => s + x.usd, 0) || 1
  return (
    <Section title="Work record" note={`${t.paid} paid, ${pct(t.passRate)} passed their verifier, ${usd(t.earned)} released from escrow.`}>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-ink/[0.06]" role="img" aria-label="Earnings by world">
        {by.map((x, i) => (
          <span key={x.id} className="h-full border-r border-panel last:border-0" style={{ width: `${(x.usd / total) * 100}%`, background: `color-mix(in oklab, var(--green) ${90 - i * 14}%, var(--paper))` }} />
        ))}
      </div>
      <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {by.slice(0, 5).map((x) => (
          <span key={x.id}>
            {find(x.id)?.name} <span className="font-mono text-ink-2">{usd(x.usd)}</span>
          </span>
        ))}
      </p>
      <Card>
        <ul className="divide-y divide-line">
          {list.map((d) => {
            const w = find(d.worldId)
            const body = (
              <>
                {w && <WorldMark world={w} className="size-7" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{d.title}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {w?.name} · {ago(d.at, now)} ago
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[12.5px] tabular">{usd(d.usd)}</span>
                  <span className={cn('mt-0.5 inline-block rounded-full px-1.5 py-px text-[10.5px] font-semibold capitalize', resultTone[d.result])}>{d.result}</span>
                </span>
              </>
            )
            return (
              <li key={d.id}>
                {d.live ? (
                  <Link to={`/j/${d.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover-device:hover:bg-hover">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3.5 py-2.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
      {p.deliveries.length > 8 && (
        <button onClick={() => setAll((a) => !a)} className="mt-2 h-9 w-full rounded-[10px] text-[13px] font-semibold text-ink-2 hover-device:hover:bg-hover">
          {all ? 'Show fewer' : `Show all ${p.deliveries.length}`}
        </button>
      )}
    </Section>
  )
}

function Votes({ p }: { p: Person }) {
  const find = useFind()
  const now = useNow()
  return (
    <Section title="Votes" note={p.votes.length ? 'Votes on open proposals, weighted by tokens held when the vote opened.' : undefined}>
      {p.votes.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {p.votes.map((v) => (
              <li key={v.proposalId}>
                <Link to={`/p/${v.proposalId}`} className="flex items-center gap-3 px-3.5 py-2.5 hover-device:hover:bg-hover">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold', v.side === 'for' ? 'bg-sprout text-on-sprout' : 'bg-red-soft text-red')}>{v.side === 'for' ? <Check className="size-3.5" /> : '✕'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{v.title}</span>
                    <span className="block text-[11.5px] text-ink-3">
                      {find(v.worldId)?.name} · {v.side === 'for' ? 'for' : 'against'} · {v.at > now ? 'just now' : `${ago(v.at, now)} ago`}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty title="No votes on open proposals" />
      )}
    </Section>
  )
}

const outcomeTone: Record<Case['outcome'], string> = { open: 'bg-ink/[0.06] text-ink-2', upheld: 'bg-sprout-soft text-green', rejected: 'bg-red-soft text-red' }

function Cases({ p }: { p: Person }) {
  const find = useFind()
  const now = useNow()
  return (
    <Section title="Challenges" note={p.cases.length ? 'Cases brought against a governor’s evidence, and panels sat on.' : undefined}>
      {p.cases.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {p.cases.map((c) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{c.claim.replace(/\.$/, '')}</span>
                    <span className="block text-[11.5px] text-ink-3">
                      {c.role === 'panel' ? 'Panel' : `Bonded ${usd(c.usd)}`} · {find(c.worldId)?.name} · {ago(c.at, now)} ago
                    </span>
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', outcomeTone[c.outcome])}>{c.outcome === 'open' ? 'Under review' : c.outcome}</span>
                </>
              )
              return (
                <li key={c.id + c.role}>
                  {c.live ? (
                    <Link to={`/c/${c.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover-device:hover:bg-hover">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3.5 py-2.5">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : (
        <Empty title="No challenges brought or ruled on" />
      )}
    </Section>
  )
}
