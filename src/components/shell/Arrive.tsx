import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useField } from '@/field/Field'
import { Mark } from '@/components/ui/Logo'

/**
 * The first moment of a visit: the same quiet card the page showed while it loaded, held
 * until the Field has drawn its first frames, then lifted away. Once per visit.
 */
export function Arrive() {
  const engine = useField()
  const [shown, setShown] = useState(true)

  useEffect(() => {
    // never hold the page for long, and let go at once if there is no 3D map
    const cap = window.setTimeout(() => setShown(false), engine ? 2600 : 1400)
    if (!engine) return () => window.clearTimeout(cap)
    let frames = 0
    let t = 0
    const off = engine.onFrame(() => {
      if (++frames === 3) t = window.setTimeout(() => setShown(false), 350)
    })
    return () => {
      off()
      window.clearTimeout(cap)
      window.clearTimeout(t)
    }
  }, [engine])

  return (
    <AnimatePresence>
      {shown && (
        <m.div key="arrive" role="status" aria-label="Loading WORLDSEED" className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-paper" exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}>
          <m.div className="grid justify-items-center gap-3.5 font-mono text-[11px] font-medium tracking-[0.14em] text-ink uppercase" exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
            <Mark className="size-10" />
            <span>Surveying the Field</span>
            <span className="arrive-line" />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
