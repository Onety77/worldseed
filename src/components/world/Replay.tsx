import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useDocked } from '@/lib/useMedia'
import { EASE_OUT } from '@/lib/motion'
import { lifeOf } from '@/lib/replay'
import { useField, useInsets } from '@/field/Field'

const PLAY_MS = 16_000

/**
 * A world's life as a time-lapse on the Field: the stake going in, terraces stepping up as
 * eras pass, buildings rising with each app, and, for the sovereign, the water coming in.
 */
export function Replay({ w, onClose }: { w: World; onClose: () => void }) {
  const engine = useField()
  const reduced = useReducedMotion()
  const [t0] = useState(() => Date.now())
  const life = useMemo(() => lifeOf(w, t0), [w, t0])
  const [day, setDay] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  const last = useRef(0)
  const dayRef = useRef(0)

  // play: the whole life in about sixteen seconds
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let prev = performance.now()
    const tick = (t: number) => {
      const dt = t - prev
      prev = t
      const next = Math.min(life.age, dayRef.current + (dt / PLAY_MS) * life.age)
      dayRef.current = next
      setDay(next)
      if (next >= life.age) setPlaying(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, life.age])

  // the Field follows the scrubber; milestones crossed while playing ring out
  useEffect(() => {
    if (!engine) return
    engine.setReplay(life.at(day))
    if (playing) for (const ms of life.milestones) if (ms.kind !== 'now' && ms.kind !== 'seed' && last.current < ms.day && day >= ms.day) engine.ping(w.id, ms.kind === 'chain' ? 'big' : 'proof')
    last.current = day
  }, [engine, life, day, playing, w.id])
  useEffect(() => () => engine?.setReplay(null), [engine])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const inset = useInsets()
  const wide = useDocked()
  const style = wide ? { left: inset.left + 16, right: inset.right + 68, bottom: 16 } : { left: 8, right: 8, bottom: inset.bottom + 8 }
  const now = [...life.milestones].reverse().find((ms) => ms.day <= day + 0.01) ?? life.milestones[0]
  const ended = day >= life.age
  const toggle = () => {
    if (ended) {
      last.current = 0
      dayRef.current = 0
      setDay(0)
      setPlaying(true)
    } else setPlaying((p) => !p)
  }

  return (
    <m.section
      aria-label={`Replay of ${w.name}`}
      className="fixed z-[4] mx-auto max-w-[640px]"
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
    >
      <div className="sheet rounded-[16px] px-3 pt-2.5 pb-3 sm:px-4">
        <div className="flex items-center gap-2.5">
          <button onClick={toggle} aria-label={ended ? 'Replay again' : playing ? 'Pause' : 'Play'} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-paper hover-device:hover:bg-ink/85">
            {ended ? <RotateCcw className="size-4" /> : playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-[13px]">
              <span className="font-mono font-medium tabular">Day {Math.max(1, Math.ceil(day))}</span>
              <span className="text-ink-3">{life.eraOf(day)}</span>
            </p>
            <p className="truncate text-[13.5px] font-semibold" aria-live="polite">
              {now.title}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close replay" className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover-device:hover:bg-hover hover-device:hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="relative mt-2.5">
          {/* milestones along the track */}
          <div aria-hidden className="pointer-events-none absolute inset-x-[9px] top-1/2 h-0">
            {life.milestones
              .filter((ms) => ms.kind !== 'now')
              .map((ms) => (
                <span
                  key={ms.title + ms.day}
                  className={cn('absolute top-0 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel transition-colors', ms.day <= day ? (ms.kind === 'chain' ? 'bg-water ring-ink/60' : 'bg-green') : 'bg-ink/25')}
                  style={{ left: `${(ms.day / life.age) * 100}%` }}
                />
              ))}
          </div>
          <input
            type="range"
            min={0}
            max={life.age}
            step={0.05}
            value={day}
            onChange={(e) => {
              setPlaying(false)
              dayRef.current = Number(e.target.value)
              setDay(dayRef.current)
            }}
            aria-label="Day in this world's life"
            aria-valuetext={`Day ${Math.max(1, Math.ceil(day))}, ${life.eraOf(day)}. ${now.title}`}
            className="scrub relative w-full"
            style={{ '--k': `${(day / life.age) * 100}%` } as CSSProperties}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10.5px] text-ink-3">
          <span>Seeded</span>
          <span>Today, day {Math.ceil(life.age)}</span>
        </div>
      </div>
    </m.section>
  )
}
