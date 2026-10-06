import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { createStore } from '@/lib/store'
import { connect } from '@/lib/wallet'
import { Dialog } from '@/components/ui/Dialog'

/** Opens the connect sheet from anywhere. */
export const connectOpen = createStore(false)

const providers = [
  { name: 'Robinhood Wallet', note: 'Recommended on Robinhood Chain', tone: 'bg-[#c4ef3a]' },
  { name: 'MetaMask', note: 'Browser extension', tone: 'bg-[#f2a65a]' },
  { name: 'Coinbase Wallet', note: 'Mobile or extension', tone: 'bg-[#4b7bec]' },
  { name: 'WalletConnect', note: 'Scan with any wallet', tone: 'bg-[#7fb3e8]' },
]

/** The connect sheet. In this prototype every option connects the same sample wallet. */
export function ConnectDialog() {
  const open = connectOpen.use()
  const [busy, setBusy] = useState<string | null>(null)
  const close = () => {
    connectOpen.set(false)
    setBusy(null)
  }
  return (
    <Dialog open={open} onClose={close} label="Connect a wallet">
      <div className="px-5 pt-5 pb-5">
        <h2 className="text-h2">Connect a wallet</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">To trade, vote, challenge and claim jobs. Your wallet is how worlds know who you are.</p>
        <ul className="mt-4 grid gap-1.5">
          {providers.map((p, i) => (
            <li key={p.name}>
              <button
                data-autofocus={i === 0 ? '' : undefined}
                disabled={busy !== null}
                onClick={() => {
                  setBusy(p.name)
                  window.setTimeout(() => {
                    connect(p.name)
                    close()
                  }, 900)
                }}
                className={cn('flex w-full items-center gap-3 rounded-[12px] bg-raised px-3.5 py-3 text-left ring-1 ring-line ring-inset transition-colors hover-device:hover:ring-ink-4 disabled:opacity-60', busy === p.name && 'ring-2 ring-ink')}
              >
                <span aria-hidden className={cn('grid size-9 place-items-center rounded-[10px] ring-1 ring-ink/10', p.tone)}>
                  <span className="size-3.5 rounded-full bg-raised/80" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold">{p.name}</span>
                  <span className="block text-[12px] text-ink-3">{busy === p.name ? 'Waiting for approval in your wallet…' : p.note}</span>
                </span>
                {busy === p.name ? <span className="breathe size-2 rounded-full bg-green" /> : <ArrowRight className="size-4 text-ink-3" />}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-ink/[0.04] px-3 py-2.5 text-[12px] text-ink-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-green" />
          Prototype: every option connects a sample wallet with test funds. Nothing leaves this page.
        </p>
      </div>
    </Dialog>
  )
}
