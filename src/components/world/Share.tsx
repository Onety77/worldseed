import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { readiness, runwayMonths } from '@/lib/rules'
import { count, pct, usd } from '@/lib/format'
import { toast } from '@/lib/toast'
import { buttonClass } from '@/lib/button'
import { Dialog } from '@/components/ui/Dialog'
import { WorldMark } from '@/components/ui/WorldMark'
import { StageTag } from '@/components/ui/bits'
import { Mark } from '@/components/ui/Logo'

/** A world's card, the same one its link shows when shared. */
function Card({ w }: { w: World }) {
  const [pic, setPic] = useState(true)
  // the world's own share picture where the site has one; a drawn card otherwise
  if (pic)
    return <img src={`${import.meta.env.BASE_URL}og/${w.id}.jpg`} alt={`${w.name}'s share card: its hill on the map, with its stage and treasury`} onError={() => setPic(false)} className="aspect-[1200/630] w-full rounded-[14px] bg-water object-cover ring-1 ring-line" />
  const stats: [string, string][] = [
    ['Treasury', usd(w.treasury.balanceUsd)],
    w.stage === 'sovereign' ? ['Own chain', String(w.chain?.chainId ?? '')] : ['Sovereignty', pct(readiness(w))],
    ['Runway', `${runwayMonths(w).toFixed(1)} mo`],
    ['Holders', count(w.holders)],
  ]
  return (
    <div className="overflow-hidden rounded-[14px] bg-paper ring-1 ring-line">
      <div className="relative h-24 overflow-hidden bg-water">
        {/* a few contour rings, standing in for the map */}
        <svg viewBox="0 0 400 96" className="absolute inset-0 size-full" aria-hidden preserveAspectRatio="xMidYMid slice">
          <ellipse cx="300" cy="70" rx="150" ry="62" fill="var(--paper)" stroke="var(--ink)" strokeOpacity=".35" />
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={i} cx="300" cy={70 - i * 3} rx={120 - i * 19} ry={50 - i * 8} fill="none" stroke="var(--ink)" strokeOpacity={0.14 + i * 0.07} strokeWidth="1" />
          ))}
          {w.stage === 'sovereign' && <ellipse cx="300" cy="70" rx="72" ry="34" fill="var(--water)" stroke="var(--ink)" strokeOpacity=".3" strokeDasharray="3 3" />}
          <circle cx="300" cy="66" r="5" fill="var(--sprout)" stroke="var(--ink)" strokeOpacity=".6" />
        </svg>
        <span className="absolute top-3 left-3 flex items-center gap-1.5 font-display text-[11px] font-[640] tracking-[0.14em]">
          <Mark className="size-5" /> WORLDSEED
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <WorldMark world={w} className="size-10" />
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="truncate font-display text-[22px] leading-none font-[580] tracking-[-0.02em]">{w.name}</span>
              <span className="font-mono text-[11px] text-ink-3">{w.ticker}</span>
            </p>
            <StageTag stage={w.stage} className="mt-1.5" />
          </div>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-2">{w.lore}</p>
        <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3">
          {stats.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-[10.5px] text-ink-3">{k}</dt>
              <dd className="truncate font-mono text-[12.5px] font-medium tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

export function ShareButton({ w }: { w: World }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // the router may be in memory (in a preview), so build the link from the world itself
  const link = `${location.origin}${location.pathname.startsWith('/w/') ? location.pathname : `/w/${w.id}`}`
  const text = `${w.name} (${w.ticker}) on WORLDSEED: ${w.lore}`
  const copy = () => {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopied(true)
    toast({ text: 'Link copied' })
    window.setTimeout(() => setCopied(false), 1600)
  }
  const native = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Share ${w.name}`} className="grid size-8 place-items-center rounded-[8px] text-ink-3 hover-device:hover:bg-hover hover-device:hover:text-ink">
        <Share2 className="size-4" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={`Share ${w.name}`} className="max-w-[420px]">
        <div className="p-5">
          <h2 className="text-[17px] font-semibold">Share {w.name}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">Anyone with the link lands on this world, with its map and its record.</p>
          <div className="mt-4">
            <Card w={w} />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-ink/[0.04] py-1.5 pr-1.5 pl-3 ring-1 ring-line ring-inset">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">{link.replace(/^https?:\/\//, '')}</span>
            <button data-autofocus="" onClick={copy} className={buttonClass('ink', 'sm', 'shrink-0')}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <div className={cn('mt-2 grid gap-2', native ? 'grid-cols-2' : 'grid-cols-1')}>
            <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'md', 'w-full ring-1 ring-line ring-inset')}>
              Post on X
            </a>
            {native && (
              <button onClick={() => navigator.share({ title: `${w.name} · WORLDSEED`, text, url: link }).catch(() => {})} className={buttonClass('ghost', 'md', 'w-full ring-1 ring-line ring-inset')}>
                <Share2 className="size-4" /> More…
              </button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  )
}
