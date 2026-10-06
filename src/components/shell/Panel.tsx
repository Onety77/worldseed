import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { m } from 'motion/react'
import { cn } from '@/lib/cn'
import { RAIL, useDocked, useMedia } from '@/lib/useMedia'
import { useCover, useField } from '@/field/Field'
import { EASE_OUT } from '@/lib/motion'

/*
  Where a page's content lives, laid over the Field.
  - Wide screens: a column docked to the right edge, scrolling on its own.
  - Narrow screens: a sheet with three resting places: low (a peek, so the whole Field is
    yours to explore), half way, and full. It scrolls with native momentum and snaps to
    those places; the empty space above it lets touches through to the Field. When it is
    pulled all the way up, the Field stops drawing to save battery.
*/

const widths = { md: 'lg:w-[440px]', lg: 'lg:w-[min(620px,calc(100vw-320px))]', xl: 'lg:w-[min(760px,calc(100vw-320px))]' }

const BAR = 52 // the top bar, plus the safe area above it
const PEEK = 148 // how much sheet shows when it is down low

export function Panel({ children, width = 'md', rest = 0.46, label, className }: { children: ReactNode; width?: keyof typeof widths; rest?: number; label: string; className?: string }) {
  const wide = useDocked()
  // held sideways on a phone: docked beside the map, under the top bar
  const rail = useMedia(RAIL)
  const col = useRef<HTMLDivElement>(null)
  useCover(col, 'right', wide)

  if (wide) {
    return (
      <m.aside
        ref={col}
        aria-label={label}
        className={cn(
          'docked sheet fixed z-10 flex flex-col overflow-hidden rounded-card transition-[width] duration-500 ease-[cubic-bezier(.16,1,.3,1)]',
          rail ? ['top-3 right-3 bottom-3', widths[width]] : 'top-[calc(60px+env(safe-area-inset-top,0px))] right-[max(8px,env(safe-area-inset-right,0px))] bottom-2 w-[min(400px,50vw)]',
          className,
        )}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </m.aside>
    )
  }
  return (
    <Sheet rest={rest} label={label} className={className}>
      {children}
    </Sheet>
  )
}

function Sheet({ children, rest, label, className }: { children: ReactNode; rest: number; label: string; className?: string }) {
  const sheet = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const peek = useRef<HTMLDivElement>(null)
  const engine = useField()
  // the room under the top bar, and how much of it the sheet covers now
  const [room, setRoom] = useState(() => (typeof window === 'undefined' ? 700 : window.innerHeight - BAR))
  const [h, setH] = useState(() => Math.round((typeof window === 'undefined' ? 700 : window.innerHeight) * rest))
  const [dragging, setDragging] = useState(false)
  useCover(peek, 'bottom')

  const stops = { low: PEEK, half: Math.max(PEEK, Math.round((room + BAR) * rest)), full: room }
  const hRef = useRef(h)

  useLayoutEffect(() => {
    // the notch: read the safe area once through a probe
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
    const measure = () => setRoom(window.innerHeight - BAR - probe.offsetHeight)
    measure()
    window.addEventListener('resize', measure)
    return () => {
      probe.remove()
      window.removeEventListener('resize', measure)
    }
  }, [])
  useLayoutEffect(() => {
    hRef.current = h
  })
  // never taller than the room, if the screen turns or shrinks
  const shown = Math.min(h, stops.full)

  // the Field stops drawing while the sheet covers it all
  useEffect(() => {
    if (!dragging) engine?.setPaused(shown >= stops.full - 2)
  }, [engine, shown, stops.full, dragging])
  useEffect(() => () => engine?.setPaused(false), [engine])

  /*
    One finger on the sheet: while it is not all the way up, an upward swipe raises it;
    at the top of its content, a downward swipe lowers it. Everything else scrolls the
    content, natively. Lifting the finger settles on the nearest resting place, or the
    next one over after a flick.
  */
  useEffect(() => {
    const el = sheet.current
    const sc = scroller.current
    if (!el || !sc) return
    let y0 = 0, h0 = 0, mode: 'none' | 'drag' | 'scroll' = 'none', last = 0, lastT = 0, v = 0
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      y0 = last = e.touches[0].clientY
      lastT = performance.now()
      h0 = hRef.current
      v = 0
      mode = 'none'
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const y = e.touches[0].clientY
      const dy = y - y0
      if (mode === 'none') {
        if (Math.abs(dy) < 6) return
        const atTop = sc.scrollTop <= 0
        const fromHandle = (e.target as HTMLElement).closest('[data-grab]')
        mode = fromHandle || (dy < 0 && h0 < stops.full - 2) || (dy > 0 && atTop) ? 'drag' : 'scroll'
        if (mode === 'drag') setDragging(true)
      }
      if (mode !== 'drag') return
      e.preventDefault()
      const now = performance.now()
      v = (y - last) / Math.max(1, now - lastT)
      last = y
      lastT = now
      setH(Math.max(PEEK * 0.6, Math.min(stops.full, h0 - dy)))
    }
    const end = () => {
      if (mode !== 'drag') return
      mode = 'none'
      setDragging(false)
      const list = [stops.low, stops.half, stops.full]
      const cur = hRef.current
      // a flick goes on to the next place in its direction
      let to = list.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a))
      if (v < -0.5) to = list.find((x) => x > cur + 4) ?? stops.full
      else if (v > 0.5) to = [...list].reverse().find((x) => x < cur - 4) ?? stops.low
      setH(to)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [stops.low, stops.half, stops.full])

  const where = shown >= stops.full - 4 ? 'full' : shown <= stops.low + 4 ? 'low' : 'half'
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <>
      {/* how much of the screen the sheet covers, for framing the Field; the map never frames under more than 60% */}
      <div ref={peek} aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0" style={{ height: Math.min(shown, (stops.full + BAR) * 0.6) }} />
      <m.section
        ref={sheet}
        aria-label={label}
        className={cn('sheet fixed inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-[20px]', className)}
        style={{ height: stops.full, transform: `translateY(${stops.full - shown}px)`, transition: dragging || reduced ? 'none' : 'transform 0.42s cubic-bezier(.16,1,.3,1)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <div data-grab className="flex h-6 shrink-0 justify-center">
          <button
            onClick={() => setH(where === 'full' ? stops.half : stops.full)}
            aria-label={where === 'full' ? 'Lower the sheet to see the map' : 'Raise the sheet'}
            className="flex h-6 w-24 items-start justify-center pt-2"
          >
            <span className="h-1 w-9 rounded-full bg-ink-4" />
          </button>
        </div>
        {/* only the part on screen scrolls: the hidden part below is padding */}
        <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: `calc(${stops.full - shown}px + env(safe-area-inset-bottom, 0px))` }}>
          {children}
        </div>
      </m.section>
      {/* when the sheet is up, a way straight back to the map */}
      {where === 'full' && (
        <button onClick={() => setH(stops.low)} className="sheet fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold shadow-[0_10px_30px_-12px_rgb(20_24_19/0.5)]">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2.5 5.5 7.5 3l5 2.5 5-2.5v11.5l-5 2.5-5-2.5-5 2.5Z" strokeLinejoin="round" />
            <path d="M7.5 3v11.5M12.5 5.5V17" />
          </svg>
          Map
        </button>
      )}
    </>
  )
}

/** A panel's own heading row, sticky inside the panel's scroll. */
export function PanelHead({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sticky top-0 z-[5] border-b border-line bg-panel/95 px-5 pt-3 pb-3 backdrop-blur-md docked:top-0 lg:top-0 lg:px-6 lg:pt-5', className)}>{children}</div>
}
