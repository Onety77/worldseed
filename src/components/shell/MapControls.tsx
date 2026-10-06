import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Minus, Moon, Plus, Sun } from 'lucide-react'
import { toggleTheme, useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'
import { useDocked } from '@/lib/useMedia'
import { useField, useInsets } from '@/field/Field'

/**
 * Zoom and a compass, standing in the open corner of the Field. The compass needle turns
 * with the camera; tapping it puts the view back the usual way round.
 */
export function MapControls() {
  const engine = useField()
  const inset = useInsets()
  const wide = useDocked()
  const { pathname } = useLocation()
  const needle = useRef<SVGGElement>(null)
  const theme = useTheme()

  useEffect(() => {
    if (!engine) return
    return engine.onFrame(() => {
      const a = ((engine.heading() - 0.5) * 180) / Math.PI
      needle.current?.setAttribute('transform', `rotate(${a.toFixed(1)} 12 12)`)
    })
  }, [engine])

  if (!engine || pathname === '/how') return null
  const btn = 'grid size-10 place-items-center text-ink-2 transition-colors hover-device:hover:bg-hover hover-device:hover:text-ink active:bg-ink/[0.08] lg:size-9'
  const style = wide ? { right: inset.right + 16, bottom: Math.max(inset.bottom, 0) + 16 } : { right: 10, top: inset.top + 10 }

  return (
    <section className="fixed z-[4] flex flex-col overflow-hidden rounded-[12px] sheet" style={style} aria-label="Map controls">
      <button className={btn} onClick={() => engine.zoomBy(0.72)} aria-label="Zoom in">
        <Plus className="size-4" />
      </button>
      <span className="mx-2 h-px bg-line" />
      <button className={btn} onClick={() => engine.zoomBy(1.38)} aria-label="Zoom out">
        <Minus className="size-4" />
      </button>
      <span className="mx-2 h-px bg-line" />
      <button className={cn(btn)} onClick={() => engine.recenter()} aria-label="Reset the view">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.2" />
          <g ref={needle}>
            <path d="M12 4.5 14.2 12h-4.4Z" fill="var(--red)" />
            <path d="M12 19.5 9.8 12h4.4Z" fill="currentColor" fillOpacity=".55" />
          </g>
        </svg>
      </button>
      <span className="mx-2 h-px bg-line" />
      <button className={btn} onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to day' : 'Switch to night'} aria-pressed={theme === 'dark'}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </section>
  )
}
