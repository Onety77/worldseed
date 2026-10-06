import { Link } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDocked } from '@/lib/useMedia'
import { enter, exit } from '@/lib/motion'
import { dismiss, toasts } from '@/lib/toast'
import { useInsets } from '@/field/Field'

/** Where small confirmations appear: over the open map, clear of the panels. */
export function Toaster() {
  const list = toasts.use()
  const wide = useDocked()
  const i = useInsets()
  const style = wide ? { left: i.left, right: i.right, bottom: 20 } : { left: 0, right: 0, top: i.top + 8 }
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed z-40 flex flex-col items-center gap-2 px-4" style={style}>
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <m.div
            key={t.id}
            layout="position"
            className="ink-card pointer-events-auto flex max-w-[min(420px,100%)] items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-3 text-[13px] shadow-[0_12px_32px_-12px_rgb(20_24_19/0.6)]"
            initial={{ opacity: 0, y: wide ? 8 : -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: exit }}
            transition={enter}
          >
            <span className={cn('grid size-4 shrink-0 place-items-center rounded-full', t.tone === 'bad' ? 'bg-[#ff8a6b] text-ink' : 'bg-sprout text-on-sprout')}>
              {t.tone === 'bad' ? <X className="size-2.5" strokeWidth={3} /> : <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 truncate font-medium">{t.text}</span>
            {t.href ? (
              <Link to={t.href} onClick={() => dismiss(t.id)} className="shrink-0 rounded-full bg-paper/12 px-2.5 py-1 text-[12px] font-semibold hover-device:hover:bg-paper/20">
                {t.action ?? 'Open'}
              </Link>
            ) : (
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-full text-paper/65 hover-device:hover:bg-paper/12 hover-device:hover:text-paper">
                <X className="size-3.5" />
              </button>
            )}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
