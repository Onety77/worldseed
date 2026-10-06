import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { continent } from './height'
import { useReducedMotion } from 'motion/react'
import type { Stage } from '@/lib/types'
import { createStore } from '@/lib/store'
import { useGraduations, usePings, useWorlds } from '@/lib/sim'
import { FieldEngine, webglAvailable, type View } from './engine'
import { hillFor } from './fromWorld'

/*
  The Field lives once, behind every page, for the whole visit. Pages say what they want to
  look at with useFieldView; the worlds, pings and filters stay in sync on their own.
*/

const Ctx = createContext<FieldEngine | null>(null)
export const useField = () => useContext(Ctx)

/** which stages the Field shows at full strength; the rest are muted */
export const fieldFilter = createStore<Stage | 'all'>('all')
/** panels laid over the Field, by side; the Field frames its subject in what is left */
type Side = 'left' | 'right' | 'top' | 'bottom'
const covers = createStore<Record<string, { side: Side; px: number }>>({})

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
  const [failed, setFailed] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = host.current
    if (!el) return
    if (!webglAvailable()) {
      setFailed(true)
      return
    }
    let e: FieldEngine
    try {
      e = new FieldEngine(el, window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) < 4 || location.search.includes('field=low') ? 'low' : 'high')
    } catch {
      setFailed(true)
      return
    }
    setEngine(e)
    if (import.meta.env.DEV) Object.assign(window, { __field: e })
    const ro = new ResizeObserver(() => e.resize())
    ro.observe(el)
    const vis = () => !document.hidden && e.wake()
    document.addEventListener('visibilitychange', vis)
    return () => {
      ro.disconnect()
      document.removeEventListener('visibilitychange', vis)
      e.dispose()
      setEngine(null)
    }
  }, [])

  useEffect(() => {
    engine?.setReduced(Boolean(reduced))
  }, [engine, reduced])

  return (
    <Ctx.Provider value={engine}>
      <div ref={host} aria-hidden className="fixed inset-0 z-0 overflow-hidden bg-paper">
        {failed && <Fallback />}
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
  const draft = draftHill.use()
  const pings = usePings()
  useGraduations()
  useEffect(() => {
    const list = worlds.map((w) => ({ id: w.id, hill: hillFor(w), muted: filter !== 'all' && w.stage !== filter, built: w.stage === 'seed' ? 0 : w.apps.length * (w.stage === 'sovereign' ? 3 : 2) }))
    if (draft) list.push({ id: draft.id, hill: { x: draft.x, z: draft.z, radius: draft.radius, height: draft.height, tiers: 1, moat: 0 }, muted: false, built: 0 })
    engine.setWorlds(list)
  }, [engine, worlds, filter, draft])
  const cover = covers.use()
  useEffect(() => {
    const i = { left: 0, right: 0, top: 0, bottom: 0 }
    for (const c of Object.values(cover)) i[c.side] = Math.max(i[c.side], c.px)
    engine.setInset(i)
  }, [engine, cover])
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const p of pings) {
      if (seen.current.has(p.id)) continue
      seen.current.add(p.id)
      engine.ping(p.worldId)
    }
  }, [engine, pings])
  return null
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
function Fallback() {
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
    <div className="absolute inset-0 bg-[#cddadb]">
    <svg className="absolute" style={{ left: inset.left + 12, right: inset.right + 12, top: inset.top + 12, bottom: inset.bottom + 12, width: `calc(100% - ${inset.left + inset.right + 24}px)`, height: `calc(100% - ${inset.top + inset.bottom + 24}px)` }} preserveAspectRatio="xMidYMid meet" viewBox="-58 -50 116 100">
      <path d={coast} fill="var(--paper)" stroke="var(--ink)" strokeOpacity=".6" strokeWidth=".35" />
      {worlds.map((w) => {
        const h = hillFor(w)
        return (
          <g key={w.id} onClick={() => nav(`/w/${w.id}`)} className="cursor-pointer">
            {h.moat > 0.5 && <circle cx={w.x} cy={w.z} r={h.radius * 1.3} fill="#cddadb" stroke="var(--ink)" strokeOpacity=".4" strokeWidth=".25" strokeDasharray="1 .8" />}
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
    </div>
  )
}
