import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import { useGraduations, useWorlds } from '@/lib/sim'
import { EASE_OUT } from '@/lib/motion'

/**
 * When a world earns its chain while you're here, say so once, quietly, wherever you are.
 * It steps aside on its own after a few seconds.
 */
export function GraduationNotice() {
  const grads = useGraduations()
  const worlds = useWorlds()
  const { pathname } = useLocation()
  const [shown, setShown] = useState<string | null>(null)
  const [seen, setSeen] = useState(0)
  if (grads.length > seen) {
    setSeen(grads.length)
    setShown(grads[grads.length - 1].worldId)
  }
  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => setShown(null), 9000)
    return () => window.clearTimeout(t)
  }, [shown])
  const w = worlds.find((x) => x.id === shown)
  const here = pathname === `/w/${shown}`

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top,0px))] z-30 flex justify-center px-4 lg:top-5">
      <AnimatePresence>
        {w && !here && (
          <m.div
            key={w.id}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-4 text-[13.5px] text-paper shadow-[0_12px_40px_-12px_rgb(20_24_19/0.6)]"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <span className="size-2 shrink-0 rounded-full bg-sprout" />
            <span>
              <span className="font-semibold">{w.name} is sovereign.</span> Chain {w.chain?.chainId} is live.
            </span>
            <Link to={`/w/${w.id}`} className="rounded-full bg-paper/12 px-3 py-1 text-[12.5px] font-semibold hover-device:hover:bg-paper/20">
              See it
            </Link>
            <button onClick={() => setShown(null)} aria-label="Dismiss" className="grid size-7 place-items-center rounded-full text-paper/70 hover-device:hover:bg-paper/10 hover-device:hover:text-paper">
              <X className="size-3.5" />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
