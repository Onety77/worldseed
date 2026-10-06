import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { price as fmt } from '@/lib/format'

/**
 * A price line with an area under it, a faint grid, the latest price marked at the end,
 * and a crosshair that reads out any point under the pointer. Drawn to one scale.
 */
export function PriceChart({ points, className, up }: { points: { t: number; p: number }[]; className?: string; up: boolean }) {
  const W = 600
  const H = 220
  const pad = { l: 8, r: 64, t: 12, b: 24 }
  const box = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { min, max, x, y, path, area, ticks, times } = useMemo(() => {
    const ps = points.map((d) => d.p)
    let lo = Math.min(...ps)
    let hi = Math.max(...ps)
    const padY = (hi - lo || hi * 0.02) * 0.12
    lo -= padY
    hi += padY
    const t0 = points[0].t
    const t1 = points[points.length - 1].t
    const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r)
    const y = (p: number) => pad.t + (1 - (p - lo) / (hi - lo)) * (H - pad.t - pad.b)
    const path = points.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join('')
    const area = `${path}L${x(t1).toFixed(1)},${H - pad.b}L${x(t0).toFixed(1)},${H - pad.b}Z`
    const ticks = [0.15, 0.5, 0.85].map((k) => lo + (hi - lo) * k)
    const span = t1 - t0
    const fmtT = (t: number) => (span <= 86_400_000 * 1.01 ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric' }) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    const times = [0.02, 0.5, 0.98].map((k) => ({ x: pad.l + k * (W - pad.l - pad.r), label: fmtT(t0 + span * k) }))
    return { min: lo, max: hi, x, y, path, area, ticks, times }
  }, [points, pad.l, pad.r, pad.t, pad.b])

  const last = points[points.length - 1]
  const h = hover !== null ? points[hover] : null
  const stroke = up ? 'var(--green)' : 'var(--red)'

  const onMove = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    let best = 0
    let bd = Infinity
    points.forEach((d, i) => {
      const dd = Math.abs(x(d.t) - px)
      if (dd < bd) {
        bd = dd
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div className={cn('relative', className)}>
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Price chart, from ${fmt(points[0].p)} to ${fmt(last.p)}`}>
        <defs>
          <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity=".16" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={W - pad.r + 8} y={y(t) + 4} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-mono)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {times.map((t, i) => (
          <text key={i} x={t.x} y={H - 6} fontSize="11" fill="var(--ink-3)" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontFamily="var(--font-mono)">
            {t.label}
          </text>
        ))}
        <path d={area} fill="url(#area)" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={x(last.t)} cy={y(last.p)} r="4" fill={stroke} />
        <circle cx={x(last.t)} cy={y(last.p)} r="8" fill={stroke} fillOpacity=".18" />
        {h && (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={H - pad.b} stroke="var(--ink)" strokeOpacity=".35" />
            <circle cx={x(h.t)} cy={y(h.p)} r="4" fill="var(--raised)" stroke="var(--ink)" strokeWidth="1.5" />
          </g>
        )}
        <rect x={W - pad.r + 2} y={y(last.p) - 10} width={pad.r - 4} height="20" rx="5" fill={stroke} />
        <text x={W - pad.r + 8} y={y(last.p) + 4} fontSize="11" fill="var(--raised)" fontFamily="var(--font-mono)" fontWeight="500">
          {fmt(last.p)}
        </text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute -top-2 -translate-x-1/2 rounded-[8px] bg-ink px-2 py-1 font-mono text-[11px] whitespace-nowrap text-paper tabular" style={{ left: `${Math.min(78, Math.max(22, (x(h.t) / W) * 100))}%` }}>
          {fmt(h.p)} · {new Date(h.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}
      <span className="sr-only">
        Low {fmt(min)}, high {fmt(max)}
      </span>
    </div>
  )
}
