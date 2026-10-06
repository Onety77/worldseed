import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search as SearchIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { createStore } from '@/lib/store'
import { useEvidence, useWorlds } from '@/lib/sim'
import { jobs } from '@/lib/civic'
import { lenses } from '@/lib/lenses'
import { preset } from '@/lib/templates'
import { usd } from '@/lib/format'
import { useField } from '@/field/Field'
import { Dialog } from '@/components/ui/Dialog'
import { WorldMark } from '@/components/ui/WorldMark'

export const searchOpen = createStore(false)

interface Hit {
  id: string
  group: 'Worlds' | 'Jobs' | 'Proofs' | 'Go to'
  title: string
  note: string
  href: string
  worldId?: string
}

/** Search everything: worlds, jobs, recent proofs and pages. ⌘K or / opens it anywhere. */
export function SearchPalette() {
  const open = searchOpen.use()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const engine = useField()
  const worlds = useWorlds()
  const ev = useEvidence()
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        searchOpen.set(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase()
    const has = (...s: string[]) => !t || s.some((x) => x.toLowerCase().includes(t))
    // names and tickers that start with what you typed come first
    const score = (x: (typeof worlds)[number]) => {
      const n = x.name.toLowerCase(), k = x.ticker.toLowerCase()
      if (!t) return 0
      if (n.startsWith(t) || k.startsWith(t)) return 0
      if (n.split(' ').some((p) => p.startsWith(t))) return 1
      if (n.includes(t) || k.includes(t)) return 2
      return 3
    }
    const word = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    const w: Hit[] = worlds
      .filter((x) => has(x.name, x.ticker, preset(x.template).name, x.lore))
      .sort((a, b) => score(a) - score(b))
      .slice(0, t ? 6 : 4)
      .map((x) => ({ id: `w-${x.id}`, group: 'Worlds', title: x.name, note: `${x.ticker} · ${preset(x.template).name}`, href: `/w/${x.id}`, worldId: x.id }))
    const j: Hit[] = t
      ? jobs
          .filter((x) => x.status !== 'paid' && (word.test(x.title) || word.test(x.category)))
          .slice(0, 4)
          .map((x) => ({ id: `j-${x.id}`, group: 'Jobs', title: x.title, note: `${usd(x.escrowUsd)} in escrow · ${worlds.find((y) => y.id === x.worldId)?.name ?? ''}`, href: `/w/${x.worldId}#work`, worldId: x.worldId }))
      : []
    const p: Hit[] = t.length > 2
      ? ev
          .filter((x) => word.test(x.title) || word.test(worlds.find((y) => y.id === x.worldId)?.name ?? ''))
          .slice(0, 4)
          .map((x) => ({ id: `e-${x.id}`, group: 'Proofs', title: x.title, note: `${worlds.find((y) => y.id === x.worldId)?.name ?? ''} · ${x.step}`, href: `/w/${x.worldId}#log`, worldId: x.worldId }))
      : []
    const pages: Hit[] = ([
      ...lenses.map((l) => ({ id: `l-${l.id}`, group: 'Go to' as const, title: l.name, note: l.blurb, href: l.path })),
      { id: 'p-seed', group: 'Go to', title: 'Seed a world', note: 'Launch a token with a charter and a governor', href: '/seed' },
      { id: 'p-you', group: 'Go to', title: 'You', note: 'Your holdings, votes and jobs', href: '/you' },
      { id: 'p-how', group: 'Go to', title: 'How it works', note: 'Stages, the governor loop, the treasury', href: '/how' },
    ] as Hit[]).filter((x) => has(x.title, x.note))
    return [...w, ...j, ...p, ...pages.slice(0, t ? 4 : 8)]
  }, [q, worlds, ev])

  const close = () => {
    searchOpen.set(false)
    setQ('')
    setI(0)
    engine?.setHover(null)
  }
  const go = (h: Hit) => {
    close()
    nav(h.href)
  }
  const at = Math.min(i, Math.max(0, hits.length - 1))
  // highlight the world on the Field as you move through results
  useEffect(() => {
    if (open) engine?.setHover(hits[at]?.worldId ?? null)
    list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, at, hits, engine])

  let last = ''
  return (
    <Dialog open={open} onClose={close} label="Search" top className="max-w-[560px]">
      <div className="flex items-center gap-3 border-b border-line px-4 pr-12">
        <SearchIcon className="size-4 shrink-0 text-ink-3" />
        <input
          data-autofocus=""
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setI(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setI((x) => Math.min(hits.length - 1, x + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setI((x) => Math.max(0, x - 1))
            } else if (e.key === 'Enter' && hits[at]) go(hits[at])
          }}
          placeholder="Search worlds, jobs, proofs"
          aria-label="Search worlds, jobs and proofs"
          aria-controls="search-results"
          aria-activedescendant={hits[at] ? `hit-${hits[at].id}` : undefined}
          role="combobox"
          aria-expanded="true"
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
      </div>
      <ul ref={list} id="search-results" role="listbox" aria-label="Results" className="max-h-[min(60vh,460px)] overflow-y-auto p-2">
        {hits.map((h, k) => {
          const head = h.group !== last ? h.group : null
          last = h.group
          const w = h.worldId ? worlds.find((x) => x.id === h.worldId) : null
          return (
            <li key={h.id} role="presentation">
              {head && <p className="label px-2.5 pt-2.5 pb-1">{head}</p>}
              <div
                id={`hit-${h.id}`}
                role="option"
                aria-selected={k === at}
                data-i={k}
                onMouseMove={() => setI(k)}
                onClick={() => go(h)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2', k === at && 'bg-raised shadow-[0_0_0_1px_var(--line)]')}
              >
                {h.group === 'Worlds' && w ? <WorldMark world={w} className="size-8" /> : <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-ink/[0.05] font-mono text-[10px] text-ink-3 uppercase">{h.group.slice(0, 2)}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{h.title}</span>
                  <span className="block truncate text-[12px] text-ink-3">{h.note}</span>
                </span>
                {k === at && <CornerDownLeft className="size-3.5 shrink-0 text-ink-3" />}
              </div>
            </li>
          )
        })}
        {!hits.length && <li className="px-3 py-8 text-center text-[13.5px] text-ink-3">Nothing matches “{q}”. Try a world's name or ticker.</li>}
      </ul>
      <p className="hidden border-t border-line px-4 py-2.5 text-[11.5px] text-ink-3 sm:block">
        <kbd className="font-mono">↑↓</kbd> to move · <kbd className="font-mono">Enter</kbd> to open · <kbd className="font-mono">Esc</kbd> to close
      </p>
    </Dialog>
  )
}
