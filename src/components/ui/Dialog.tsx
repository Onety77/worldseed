import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { EASE_OUT } from '@/lib/motion'

/**
 * A modal sheet over everything: centred on wide screens, rising from the bottom on
 * phones. Escape and the backdrop close it; focus moves in and comes back on close.
 */
export function Dialog({ open, onClose, label, children, className, top = false }: { open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string; top?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const back = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && box.current) {
        // keep focus inside
        const f = box.current.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', key)
    const t = window.setTimeout(() => (box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current)?.focus(), 30)
    return () => {
      window.removeEventListener('keydown', key)
      window.clearTimeout(t)
      back?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex justify-center px-0 sm:px-4', top ? 'items-end sm:items-start sm:pt-[12vh]' : 'items-end sm:items-center')}>
          <m.div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <m.div
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className={cn('relative w-full max-w-[460px] rounded-t-[20px] bg-panel pb-[env(safe-area-inset-bottom,0px)] shadow-[0_0_0_1px_var(--line),0_30px_80px_-30px_rgb(20_24_19/0.6)] outline-none sm:rounded-[18px] sm:pb-0', className)}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full text-ink-3 hover-device:hover:bg-hover hover-device:hover:text-ink">
              <X className="size-4" />
            </button>
            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
