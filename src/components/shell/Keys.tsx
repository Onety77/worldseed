import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { createStore } from '@/lib/store'
import { toggleTheme } from '@/lib/theme'
import { enter, exit } from '@/lib/motion'
import { useField } from '@/field/Field'
import { Dialog } from '@/components/ui/Dialog'

export const keysOpen = createStore(false)

const go: Record<string, { path: string; name: string }> = {
  w: { path: '/', name: 'Worlds' },
  s: { path: '/sovereignty', name: 'Sovereignty' },
  j: { path: '/jobs', name: 'Jobs' },
  e: { path: '/evidence', name: 'Evidence' },
  v: { path: '/governance', name: 'Governance' },
  r: { path: '/rankings', name: 'Rankings' },
  y: { path: '/you', name: 'You' },
  h: { path: '/how', name: 'How it works' },
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/input|textarea|select/i.test(el.tagName) || el.isContentEditable)
}

/** Where Escape leads from each kind of page. */
function upFrom(path: string) {
  const [, kind] = path.split('/')
  if (kind === 'p' || kind === 'c') return '/governance'
  if (kind === 'j') return '/jobs'
  if (kind === 'u') return '/rankings'
  if (kind === 'w' || kind === 'seed' || kind === 'how' || kind === 'you') return '/'
  return null
}

/**
 * The keyboard, for people who live on it: g then a letter to change lens, n for night,
 * arrows to move over the map, + and − to zoom, Escape to back out, ? for the list.
 */
export function Keys() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const engine = useField()
  const [leader, setLeader] = useState(false)
  // the router's path (the page may run under a memory router, so not location.pathname)
  const here = useRef(pathname)
  useEffect(() => {
    here.current = pathname
  }, [pathname])

  useEffect(() => {
    let timer = 0
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      const dialog = !!document.querySelector('[role="dialog"]')
      if (e.key === 'Escape') {
        // after everything else has had its say: a dialog, a menu, a replay, a district
        window.setTimeout(() => {
          if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return
          const up = upFrom(here.current)
          if (up) nav(up)
        })
        return
      }
      if (dialog) return
      if (leader) {
        window.clearTimeout(timer)
        setLeader(false)
        const to = go[e.key.toLowerCase()]
        if (to) {
          e.preventDefault()
          nav(to.path)
        }
        return
      }
      if (e.key === 'g') {
        setLeader(true)
        timer = window.setTimeout(() => setLeader(false), 1500)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        keysOpen.set(true)
        return
      }
      if (e.key === 'n') return toggleTheme()
      if (!engine) return
      // map keys only while nothing else has focus, so lists and panels still scroll
      const free = document.activeElement === document.body || document.activeElement?.id === 'content'
      if (!free) return
      const step = e.shiftKey ? 180 : 70
      const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
      if (moves[e.key]) {
        e.preventDefault()
        engine.nudge(...moves[e.key])
      } else if (e.key === '+' || e.key === '=') engine.zoomBy(0.8)
      else if (e.key === '-' || e.key === '_') engine.zoomBy(1.25)
      else if (e.key === '[') engine.turn(-0.3)
      else if (e.key === ']') engine.turn(0.3)
      else if (e.key === '0') engine.recenter()
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      window.clearTimeout(timer)
    }
  }, [leader, nav, engine])

  // a stray "g" should not wait across pages
  const [seen, setSeen] = useState(pathname)
  if (seen !== pathname) {
    setSeen(pathname)
    setLeader(false)
  }

  return (
    <>
      <AnimatePresence>
        {leader && (
          <m.div
            role="status"
            className="ink-card pointer-events-none fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exit }}
            transition={enter}
          >
            <kbd className="font-mono font-semibold">g</kbd>
            <span className="text-paper/65">then</span>
            {Object.entries(go).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <kbd className="rounded-[4px] bg-paper/12 px-1 font-mono">{k}</kbd>
                <span className="hidden text-paper/75 sm:inline">{v.name}</span>
              </span>
            ))}
          </m.div>
        )}
      </AnimatePresence>
      <KeysSheet />
    </>
  )
}

const rows: { keys: string[]; what: string }[] = [
  { keys: ['⌘', 'K'], what: 'Search everything' },
  { keys: ['/'], what: 'Search, too' },
  { keys: ['g', 'w'], what: 'Worlds' },
  { keys: ['g', 's'], what: 'Sovereignty' },
  { keys: ['g', 'j'], what: 'Jobs' },
  { keys: ['g', 'e'], what: 'Evidence' },
  { keys: ['g', 'v'], what: 'Governance' },
  { keys: ['g', 'r'], what: 'Rankings' },
  { keys: ['g', 'y'], what: 'You' },
  { keys: ['g', 'h'], what: 'How it works' },
  { keys: ['←', '→', '↑', '↓'], what: 'Move over the map (Shift for more)' },
  { keys: ['+', '−'], what: 'Zoom in and out' },
  { keys: ['[', ']'], what: 'Turn the map' },
  { keys: ['0'], what: 'Reset the view' },
  { keys: ['n'], what: 'Night and day' },
  { keys: ['Esc'], what: 'Back out: close, step out, go up a level' },
  { keys: ['?'], what: 'This list' },
  { keys: ['Esc'], what: 'Close this list' },
]

function KeysSheet() {
  const open = keysOpen.use()
  return (
    <Dialog open={open} onClose={() => keysOpen.set(false)} label="Keyboard shortcuts" className="max-w-[680px]">
      <div className="px-5 pt-5 pb-5">
        <h2 className="text-[17px] font-semibold">Keyboard shortcuts</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Press g, then a letter, to change lens.</p>
        <dl tabIndex={0} aria-label="Shortcuts" className="mt-4 grid max-h-[62vh] gap-px overflow-y-auto rounded-[12px] bg-line ring-1 ring-line sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.what} className="flex items-center justify-between gap-3 bg-panel px-3.5 py-2">
              <dt className="text-[13px] text-ink-2">{r.what}</dt>
              <dd className="flex shrink-0 gap-1">
                {r.keys.map((k) => (
                  <kbd key={k} className="grid h-6 min-w-6 place-items-center rounded-[6px] bg-raised px-1.5 font-mono text-[11.5px] shadow-[0_0_0_1px_var(--line-2),0_1px_0_var(--line-2)]">
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  )
}
