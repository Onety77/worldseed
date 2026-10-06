import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowUpRight, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { lenses, lensFor } from '@/lib/lenses'
import { buttonClass } from '@/lib/button'
import { enter, exit } from '@/lib/motion'
import { Mark } from '@/components/ui/Logo'
import { Legend } from './Legend'
import { InboxButton } from './Inbox'
import { searchOpen } from './Search'
import { Moon, Search as SearchIcon, Sun, Wallet } from 'lucide-react'
import { toggleTheme, useTheme } from '@/lib/theme'
import { usePortfolio } from '@/lib/wallet'
import { usd } from '@/lib/format'
import { connectOpen } from '@/components/wallet/Connect'
import { Identicon } from '@/components/ui/Identicon'
import { useCover } from '@/field/Field'

/**
 * Narrow screens: a slim bar over the Field. The middle control names where you are and
 * opens the lenses on the Atlas; the sprout button seeds a world.
 */
export function TopBar() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useCover(box, 'top')
  const lens = lensFor(pathname)
  const page: Record<string, string> = { w: 'World', p: 'Proposal', c: 'Challenge', j: 'Job', u: 'Profile' }
  const here = lens?.name ?? page[pathname.split('/')[1]] ?? (pathname === '/seed' ? 'Seed a world' : pathname === '/how' ? 'How it works' : pathname === '/you' ? 'You' : 'Atlas')

  // close on navigation, outside press and Escape
  const [seen, setSeen] = useState(pathname)
  if (seen !== pathname) {
    setSeen(pathname)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <header className="fixed inset-x-0 top-0 z-20 pt-[env(safe-area-inset-top,0px)]">
      <div ref={box} className="relative mx-2 mt-2 flex h-11 items-center gap-1 rounded-[13px] pr-1 pl-1.5 sheet">
        <Link to="/" aria-label="WORLDSEED, the Atlas" className="grid size-9 place-items-center">
          <Mark className="size-7" />
        </Link>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="lens-menu"
          className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[9px] px-2 text-left text-[15px] font-semibold hover-device:hover:bg-hover"
        >
          <span className="truncate">{here}</span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-(--dur-base)', open && 'rotate-180')} />
        </button>
        <button onClick={() => searchOpen.set(true)} aria-label="Search" className="grid size-9 place-items-center rounded-[9px] text-ink-2 hover-device:hover:bg-hover">
          <SearchIcon className="size-[18px]" strokeWidth={1.8} />
        </button>
        <InboxButton />
        <Link to="/seed" className={buttonClass('primary', 'sm', 'h-9 px-3')}>
          <Plus className="size-4" />
          Seed
        </Link>

        <AnimatePresence>
          {open && (
            <m.div
              id="lens-menu"
              // solid, not frosted: a blur nested inside the frosted bar lets the page show through in Safari
              className="absolute inset-x-0 top-[calc(100%+6px)] max-h-[calc(100dvh-80px)] origin-top overflow-y-auto overscroll-contain rounded-[14px] bg-panel p-2 shadow-[0_0_0_1px_var(--line),0_24px_60px_-24px_rgb(20_24_19/0.55)]"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98, transition: exit }}
              transition={enter}
            >
              <p className="label px-2.5 pt-1.5 pb-1">Atlas</p>
              <ul>
                {lenses.map((l) => (
                  <li key={l.id}>
                    <NavLink to={l.path} end className={({ isActive }) => cn('flex items-center gap-3 rounded-[10px] px-2.5 py-2', isActive ? 'bg-raised ring-1 ring-line' : 'hover-device:hover:bg-hover')}>
                      <l.icon className="size-[18px] text-ink-2" strokeWidth={1.8} />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold">{l.name}</span>
                        <span className="block truncate text-[12.5px] text-ink-3">{l.blurb}</span>
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
              <YouRow />
              <ThemeRow />
              <div className="mt-1 border-t border-line px-2.5 pt-3 pb-1">
                <Legend />
              </div>
              <Link to="/how" className="mt-2 flex items-center justify-between rounded-[10px] px-2.5 py-2.5 text-[14px] font-semibold hover-device:hover:bg-hover">
                How it works <ArrowUpRight className="size-4 text-ink-3" />
              </Link>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}

function YouRow() {
  const me = usePortfolio()
  if (!me.connected)
    return (
      <button onClick={() => connectOpen.set(true)} className="mt-1 flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left hover-device:hover:bg-hover">
        <Wallet className="size-[18px] text-ink-2" strokeWidth={1.8} />
        <span className="text-[15px] font-semibold">Connect wallet</span>
      </button>
    )
  return (
    <NavLink to="/you" className={({ isActive }) => cn('mt-1 flex items-center gap-3 rounded-[10px] px-2.5 py-2', isActive ? 'bg-raised ring-1 ring-line' : 'hover-device:hover:bg-hover')}>
      <Identicon address={me.address} className="size-7 rounded-[8px]" />
      <span className="flex-1 text-[15px] font-semibold">You</span>
      <span className="font-mono text-[12px] tabular">{usd(me.value + me.cashUsd)}</span>
    </NavLink>
  )
}

function ThemeRow() {
  const theme = useTheme()
  return (
    <button onClick={toggleTheme} role="switch" aria-checked={theme === 'dark'} className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left hover-device:hover:bg-hover">
      {theme === 'dark' ? <Sun className="size-[18px] text-ink-2" strokeWidth={1.8} /> : <Moon className="size-[18px] text-ink-2" strokeWidth={1.8} />}
      <span className="flex-1 text-[15px] font-semibold">Night</span>
      <span className={cn('relative h-5 w-9 rounded-full transition-colors', theme === 'dark' ? 'bg-sprout' : 'bg-ink/15')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-raised shadow transition-[left]', theme === 'dark' ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  )
}
