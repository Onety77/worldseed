import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { continent } from './height'
import { useReducedMotion } from 'motion/react'
import type { Stage } from '@/lib/types'
import { createStore } from '@/lib/store'
import { useEvidence, useGraduations, usePings, useWorlds } from '@/lib/sim'
import { FieldEngine, webglAvailable, type FieldWorld, type View } from './engine'
import { readiness } from '@/lib/rules'
import { useTheme } from '@/lib/theme'
import { onTrade } from '@/lib/market'
import { hillFor } from './fromWorld'

/*
  The Field lives once, behind every page, for the whole visit. Pages say what they want to
  look at with useFieldView; the worlds, pings and filters stay in sync on their own.
*/

const Ctx = createContext<FieldEngine | null>(null)
export const useField = () => useContext(Ctx)

/** which stages the Field shows at full strength; the rest are muted */
export const fieldFilter = createStore<Stage | 'all'>('all')
/** worlds a page wants lit (a profile's worlds, a ranking's top), the rest step back */
const spotlight = createStore<string[] | null>(null)

/** Light up just these worlds on the Field while the calling page is open. */
export function useSpotlight(ids: string[] | null) {
  const key = ids ? ids.join(',') : ''
  useEffect(() => {
    spotlight.set(key ? key.split(',') : null)
    return () => spotlight.set(null)
  }, [key])
}
/** panels laid over the Field, by side; the Field frames its subject in what is left */
type Side = 'left' | 'right' | 'top' | 'bottom'
const covers = createStore<Record<string, { side: Side; px: number }>>({})

/** How much of each screen edge panels cover right now. */
export function useInsets() {
  const cover = covers.use()
  const i = { left: 0, right: 0, top: 0, bottom: 0 }
  for (const c of Object.values(cover)) i[c.side] = Math.max(i[c.side], c.px)
  return i
}

/** Report how much of the screen an element covers from one side, while it is mounted. */
export function useCover(ref: RefObject<HTMLElement | null>, side: Side, on = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !on) return
    const key = Math.random().toString(36).slice(2)
    const measure = () => {
      const r = el.getBoundingClientRect()
      // hidden elements cover nothing
      const px = !r.width && !r.height ? 0 : side === 'left' ? r.right : side === 'right' ? window.innerWidth - r.left : side === 'top' ? r.bottom : window.innerHeight - r.top
      covers.set((c) => ({ ...c, [key]: { side, px: Math.max(0, Math.round(px)) } }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      covers.set((c) => {
        const next = { ...c }
        delete next[key]
        return next
      })
    }
  }, [ref, side, on])
}

/** a world being planted right now in the launch composer, before it exists */
export const draftHill = createStore<{ id: string; x: number; z: number; radius: number; height: number } | null>(null)

export function FieldProvider({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<FieldEngine | null>(null)
  const [failed, setFailed] = useState<false | 'none' | 'lost'>(false)
  // bumped to build the Field again after its context was lost
  const [gen, setGen] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = host.current
    if (!el) return
    if (!webglAvailable()) {
      setFailed('none')
      return
    }
    let e: FieldEngine
    try {
      e = new FieldEngine(el, window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) < 4 || location.search.includes('field=low') ? 'low' : 'high')
    } catch {
      setFailed('none')
      return
    }
    setEngine(e)
    const offLost = e.onLost(() => {
      setFailed('lost')
      setEngine(null)
    })
    if (import.meta.env.DEV) Object.assign(window, { __field: e })
    const ro = new ResizeObserver(() => e.resize())
    ro.observe(el)
    const vis = () => !document.hidden && e.wake()
    document.addEventListener('visibilitychange', vis)
    return () => {
      offLost()
      ro.disconnect()
      document.removeEventListener('visibilitychange', vis)
      e.dispose()
      setEngine(null)
    }
  }, [gen])

  const theme = useTheme()
  const first = useRef(true)
  useEffect(() => {
    // the first paint takes the theme as it is; later switches crossfade
    engine?.setNight(theme === 'dark', first.current)
    if (engine) first.current = false
  }, [engine, theme])

  useEffect(() => {
    engine?.setReduced(Boolean(reduced))
  }, [engine, reduced])

  return (
    <Ctx.Provider value={engine}>
      <div ref={host} aria-hidden={!failed} className="fixed inset-0 z-0 overflow-hidden bg-paper">
        {failed && (
          <Fallback
            lost={failed === 'lost'}
            retry={() => {
              setFailed(false)
              setGen((g) => g + 1)
            }}
          />
        )}
      </div>
      {engine && <Sync engine={engine} />}
      {children}
    </Ctx.Provider>
  )
}

