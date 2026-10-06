import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useFailures, useGraduations, useWorlds } from '@/lib/sim'
import { RISE, exit, surface } from '@/lib/motion'

/**
 * When something big happens to a world while you're here (it earns its chain, or misses
 * a milestone), say so once, quietly, wherever you are. It steps aside after a few seconds.
 */
export function MomentNotice() {
  const grads = useGraduations()
  const fails = useFailures()
  const worlds = useWorlds()
  const { pathname } = useLocation()
  // moments queue up, so two at once are each heard in turn
  const [queue, setQueue] = useState<{ id: string; kind: 'chain' | 'fail' }[]>([])
  const [seen, setSeen] = useState({ g: 0, f: 0 })
  if (grads.length > seen.g || fails.length > seen.f) {
    setSeen({ g: grads.length, f: fails.length })
    setQueue((q) => [...q, ...grads.slice(seen.g).map((g) => ({ id: g.worldId, kind: 'chain' as const })), ...fails.slice(seen.f).map((f) => ({ id: f.worldId, kind: 'fail' as const }))])
  }
  // on the world's own page the page itself says it, so skip to the next moment
  const shown = queue.find((q) => pathname !== `/w/${q.id}`) ?? null
  const next = () => setQueue((q) => q.filter((x) => x !== shown))
  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => setQueue((q) => q.filter((x) => x !== shown)), 10_000)
    return () => window.clearTimeout(t)
  }, [shown])
  const w = worlds.find((x) => x.id === shown?.id)


  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top,0px))] z-30 flex justify-center px-4 lg:top-5">
      <AnimatePresence>
        {w && shown && (
          <m.div
            key={w.id + shown.kind}
            className="ink-card pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-4 text-[13.5px] shadow-[0_12px_40px_-12px_rgb(20_24_19/0.6)]"
            initial={{ opacity: 0, y: -RISE }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: exit }}
            transition={surface}
          >
            <span className={cn('size-2 shrink-0 rounded-full', shown.kind === 'chain' ? 'bg-sprout' : 'bg-[#ff8a6b]')} />
            {shown.kind === 'chain' ? (
              <span>
                <span className="font-semibold">{w.name} is sovereign.</span> Chain {w.chain?.chainId} is live.
              </span>
            ) : (
              <span>
                <span className="font-semibold">{w.name} missed its Growth milestone.</span> Holders are choosing a recovery route.
              </span>
            )}
            <Link to={shown.kind === 'chain' ? `/w/${w.id}` : `/w/${w.id}#governance`} className="rounded-full bg-paper/12 px-3 py-1 text-[12.5px] font-semibold hover-device:hover:bg-paper/20">
              See it
            </Link>
            <button onClick={next} aria-label="Dismiss" className="grid size-7 place-items-center rounded-full text-paper/70 hover-device:hover:bg-paper/10 hover-device:hover:text-paper">
              <X className="size-3.5" />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
