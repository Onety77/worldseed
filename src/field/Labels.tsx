import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useField } from './Field'
import type { Projected } from './engine'
import { StageGlyph } from '@/components/ui/StageGlyph'

/*
  Name tags standing on the Field. Each sits on a thin leader above its world's summit and
  follows the camera every frame (written straight to the DOM; React only renders when the
  list or the lens changes). Tags that would collide step up their leaders; ones that still
  collide fade back so the nearest stay readable.
*/

export interface LabelDetail {
  text: string
  tone?: 'green' | 'red'
}

export function Labels({ worlds, focus, detail, dim = false, hide = null, fresh }: { worlds: World[]; focus?: string | null; detail?: (w: World) => LabelDetail | null; dim?: boolean; hide?: string | null; fresh?: Set<string> }) {
  const engine = useField()
  const refs = useRef(new Map<string, HTMLElement>())
  // tags that win the space: the focused world, and any that just earned a chain
  const first = useRef(new Set<string>())
  useEffect(() => {
    // while a page dims the map, the tags it has something to say about come first too
    const said = dim && detail ? worlds.filter((w) => detail(w)).map((w) => w.id) : []
    first.current = new Set([...(fresh ?? []), ...(focus ? [focus] : []), ...said])
  }, [fresh, focus, dim, detail, worlds])
  const sizes = useRef(new Map<string, { w: number; h: number }>())

  useEffect(() => {
    if (!engine) return
    const offHover = engine.onHover((id) => {
      refs.current.forEach((el, k) => el.toggleAttribute('data-hover', k === id))
    })
    const off = engine.onFrame((list: Projected[]) => {
      const placed: { x: number; y: number; w: number; h: number }[] = []
      // nearest first, so they win the space
      const top = first.current
      const sorted = [...list].sort((a, b) => (top.has(a.id) && !top.has(b.id) ? -1 : top.has(b.id) && !top.has(a.id) ? 1 : a.depth - b.depth))
      for (const p of sorted) {
        const el = refs.current.get(p.id)
        if (!el) continue
        if (!p.visible || p.id === hide) {
          el.style.opacity = '0'
          el.style.visibility = 'hidden'
          continue
        }
        let size = sizes.current.get(p.id)
        if (!size || size.w === 0) {
          const chip = el.querySelector('a')
          size = { w: chip?.offsetWidth ?? 90, h: chip?.offsetHeight ?? 26 }
          sizes.current.set(p.id, size)
        }
        let lead = 14 + (1 - p.depth) * 14
        let fits = false
        for (let tries = 0; tries < 4; tries++) {
          const r = { x: p.x - size.w / 2, y: p.y - lead - size.h, w: size.w, h: size.h }
          if (!placed.some((q) => r.x < q.x + q.w + 4 && r.x + r.w + 4 > q.x && r.y < q.y + q.h + 3 && r.y + r.h + 3 > q.y)) {
            placed.push(r)
            fits = true
            break
          }
          lead += size.h + 4
        }
        if (!fits) placed.push({ x: p.x - size.w / 2, y: p.y - lead - size.h, w: size.w, h: size.h })
        el.style.visibility = 'visible'
        const clear = fits || top.has(p.id)
        el.style.opacity = String(clear ? 1 : 0.28)
        // a tag faded back behind another is out of reach until it has room again
        if (el.inert === clear) el.inert = !clear
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
        el.style.setProperty('--lead', `${lead.toFixed(0)}px`)
        el.style.zIndex = String(top.has(p.id) ? 50 : Math.round((1 - p.depth) * 40))
      }
    })
    return () => {
      off()
      offHover()
    }
  }, [engine, focus, hide])

  // remeasure when the tags' contents change, and place new ones straight away
  useEffect(() => {
    sizes.current.clear()
    engine?.wake()
  }, [engine, worlds, detail])

  if (!engine) return null
  return (
    <nav aria-label="Worlds on the map" className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {worlds.map((w) => {
        const born = fresh?.has(w.id) && w.chain
        // a world that has just earned its chain wears its chain number for a while
        const d = born ? { text: `chain ${w.chain!.chainId}`, tone: undefined } : detail?.(w)
        const on = focus === w.id && !born
        return (
          <div
            key={w.id}
            ref={(el) => {
              if (el) refs.current.set(w.id, el)
              else refs.current.delete(w.id)
            }}
            className="group absolute top-0 left-0 opacity-0 transition-opacity duration-300"
            style={{ visibility: 'hidden' }}
          >
            <span className={cn('contents', dim && !on && (d ? '[&>a]:opacity-95' : '[&>a]:opacity-55'))}>
            <Link
              to={`/w/${w.id}`}
              onMouseEnter={() => engine.setHover(w.id)}
              onMouseLeave={() => engine.setHover(null)}
              onFocus={() => engine.setHover(w.id)}
              onBlur={() => engine.setHover(null)}
              className={cn(
                'pointer-events-auto absolute bottom-[var(--lead)] left-0 flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 text-[12.5px] leading-none font-semibold whitespace-nowrap shadow-[0_0_0_1px_var(--line-2),0_6px_16px_-10px_rgb(20_24_19/0.5)] transition-[background-color,box-shadow,color] duration-200',
                born ? 'fresh-chain bg-sprout text-on-sprout' : on ? 'bg-ink text-paper' : 'bg-raised/90 text-ink backdrop-blur-sm group-data-hover:bg-sprout group-data-hover:text-on-sprout',
                w.mine && !on && 'shadow-[0_0_0_1.5px_var(--green),0_6px_16px_-10px_rgb(20_24_19/0.5)]',
              )}
            >
              <StageGlyph stage={w.stage} className="size-3.5" />
              {w.name}
              {d && (
                <span
                  className={cn(
                    'ml-0.5 font-mono text-[10.5px] font-medium tracking-wide',
                    born ? 'text-on-sprout/80' : on ? 'text-paper/75' : d.tone === 'red' ? 'text-red' : d.tone === 'green' ? 'text-green' : 'text-ink-3',
                    !on && 'group-data-hover:text-on-sprout/75',
                  )}
                >
                  {d.text}
                </span>
              )}
            </Link>
            </span>
            {/* the leader, down to the summit */}
            <span aria-hidden className={cn('absolute bottom-0 left-0 h-[var(--lead)] w-px -translate-x-1/2', on ? 'bg-ink' : 'bg-ink/45')} />
            <span aria-hidden className={cn('absolute -bottom-[3px] left-0 size-[6px] -translate-x-1/2 rounded-full ring-2 ring-raised', on ? 'bg-ink' : 'bg-ink/70')} />
          </div>
        )
      })}
    </nav>
  )
}
