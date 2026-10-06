import { useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { lenses } from '@/lib/lenses'
import { useEvidence, useWorlds } from '@/lib/sim'
import { useChallenges, useProposals, openJobs } from '@/lib/civic'
import { useNow } from '@/lib/clock'
import { ago, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { EASE_OUT } from '@/lib/motion'
import { useCover } from '@/field/Field'
import { Mark, Wordmark } from '@/components/ui/Logo'
import { StageFilter } from './StageFilter'
import { Legend } from './Legend'
import { InboxButton } from './Inbox'
import { searchOpen } from './Search'
import { keysOpen } from './Keys'
import { Moon, Search as SearchIcon, Sun, Wallet } from 'lucide-react'
import { toggleTheme, useTheme } from '@/lib/theme'
import { usePortfolio } from '@/lib/wallet'
import { connectOpen } from '@/components/wallet/Connect'
import { Identicon } from '@/components/ui/Identicon'

/**
 * The survey instrument on the left of wide screens: who we are, the one thing to do
 * (seed a world), the lenses on the Atlas, which stages to show, and how to read the map.
 */
export function Rail() {
  const ref = useRef<HTMLElement>(null)
  useCover(ref, 'left')
  const { pathname } = useLocation()
  const worlds = useWorlds()
  const proposals = useProposals()
  const challenges = useChallenges()
  const atlas = lenses.some((l) => l.path === pathname)

  const counts: Record<string, string> = {
    worlds: String(worlds.length),
    sovereignty: `${worlds.filter((w) => w.stage === 'realm').length} racing`,
    jobs: `${openJobs.length} open`,
    evidence: 'live',
    governance: String(proposals.filter((p) => p.status === 'voting').length + challenges.filter((c) => c.status === 'open').length),
    rankings: '7 boards',
  }

  return (
    <nav ref={ref} aria-label="Main" className="sheet fixed top-3 bottom-3 left-3 z-10 flex w-[264px] flex-col rounded-card">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-center justify-between pt-4 pr-3 pl-5">
          <Link to="/" className="flex items-center gap-2.5" aria-label="WORLDSEED, the Atlas">
            <Mark className="size-7" />
            <Wordmark />
          </Link>
          <InboxButton />
        </div>

        <div className="px-4 pt-4">
          <button onClick={() => searchOpen.set(true)} className="flex h-9 w-full items-center gap-2 rounded-control bg-ink/[0.04] px-3 text-left text-[13px] text-ink-3 ring-1 ring-line ring-inset hover-device:hover:bg-ink/[0.06]">
            <SearchIcon className="size-3.5" />
            <span className="flex-1">Search</span>
            <kbd className="rounded-[5px] bg-raised px-1.5 py-0.5 font-mono text-[10.5px] ring-1 ring-line">⌘K</kbd>
          </button>
        </div>

        <div className="px-4 pt-2.5">
          <Link to="/seed" className={buttonClass('primary', 'md', 'w-full justify-between')}>
            Seed a world
            <Plus className="size-4" />
          </Link>
        </div>

        <div className="mt-6 px-3">
          <p className="label px-2 pb-1.5">Atlas</p>
          <ul>
            {lenses.map((l) => (
              <li key={l.id}>
                <NavLink
                  to={l.path}
                  end
                  className={({ isActive }) =>
                    cn('relative flex h-9 items-center gap-2.5 rounded-[9px] px-2 text-[14px] font-medium transition-colors', isActive ? 'text-ink' : 'text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <m.span layoutId="rail-lens" className="absolute inset-0 rounded-[9px] bg-raised shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(20_24_19/0.06)]" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
                      <l.icon className={cn('relative size-4', isActive ? 'text-ink' : 'text-ink-3')} strokeWidth={1.8} />
                      <span className="relative flex-1">{l.name}</span>
                      <span className={cn('relative font-mono text-[10.5px] tracking-wide tabular', l.id === 'evidence' ? 'flex items-center gap-1.5 text-green' : 'text-ink-3')}>
                        {l.id === 'evidence' && <span className="ping breathe relative size-1.5 rounded-full bg-green" />}
                        {counts[l.id]}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-2 px-3">
          <YouLink />
        </div>

        <AnimatePresence initial={false}>
          {atlas && (
            <m.div key="filter" className="px-4 pt-5" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
              <p className="label px-1 pb-1.5">Show</p>
              <StageFilter layoutId="rail-filter" grid />
            </m.div>
          )}
        </AnimatePresence>

        <LastProof />

        <div className="mt-auto px-5 pt-6">
          <Legend />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5 text-[12.5px]">
          <Link to="/how" className="flex items-center gap-1 font-medium text-ink-2 hover-device:hover:text-ink">
            How it works <ArrowUpRight className="size-3.5" />
          </Link>
          <span className="flex items-center gap-1">
            <button onClick={() => keysOpen.set(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className="grid size-7 place-items-center rounded-[7px] font-mono text-[12px] font-semibold text-ink-3 ring-1 ring-line ring-inset hover-device:hover:bg-hover hover-device:hover:text-ink">
              ?
            </button>
            <ThemeButton />
          </span>
        </div>
      </div>
    </nav>
  )
}

/** The latest proof any governor published, so the rail always shows the place is alive. */
function LastProof() {
  const ev = useEvidence()
  const worlds = useWorlds()
  const now = useNow()
  const e = ev[0]
  const w = worlds.find((x) => x.id === e?.worldId)
  if (!e || !w) return null
  return (
    <Link to={`/w/${w.id}#log`} className="mx-4 mt-6 block rounded-[10px] px-3 py-2.5 ring-1 ring-line ring-inset hover-device:hover:bg-hover">
      <p className="label flex items-center justify-between">
        <span>Latest proof</span>
        <span className="tabular">{ago(e.at, now)} ago</span>
      </p>
      <p key={e.id} className="fade-in mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-2">
        <span className="font-semibold text-ink">{w.name}</span> · {e.title}
      </p>
    </Link>
  )
}

/** You: your wallet, at a glance. Opens the connect sheet when there isn't one. */
function YouLink() {
  const me = usePortfolio()
  if (!me.connected)
    return (
      <button onClick={() => connectOpen.set(true)} className="flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2 text-[14px] font-medium text-ink-2 ring-1 ring-line ring-inset hover-device:hover:bg-hover hover-device:hover:text-ink">
        <Wallet className="size-4 text-ink-3" strokeWidth={1.8} />
        <span className="flex-1 text-left">Connect wallet</span>
      </button>
    )
  return (
    <NavLink to="/you" className={({ isActive }) => cn('flex h-11 items-center gap-2.5 rounded-[9px] px-2 transition-colors', isActive ? 'bg-raised shadow-[0_0_0_1px_var(--line)]' : 'hover-device:hover:bg-hover')}>
      <Identicon address={me.address} className="size-7 rounded-[8px]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">You</span>
        <span className="block truncate font-mono text-[10.5px] text-ink-3">{me.address.slice(0, 6)}…{me.address.slice(-4)}</span>
      </span>
      <span className="font-mono text-[11.5px] tabular">{usd(me.value + me.cashUsd)}</span>
    </NavLink>
  )
}

function ThemeButton() {
  const theme = useTheme()
  return (
    <button onClick={toggleTheme} aria-pressed={theme === 'dark'} className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-medium text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink">
      {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      {theme === 'dark' ? 'Day' : 'Night'}
    </button>
  )
}
