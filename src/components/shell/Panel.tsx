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
  const scroller = useRef<HTMLDivElement>(null)
  const peek = useRef<HTMLDivElement>(null)
  const engine = useField()
  // container height and the scroll offsets of the three resting places
  const [box, setBox] = useState({ h: 600, safe: 0 })
  const [visible, setVisible] = useState(0)
  useCover(peek, 'bottom')

  const space = box.h - PEEK // the transparent space above the sheet when it is low
  const stops = { low: 0, half: Math.max(0, Math.round(box.h * rest - PEEK)), full: space }

  // measure, then open at the half-way place
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setBox({ h: el.clientHeight, safe: 0 })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const opened = useRef(false)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || opened.current || box.h === 600) return
    opened.current = true
    el.scrollTop = stops.half
    setVisible(PEEK + stops.half)
  }, [box.h, stops.half])

  // once a scroll settles: tell the Field how much is covered, and pause it when hidden
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let t = 0
    const settle = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const top = el.scrollTop
        setVisible(Math.min(box.h, PEEK + top))
        engine?.setPaused(top >= space - 2)
      }, 140)
    }
    el.addEventListener('scroll', settle, { passive: true })
    return () => {
      el.removeEventListener('scroll', settle)
      window.clearTimeout(t)
    }
  }, [engine, box.h, space])
  useEffect(() => () => engine?.setPaused(false), [engine])

  const go = (to: number) => scroller.current?.scrollTo({ top: to, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  const where = visible >= box.h - 4 ? 'full' : visible <= PEEK + 4 ? 'low' : 'half'

  return (
    <>
      {/* how much of the screen the sheet covers, for framing the Field; the map never frames under more than 60% */}
      <div ref={peek} aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0" style={{ height: Math.min(visible, box.h * 0.6) }} />
      <div ref={scroller} className="no-scrollbar pointer-events-none fixed inset-x-0 bottom-0 z-10 snap-y snap-proximity overflow-y-auto overscroll-contain" style={{ top: `calc(${BAR}px + env(safe-area-inset-top, 0px))` }}>
        <div aria-hidden className="relative" style={{ height: space }}>
          <span className="absolute top-0 h-px w-full snap-start" />
          <span className="absolute h-px w-full snap-start" style={{ top: stops.half }} />
        </div>
        <m.section
          aria-label={label}
          className={cn('sheet pointer-events-auto relative snap-start rounded-t-[20px] pb-[env(safe-area-inset-bottom,0px)]', className)}
          style={{ minHeight: box.h }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <div className="sticky top-0 z-10 flex h-6 justify-center rounded-t-[20px]">
            <button
              onClick={() => go(where === 'full' ? stops.half : stops.full)}
              aria-label={where === 'full' ? 'Lower the sheet to see the map' : 'Raise the sheet'}
              className="flex h-6 w-24 items-start justify-center pt-2"
            >
              <span className="h-1 w-9 rounded-full bg-ink-4" />
            </button>
          </div>
          {children}
        </m.section>
      </div>
      {/* when the sheet is up, a way straight back to the map */}
      {where === 'full' && (
        <button onClick={() => go(stops.low)} className="sheet fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold shadow-[0_10px_30px_-12px_rgb(20_24_19/0.5)]">
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
  return <div className={cn('sticky top-6 z-[5] border-b border-line bg-panel/95 px-5 pt-3 pb-3 backdrop-blur-md docked:top-0 lg:top-0 lg:px-6 lg:pt-5', className)}>{children}</div>
}