/** Keeps the Field's worlds, filter, pings and the draft plot in step with the app. */
function Sync({ engine }: { engine: FieldEngine }) {
  const worlds = useWorlds()
  const filter = fieldFilter.use()
  const lit = spotlight.use()
  const draft = draftHill.use()
  const pings = usePings()
  useGraduations()
  // a planted seed gets its first tent when its governor publishes a first proof
  const ev = useEvidence()
  const proven = useMemo(() => new Set(ev.filter((e) => e.id.includes('-live-')).map((e) => e.worldId)), [ev])
  useEffect(() => {
    const list: FieldWorld[] = worlds.map((w) => ({
      id: w.id,
      hill: hillFor(w),
      muted: (filter !== 'all' && w.stage !== filter) || (lit !== null && !lit.includes(w.id)),
      trouble: w.charter.objectives.some((o) => o.status === 'failed') ? 1 : w.charter.objectives.some((o) => o.status === 'challenged') ? 0.35 : 0,
      town: {
        template: w.template,
        apps: w.stage === 'seed' ? (proven.has(w.id) ? 1 : 0) : w.apps.length,
        houses: w.stage === 'seed' ? 0 : w.apps.length * (w.stage === 'sovereign' ? 3 : 2),
        lit: w.stage === 'sovereign' ? 1 : w.stage === 'realm' ? readiness(w) : 0.2,
        seed: w.stage === 'seed',
      },
      // a world with its own chain is also a planet: its size follows the people it keeps,
      // its moons its revenue, rings mark a deep treasury, and its night side lights up
      // with its holders (rounded, so small ticks don't rebuild it)
      planet:
        w.stage === 'sovereign'
          ? {
              template: w.template,
              size: Math.round(Math.min(1, Math.max(0, (w.retained30d - 2500) / 10500)) * 20) / 20,
              moons: Math.max(1, Math.min(3, Math.round(1 + w.treasury.revenue30dUsd / 80_000))),
              rings: w.treasury.balanceUsd >= 2_000_000,
              lights: Math.round(Math.min(1, Math.max(0.35, w.holders / 20_000)) * 10) / 10,
              launchedAt: w.chain?.launchedAt ?? 0,
              site: { x: w.x, z: w.z },
            }
          : undefined,
    }))
    if (draft) list.push({ id: draft.id, hill: { x: draft.x, z: draft.z, radius: draft.radius, height: draft.height, tiers: 1, moat: 0 }, muted: false, trouble: 0, town: { template: 'frontier', apps: 0, houses: 0, lit: 0, seed: true } })
    engine.setWorlds(list)
  }, [engine, worlds, filter, lit, draft, proven])
  const cover = covers.use()
  useEffect(() => {
    const i = { left: 0, right: 0, top: 0, bottom: 0 }
    for (const c of Object.values(cover)) i[c.side] = Math.max(i[c.side], c.px)
    engine.setInset(i)
  }, [engine, cover])
  // trades send packets down the world's roads
  useEffect(() => onTrade((id) => engine.pulse(id)), [engine])
  // zooming out past the whole map lifts you into space; zooming into the home planet brings you down
  const nav = useNavigate()
  useEffect(() => engine.onEscape((dir) => dir !== 'up' && nav(dir === 'out' ? '/sovereignty' : '/')), [engine, nav])
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const p of pings) {
      if (seen.current.has(p.id)) continue
      seen.current.add(p.id)
      engine.ping(p.worldId, p.kind)
    }
  }, [engine, pings])
  return null
}

