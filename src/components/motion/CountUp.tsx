import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { EASE_OUT } from '@/lib/motion'

/**
 * A number that counts up when `play` turns on, then glides from old to new whenever it
 * changes (a coin joining perps). Writes straight to the DOM, so it never re-renders.
 */
export function CountUp({ value, format, play = true, delay = 0, className }: { value: number; format: (n: number) => string; play?: boolean; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  const shown = useRef<number | null>(null)
  const fmt = useRef(format)
  useEffect(() => {
    fmt.current = format
  })

  useEffect(() => {
    const el = ref.current
    if (!el || !play) return
    if (reduced) {
      el.textContent = fmt.current(value)
      shown.current = value
      return
    }
    const from = shown.current ?? 0
    if (from === value) return
    const first = shown.current === null
    const c = animate(from, value, {
      duration: first ? 1.2 : 0.6,
      delay: first ? delay : 0,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.textContent = fmt.current(v)
        shown.current = v
      },
    })
    return () => c.stop()
  }, [value, play, reduced, delay])

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {format(reduced ? value : 0)}
    </span>
  )
}
