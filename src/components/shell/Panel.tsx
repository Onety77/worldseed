import { useRef, type ReactNode } from 'react'
import { m } from 'motion/react'
import { cn } from '@/lib/cn'
import { useMedia } from '@/lib/useMedia'
import { useCover } from '@/field/Field'
import { EASE_OUT } from '@/lib/motion'

/*
  Where a page's content lives, laid over the Field.
  - Wide screens: a column docked to the right edge, scrolling on its own.
  - Narrow screens: a sheet that rests low so the Field stays visible above it, and
    scrolls up over the Field with native momentum. The empty space above the sheet lets
    touches through to the Field.
*/

const widths = { md: 'lg:w-[440px]', lg: 'lg:w-[min(620px,calc(100vw-320px))]', xl: 'lg:w-[min(760px,calc(100vw-320px))]' }

export function Panel({ children, width = 'md', rest = 0.46, label, className }: { children: ReactNode; width?: keyof typeof widths; rest?: number; label: string; className?: string }) {
  const wide = useMedia('(min-width: 1024px)')
  const col = useRef<HTMLDivElement>(null)
  const peek = useRef<HTMLDivElement>(null)
  useCover(col, 'right', wide)
  useCover(peek, 'bottom', !wide)

  if (wide) {
    return (
      <m.aside
        ref={col}
        aria-label={label}
        className={cn('sheet fixed top-3 right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-card transition-[width] duration-500 ease-[cubic-bezier(.16,1,.3,1)]', widths[width], className)}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </m.aside>
    )
  }

  return (
    <>
      {/* how much of the screen the resting sheet covers, for framing the Field */}
      <div ref={peek} aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0" style={{ height: `${rest * 100}svh` }} />
      <div className="no-scrollbar pointer-events-none fixed inset-x-0 top-[calc(52px+env(safe-area-inset-top,0px))] bottom-0 z-10 overflow-y-auto overscroll-contain">
        <div aria-hidden style={{ height: `calc(${(1 - rest) * 100}svh - 52px - env(safe-area-inset-top, 0px))` }} />
        <m.section
          aria-label={label}
          className={cn('sheet pointer-events-auto relative min-h-[calc(100svh-52px-env(safe-area-inset-top,0px))] rounded-t-[20px] pb-[env(safe-area-inset-bottom,0px)]', className)}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <div aria-hidden className="sticky top-0 z-10 flex h-5 justify-center rounded-t-[20px] pt-2">
            <span className="h-1 w-9 rounded-full bg-ink-4" />
          </div>
          {children}
        </m.section>
      </div>
    </>
  )
}

/** A panel's own heading row, sticky inside the panel's scroll. */
export function PanelHead({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sticky top-5 z-[5] border-b border-line bg-panel/95 px-5 pt-4 pb-3 backdrop-blur-md lg:top-0 lg:px-6 lg:pt-5', className)}>{children}</div>
}
