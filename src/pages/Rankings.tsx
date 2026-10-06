import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useEvidence, useWorlds } from '@/lib/sim'
import { useChallenges } from '@/lib/civic'
import { enter, exit } from '@/lib/motion'
import { boardFor, boards, rank, type BoardId, type PersonRow, type WorldRow } from '@/lib/rankings'
import { useField, useFieldView, useSpotlight } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { WorldMark } from '@/components/ui/WorldMark'
import { StageTag } from '@/components/ui/bits'
import { Avatar, profilePath } from '@/components/ui/Who'

const TOP = 5

export function RankingsLens() {
  useTitle('Rankings')
  useFieldView({ kind: 'atlas' })
  const [params, setParams] = useSearchParams()
  const board = boardFor(params.get('board'))
  const pick = (id: BoardId) => setParams(id === 'growth' ? {} : { board: id }, { replace: true })
  const worlds = useWorlds()
  const ev = useEvidence()
  const open = useChallenges()
  // re-rank once a minute at most; proofs arrive live but the order should not jitter
  const minute = Math.floor(useNow() / 60_000)
  const rows = useMemo(() => rank(board.id, worlds, ev, open, minute * 60_000), [board.id, worlds, ev, open, minute])

  // the map lights the leaders: the top worlds, or the worlds the top people work in
  const people = board.group === 'People'
  const lit = useMemo(() => {
    if (!people) return rows.slice(0, TOP).map((r) => (r as WorldRow).world.id)
    return [...new Set((rows.slice(0, 3) as PersonRow[]).flatMap((r) => r.worlds))]
  }, [rows, people])
  useSpotlight(lit)
  const detail = useCallback(
    (w: World) => {
      if (!people) {
        const i = rows.findIndex((r) => (r as WorldRow).world.id === w.id)
        return i >= 0 && i < TOP ? { text: `#${i + 1} · ${rows[i].text}`, tone: i === 0 ? ('green' as const) : undefined } : null
      }
      const who = (rows as PersonRow[]).find((r, i) => i < 3 && r.worlds.includes(w.id))
      return who ? { text: who.person.handle.replace('agent:', '') } : null
    },
    [rows, people],
  )
  useLabels(detail, null, true)

  const top = Math.max(...rows.map((r) => r.value), 1e-9)

  return (
    <Panel label="Rankings" rest={0.5}>
      <PanelHead>
        <h1 className="text-h2">Rankings</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">Who is doing well, measured the same way for every world. The map lights the leaders.</p>
        <div className="mt-4 grid gap-2.5">
          {(['Worlds', 'People'] as const).map((g) => (
            <div key={g} className="flex items-center gap-2">
              <span className="label w-[52px] shrink-0">{g}</span>
              <div role="group" aria-label={`${g} boards`} className="no-scrollbar -mr-5 flex gap-1.5 overflow-x-auto pr-5 lg:mr-0 lg:flex-wrap lg:pr-0">
                {boards
                  .filter((b) => b.group === g)
                  .map((b) => (
                    <button
                      key={b.id}
                      aria-pressed={b.id === board.id}
                      onClick={() => pick(b.id)}
                      className={cn('h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors', b.id === board.id ? 'bg-ink text-paper' : 'text-ink-2 ring-1 ring-line ring-inset hover-device:hover:bg-hover hover-device:hover:text-ink')}
                    >
                      {b.short}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </PanelHead>

      <section className="px-3 pt-5 pb-10 lg:px-4" aria-labelledby="board-name">
        <div className="px-2">
          <h2 id="board-name" className="text-[17px] font-semibold tracking-[-0.01em]">
            {board.name}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{board.how}</p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <m.ol key={board.id} className="mt-3 grid gap-px" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exit }} transition={enter}>
            {rows.map((r, i) => (r.kind === 'world' ? <WorldItem key={r.world.id} r={r} i={i} top={top} /> : <PersonItem key={r.person.handle} r={r} i={i} top={top} />))}
          </m.ol>
        </AnimatePresence>
        {!rows.length && <p className="mx-2 mt-3 rounded-[12px] px-4 py-6 text-center text-[13px] text-ink-3 ring-1 ring-line ring-inset">Nothing on this board yet.</p>}
      </section>
    </Panel>
  )
}

function Place({ i }: { i: number }) {
  return <span className={cn('w-6 shrink-0 text-center font-mono text-[12px] tabular', i < 3 ? 'font-semibold text-ink' : 'text-ink-3')}>{i + 1}</span>
}

function Bar({ value, top, lead }: { value: number; top: number; lead: boolean }) {
  return (
    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/[0.06]">
      <span className={cn('block h-full rounded-full', lead ? 'bg-green' : 'bg-ink/35')} style={{ width: `${Math.max(3, (value / top) * 100)}%` }} />
    </span>
  )
}

function WorldItem({ r, i, top }: { r: WorldRow; i: number; top: number }) {
  const engine = useField()
  const w = r.world
  return (
    <li>
      <Link
        to={`/w/${w.id}`}
        onMouseEnter={() => engine?.setHover(w.id)}
        onMouseLeave={() => engine?.setHover(null)}
        className={cn('flex items-center gap-3 rounded-[12px] px-2 py-2.5 hover-device:hover:bg-hover', i < TOP && 'bg-raised/60')}
      >
        <Place i={i} />
        <WorldMark world={w} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">{w.name}</span>
            <StageTag stage={w.stage} className="hidden sm:inline-flex" />
          </span>
          <Bar value={r.value} top={top} lead={i === 0} />
        </span>
        <span className="w-[92px] shrink-0 text-right">
          <span className={cn('block font-mono text-[13.5px] font-medium tabular', i === 0 && 'text-green')}>{r.text}</span>
          <span className="block truncate text-[11px] text-ink-3">{r.note}</span>
        </span>
      </Link>
    </li>
  )
}

function PersonItem({ r, i, top }: { r: PersonRow; i: number; top: number }) {
  const p = r.person
  return (
    <li>
      <Link to={profilePath(p.handle)} className={cn('flex items-center gap-3 rounded-[12px] px-2 py-2.5 hover-device:hover:bg-hover', i < 3 && 'bg-raised/60')}>
        <Place i={i} />
        <Avatar handle={p.handle} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-medium">{p.handle}</span>
          <span className="block truncate text-[11.5px] text-ink-3">
            {p.role} · {r.worlds.length} worlds
          </span>
          <Bar value={r.value} top={top} lead={i === 0} />
        </span>
        <span className="w-[100px] shrink-0 text-right">
          <span className={cn('block font-mono text-[13.5px] font-medium tabular', i === 0 && 'text-green')}>{r.text}</span>
          <span className="block truncate text-[11px] text-ink-3">{r.note}</span>
        </span>
      </Link>
    </li>
  )
}
