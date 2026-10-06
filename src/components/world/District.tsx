import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { DoorOpen, History, LogOut } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useDocked } from '@/lib/useMedia'
import { jobs } from '@/lib/civic'
import { claimed } from '@/lib/wallet'
import { count, date, usd } from '@/lib/format'
import { T, enter, exit } from '@/lib/motion'
import { useField, useInsets } from '@/field/Field'

/*
  Stepping inside a world. The Field moves in close; the plain blocks give way to the
  world's district: its apps as buildings, its open jobs as construction sites, agents
  walking between them. Tags on each building and site follow the camera.
*/

export function useDistrict(w: World, inside: boolean) {
  const engine = useField()
  const open = useMemo(() => jobs.filter((j) => j.worldId === w.id && j.status !== 'paid'), [w.id])
  const key = `${w.id}:${w.apps.length}:${w.stage}`
  useEffect(() => {
    if (!engine) return
    engine.setDistrict({ id: w.id, template: w.template, apps: w.apps.map((a) => ({ key: a.name })), jobs: open.map((j) => ({ key: j.id })), seed: w.stage === 'seed', lit: w.stage === 'sovereign' ? 1 : w.stage === 'realm' ? 0.6 : 0.3 })
    // rebuilt only when what stands there changes
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, open])
  useEffect(() => () => engine?.setDistrict(null), [engine])
  return { open, inside }
}

/** The button that takes you in, and back out. Stands in the open corner of the Field. */
export function StepInside({ w, inside, onToggle, onReplay }: { w: World; inside: boolean; onToggle: () => void; onReplay: () => void }) {
  const inset = useInsets()
  const wide = useDocked()
  const open = jobs.filter((j) => j.worldId === w.id && j.status !== 'paid').length
  const style = wide ? { left: inset.left + 16, bottom: inset.bottom + 16 } : { left: 10, top: inset.top + 10 }
  return (
    <section aria-label="World view" className="fixed z-[4] flex max-w-[calc(100vw-80px)] flex-col items-start gap-2" style={style}>
      <button onClick={onToggle} aria-pressed={inside} className={cn('flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold shadow-[0_10px_30px_-14px_rgb(20_24_19/0.55)] transition-colors', inside ? 'bg-ink text-paper' : 'bg-sprout text-on-sprout ring-1 ring-ink/15 ring-inset')}>
        {inside ? <LogOut className="size-4" /> : <DoorOpen className="size-4" />}
        {inside ? `Back out of ${w.name}` : `Step inside ${w.name}`}
      </button>
      {!inside && (
        <button onClick={onReplay} className="flex h-9 items-center gap-2 rounded-full bg-raised/92 px-3.5 text-[13px] font-semibold shadow-[0_0_0_1px_var(--line-2),0_10px_30px_-14px_rgb(20_24_19/0.55)] backdrop-blur-sm hover-device:hover:bg-raised">
          <History className="size-4" /> Replay its life
        </button>
      )}
      <AnimatePresence>
        {inside && wide && (
          <m.p className="sheet rounded-[10px] px-3 py-2 text-[12.5px] text-ink-2" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4, transition: exit }} transition={enter}>
            {w.stage === 'seed' ? 'A survey stake and a site office. Its first app is being built.' : `${w.apps.length} apps standing · ${open} ${open === 1 ? 'job' : 'jobs'} under way · agents at work`}
          </m.p>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Tags on the buildings and sites of the open district. */
export function DistrictTags({ w, inside, onJob }: { w: World; inside: boolean; onJob: (id: string) => void }) {
  const engine = useField()
  const refs = useRef(new Map<string, HTMLElement>())
  const [picked, setPicked] = useState<string | null>(null)
  const mine = claimed.use()
  const open = jobs.filter((j) => j.worldId === w.id && j.status !== 'paid')

  useEffect(() => {
    if (!engine || !inside) return
    return engine.onFrame(() => {
      for (const a of engine.districtAnchors()) {
        const el = refs.current.get(a.key)
        if (!el) continue
        const p = engine.projectPoint(a.x, a.y + 0.3, a.z)
        const on = p.z < 1
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
        el.style.visibility = on ? 'visible' : 'hidden'
      }
    })
  }, [engine, inside])

  return (
    <AnimatePresence>
      {inside && (
        <m.div key="tags" className="pointer-events-none fixed inset-0 z-[2] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: exit }} transition={{ duration: T.scene, delay: T.calm }} aria-label={`Inside ${w.name}`} role="region">
          {w.apps.map((a) => {
            const on = picked === a.name
            return (
              <div key={a.name} ref={(el) => void (el ? refs.current.set(a.name, el) : refs.current.delete(a.name))} className="absolute top-0 left-0" style={{ visibility: 'hidden', zIndex: on ? 20 : 10 }}>
                <button
                  onClick={() => setPicked(on ? null : a.name)}
                  aria-expanded={on}
                  className={cn('pointer-events-auto absolute bottom-3 left-0 -translate-x-1/2 rounded-[10px] text-left shadow-[0_0_0_1px_var(--line-2),0_8px_20px_-12px_rgb(20_24_19/0.5)] transition-colors', on ? 'w-56 bg-raised p-3' : 'bg-raised/92 px-2.5 py-1.5 backdrop-blur-sm hover-device:hover:bg-sprout')}
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] leading-none font-semibold whitespace-nowrap">
                    <span className="size-2 rounded-[2px] bg-sprout ring-1 ring-ink/30" />
                    {a.name.replace(`${w.name} `, '')}
                    {!on && <span className="font-mono text-[10.5px] font-medium text-ink-3">{count(a.users30d)}</span>}
                  </span>
                  {on && (
                    <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
                      <span className="text-ink-3">Users, 30d</span>
                      <span className="text-right font-mono">{count(a.users30d)}</span>
                      <span className="text-ink-3">Revenue, 30d</span>
                      <span className="text-right font-mono">{usd(a.revenue30dUsd)}</span>
                      <span className="text-ink-3">Module</span>
                      <span className="truncate text-right">{a.module}</span>
                      <span className="text-ink-3">Deployed</span>
                      <span className="text-right">{date(a.deployedAt)}</span>
                      <span className={cn('col-span-2 pt-1 font-semibold', a.audited ? 'text-green' : 'text-ink-3')}>{a.audited ? 'Audited source' : 'Audit scheduled'}</span>
                    </span>
                  )}
                </button>
                <span aria-hidden className="absolute -bottom-0 left-0 h-3 w-px -translate-x-1/2 bg-ink/50" />
              </div>
            )
          })}
          {open.map((j) => (
            <div key={j.id} ref={(el) => void (el ? refs.current.set(j.id, el) : refs.current.delete(j.id))} className="absolute top-0 left-0" style={{ visibility: 'hidden' }}>
              <button onClick={() => onJob(j.id)} className="pointer-events-auto absolute bottom-3 left-0 flex -translate-x-1/2 items-center gap-1.5 rounded-[10px] border border-dashed border-ink/45 bg-paper/90 px-2.5 py-1.5 text-[12px] leading-none font-semibold whitespace-nowrap backdrop-blur-sm hover-device:hover:bg-raised">
                {j.category}
                <span className="font-mono text-[10.5px] font-medium text-ink-3">{usd(j.escrowUsd)}</span>
                {mine.includes(j.id) && <span className="rounded-full bg-sprout px-1.5 text-[10px] text-on-sprout">yours</span>}
              </button>
              <span aria-hidden className="absolute bottom-0 left-0 h-3 w-px -translate-x-1/2 bg-ink/40" />
            </div>
          ))}
        </m.div>
      )}
    </AnimatePresence>
  )
}
