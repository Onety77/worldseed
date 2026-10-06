const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** $1.2M, $91K, $920, $0.42 */
export const usd = (n: number) => (n >= 1000 ? `$${compact.format(n)}` : n >= 10 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`)
/** prices keep precision: $0.0931, $1.82 */
export const price = (n: number) => `$${n < 1 ? n.toPrecision(3).replace(/(\.\d*?[1-9])0+$/, '$1') : n.toFixed(2)}`
export const num = (n: number) => (n >= 10_000 ? compact.format(n) : Math.round(n).toLocaleString('en-US'))
export const count = (n: number) => Math.round(n).toLocaleString('en-US')
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`
export const change = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(1)}%`
const two = (n: number) => String(n).padStart(2, '0')
/** 0x3f9a…c21e */
export const hash = (h: string, head = 6, tail = 4) => `${h.slice(0, head)}…${h.slice(-tail)}`

/** A duration: "3d 02h", "2h 14m", "14m" */
export function span(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${two(h)}h`
  if (h) return `${h}h ${two(m)}m`
  return `${m}m`
}

/** A full clock: 09:45:12, or 2d 09:45:12 */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const body = `${two(Math.floor((s % 86400) / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`
  return d ? `${d}d ${body}` : body
}

/** "12s", "4m", "3h", "9d" */
export function ago(at: number, now: number) {
  const s = Math.round((now - at) / 1000)
  if (s < 60) return `${Math.max(1, s)}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export const date = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