/** Whether the Field is out in space (or on its way there). */
export function useInSpace() {
  const engine = useField()
  const [space, setSpace] = useState(false)
  useEffect(() => engine?.onFrame(() => setSpace(engine.inSpace())), [engine])
  return space
}

/** Point the Field at something while this component is mounted. */
export function useFieldView(view: View | null, focus: string | null = null) {
  const engine = useField()
  const key = JSON.stringify(view)
  useEffect(() => {
    if (!engine || !view) return
    engine.setView(view)
    engine.setFocus(focus)
    // the view object is compared by value through `key`
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, focus])
}

/** No WebGL: the same Field drawn flat from above, so every world can still be found and opened. */
function Fallback({ lost, retry }: { lost: boolean; retry: () => void }) {
  const worlds = useWorlds()
  const nav = useNavigate()
  const cover = covers.use()
  const inset = { left: 0, right: 0, top: 0, bottom: 0 }
  for (const c of Object.values(cover)) inset[c.side] = Math.max(inset[c.side], c.px)
  const coast = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2
      let r = 20
      while (r < 70 && continent(Math.cos(a) * r, Math.sin(a) * r) > 0) r += 0.5
      pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`)
    }
    return 'M' + pts.join('L') + 'Z'
  }, [])
  return (
    <div className="absolute inset-0 bg-water">
    <svg className="absolute" style={{ left: inset.left + 12, right: inset.right + 12, top: inset.top + 12, bottom: inset.bottom + 12, width: `calc(100% - ${inset.left + inset.right + 24}px)`, height: `calc(100% - ${inset.top + inset.bottom + 24}px)` }} preserveAspectRatio="xMidYMid meet" viewBox="-58 -50 116 100">
      <path d={coast} fill="var(--paper)" stroke="var(--ink)" strokeOpacity=".6" strokeWidth=".35" />
      {worlds.map((w) => {
        const h = hillFor(w)
        return (
          <g key={w.id} onClick={() => nav(`/w/${w.id}`)} className="cursor-pointer">
            {h.moat > 0.5 && <circle cx={w.x} cy={w.z} r={h.radius * 1.3} fill="var(--water)" stroke="var(--ink)" strokeOpacity=".4" strokeWidth=".25" strokeDasharray="1 .8" />}
            {Array.from({ length: h.tiers + 1 }, (_, i) => (
              <circle key={i} cx={w.x} cy={w.z} r={h.radius * (1 - i / (h.tiers + 1.5))} fill={i === 0 ? 'var(--panel)' : 'none'} stroke="var(--ink)" strokeOpacity={0.25 + i * 0.12} strokeWidth=".25" />
            ))}
          </g>
        )
      })}
      {/* names last, so no hill covers one */}
      {worlds.map((w) => (
        <text key={w.id} x={w.x} y={w.z - hillFor(w).radius - 1} textAnchor="middle" fontSize="2.4" fontWeight="600" fill="var(--ink)" stroke="var(--paper)" strokeWidth=".6" paintOrder="stroke" className="pointer-events-none">
          {w.name}
        </text>
      ))}
    </svg>
    <div className="absolute flex justify-center px-4" style={{ top: inset.top + 12, left: inset.left, right: inset.right }}>
      <p className="sheet pointer-events-auto relative z-[11] flex items-center gap-3 rounded-[18px] py-1.5 pr-1.5 pl-4 text-[12.5px] text-ink-2">
        {lost ? 'The 3D map stopped drawing, so here is the flat survey.' : 'This device can’t draw the 3D map, so here is the flat survey.'}
        {lost && (
          <button onClick={retry} className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-paper hover-device:hover:bg-ink/85">
            Redraw
          </button>
        )}
      </p>
    </div>
    </div>
  )
}
