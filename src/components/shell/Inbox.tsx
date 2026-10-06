import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BriefcaseBusiness, CircleCheck, FileCheck2, Landmark, Scale, ShieldAlert, Sprout, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { createStore } from '@/lib/store'
import { useNow } from '@/lib/clock'
import { getState, useGraduations } from '@/lib/sim'
import { inbox, markAllRead, markRead, notify, type Note } from '@/lib/inbox'
import { wallet } from '@/lib/wallet'
import { ago } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { Dialog } from '@/components/ui/Dialog'

export const inboxOpen = createStore(false)

const icon: Record<Note['kind'], LucideIcon> = {
  wallet: Wallet,
  trade: CircleCheck,
  job: BriefcaseBusiness,
  vote: Scale,
  challenge: ShieldAlert,
  proof: FileCheck2,
  milestone: CircleCheck,
  chain: Landmark,
  planted: Sprout,
}

/** The bell, with a count of what you haven't seen. */
export function InboxButton({ className }: { className?: string }) {
  const unread = inbox.use().filter((n) => !n.read).length
  return (
    <button onClick={() => inboxOpen.set(true)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className={cn('relative grid size-9 place-items-center rounded-[9px] text-ink-2 hover-device:hover:bg-hover hover-device:hover:text-ink', className)}>
      <Bell className="size-[18px]" strokeWidth={1.8} />
      {unread > 0 && <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 font-mono text-[9.5px] leading-none font-medium text-on-red tabular">{unread > 9 ? '9+' : unread}</span>}
    </button>
  )
}

export function InboxPanel() {
  const open = inboxOpen.use()
  const list = inbox.use()
  const now = useNow()
  const nav = useNavigate()
  const close = () => inboxOpen.set(false)
  const unread = list.filter((n) => !n.read).length

  return (
    <Dialog open={open} onClose={close} label="Notifications" top className="max-w-[440px]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 pt-4 pb-3 pr-12">
        <div>
          <h2 className="text-[17px] font-semibold">Notifications</h2>
          <p className="text-[12.5px] text-ink-3">{unread ? `${unread} new` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className={buttonClass('ghost', 'sm')}>
            Mark all read
          </button>
        )}
      </div>
      <ul className="max-h-[min(64vh,520px)] overflow-y-auto p-2">
        {list.map((n, k) => {
          const I = icon[n.kind]
          return (
            <li key={n.id}>
              <button
                data-autofocus={k === 0 ? '' : undefined}
                onClick={() => {
                  markRead(n.id)
                  if (n.href) {
                    close()
                    nav(n.href)
                  }
                }}
                className="flex w-full items-start gap-3 rounded-[11px] px-3 py-2.5 text-left hover-device:hover:bg-raised"
              >
                <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px]', n.kind === 'challenge' ? 'bg-red-soft text-red' : n.kind === 'chain' || n.kind === 'planted' ? 'bg-sprout text-on-sprout' : 'bg-ink/[0.05] text-ink-2')}>
                  <I className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn('text-[13.5px]', n.read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{ago(n.at, now)}</span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{n.body}</span>
                </span>
                {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-green" aria-label="Unread" />}
              </button>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}

/**
 * The sample network writes in now and then: proofs from worlds you hold, and the moment a
 * world earns its chain.
 */
export function useInboxFeed() {
  const grads = useGraduations()
  useEffect(() => {
    const g = grads[grads.length - 1]
    if (!g) return
    const w = getState().worlds.find((x) => x.id === g.worldId)
    if (w) notify({ kind: 'chain', title: `${w.name} is sovereign`, body: `Chain ${w.chain?.chainId} is live, settling to Robinhood Chain, with ${w.ticker} as gas.`, worldId: w.id, href: `/w/${w.id}` })
  }, [grads])

  useEffect(() => {
    let t = 0
    const loop = () => {
      if (!document.hidden) {
        const me = wallet.get()
        const held = Object.keys(me.holdings).filter((id) => me.holdings[id].tokens > 0)
        const s = getState()
        const pool = held.length ? s.evidence.filter((e) => held.includes(e.worldId)) : s.evidence
        const e = pool[0]
        const w = e && s.worlds.find((x) => x.id === e.worldId)
        if (e && w) notify({ kind: 'proof', title: `${w.name} published proof`, body: e.title, worldId: w.id, href: `/w/${w.id}#log` })
      }
      t = window.setTimeout(loop, 38_000 + Math.random() * 20_000)
    }
    t = window.setTimeout(loop, 30_000)
    return () => window.clearTimeout(t)
  }, [])
}
