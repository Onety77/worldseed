import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { cn } from '@/lib/cn'
import { enter, exit } from '@/lib/motion'

/**
 * A live figure: changed characters roll in (up when the value rises, down when it falls)
 * and the figure glows green or red for a moment, like a trading terminal. The glow is a
 * CSS animation that restarts by alternating two identical keyframes, so no extra renders.
 */
export function Ticking({ value, text, className, flash = true }: { value: number; text: string; className?: string; flash?: boolean }) {
  const [prev, setPrev] = useState(value)
  const [dir, setDir] = useState(0)
  const [pulse, setPulse] = useState(0)
  if (value !== prev) {
    setPrev(value)
    setDir(value > prev ? 1 : -1)
    setPulse((p) => p + 1)
  }
  const glow = flash && pulse > 0 ? `tick-${dir > 0 ? 'up' : 'down'}-${pulse % 2}` : undefined

  return (
    <span className={cn('relative inline-flex overflow-hidden tabular', glow, className)}>
      <span className="sr-only">{text}</span>
      {text.split('').map((ch, i) => (
        <span key={`${text.length}-${i}`} aria-hidden className="relative inline-block whitespace-pre">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={ch}
              className="inline-block"
              initial={{ y: `${(dir || 1) * 80}%`, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: `${(dir || 1) * -80}%`, opacity: 0, transition: exit }}
              transition={enter}
            >
              {ch}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}
