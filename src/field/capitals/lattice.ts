import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Builder, box, cone, cylinder, dome, gable, lantern, pyramid } from '../kit'
import { drawPlan, type Capital, type CapitalCtx, type Pt } from '../capital'

/*
  Lattice: a trading city that grew round one honest market, and thinks in grids.

  It stands in a square moat on a flat delta, cut into a lattice of islands by a river and
  its canals. Everything lines up: islands, streets, bridges, rows of tall narrow canal
  houses with their gables to the water, lime trees in rows along the quays, even the
  fields outside, laid out in long strips between ditches. Windmills turn at the corners.

  - the Exchange sits on its own island in the middle of the river, its clock tower the
    governor's: every proof it publishes runs out as a square, along the grid;
  - the assembly hall faces the river from the north bank, across a square, with a banner
    for each live proposal hanging on its front;
  - the market is the square opposite, on the south bank: a stall for each open job, and
    the weigh house at its head;
  - the bank keeps the treasury in a square of its own, its lit band showing the runway;
  - each app is a merchant house on the river front;
  - the spaceport is a yard on the south-west island, among warehouses and cranes.

  Figures walk the streets and cross on the bridges; barges work the canals and circle
  the moat.
*/

// the grid's turn against the world, and the way between them
const TH = 0.42
const CO = Math.cos(TH), SI = Math.sin(TH)
const W = (u: number, v: number) => ({ x: u * CO - v * SI, z: u * SI + v * CO })
const V3 = (u: number, v: number, y: number) => [u * CO - v * SI, y, u * SI + v * CO]
const G = (p: Pt) => ({ u: p.x * CO + p.z * SI, v: -p.x * SI + p.z * CO })
/** a kit frame at (u, v), its first axis along u (or along v) */
const F = (u: number, v: number, alongV = false) => ({ ...W(u, v), rot: TH + (alongV ? Math.PI / 2 : 0) })

// the plan, in grid units
const Q = 18.6 // the outer edge of the islands
const MOAT = 20.4 // the far bank of the moat
const WATER = -0.62
const BED = -1.0
const SLAB = -1.1
const US = [-14.4, -5.2, 0, 5.2, 14.4] // streets running across the river
const VS = [-15, -7, 7, 15] // streets running along it

interface Rect {
  u0: number
  u1: number
  v0: number
  v1: number
}
const R = (u0: number, u1: number, v0: number, v1: number): Rect => ({ u0, u1, v0, v1 })
const BANDS_U = [[-Q, -10.3], [-8.9, 8.9], [10.3, Q]]
const BANDS_V = [[11.7, Q], [3.6, 10.3], [-10.3, -3.6], [-Q, -11.7]]
const ISLANDS: Rect[] = [...BANDS_U.flatMap(([u0, u1]) => BANDS_V.map(([v0, v1]) => R(u0, u1, v0, v1))), R(-6.5, 6.5, -2.2, 2.2)]
const CENTRE = ISLANDS[ISLANDS.length - 1]

// where the civic places stand
const HALL = R(-3.4, 3.4, 3.6, 8.4)
const MARKET = R(-4.2, 4.2, -9.7, -3.6)
const BANK = R(12.0, 16.9, 4.4, 9.5)
const YARD = R(-Q, -10.3, -Q, -11.7)
const APP_SLOTS: { u: number; v: number; front: 1 | -1 }[] = [
  { u: -7.05, v: 4.85, front: -1 },
  { u: 7.05, v: 4.85, front: -1 },
  { u: 7.05, v: -4.85, front: 1 },
  { u: -7.05, v: -4.85, front: 1 },
  { u: -12.4, v: 4.85, front: -1 },
  { u: 12.4, v: -4.85, front: 1 },
  { u: -16.5, v: -4.85, front: 1 },
  { u: 16.5, v: 4.85, front: -1 },
]

// colours: brick, stone and plaster; slate and tile
const WALLS = ['#8c4a36', '#7a3f2f', '#9a5a40', '#6e3b2d', '#8c4a36', '#d6c8ab', '#e4d9c3', '#565c55', '#3e4448', '#b8895a']
const ROOFS = ['#4a4744', '#3f3d3b', '#8f4b35', '#55504b']
const PAVING = '#b8ad99'
const STONE = '#857c70'
const GRASS = '#7c9650'

const overlap = (a: Rect, b: Rect) => a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0

export function lattice(ctx: CapitalCtx): Capital {
  const { input, r, top } = ctx
  const b = new Builder(r, 'defi')
  b.lit = 0.45 + input.lit * 0.45
  const g = () => top
  const reserved: Rect[] = [HALL, MARKET, BANK, YARD, CENTRE]
  const trees: { u: number; v: number; s: number }[] = []
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  input.apps.forEach((_, i) => {
    const sl = APP_SLOTS[i % APP_SLOTS.length]
    reserved.push(R(sl.u - 1.25, sl.u + 1.25, sl.v - 1.15, sl.v + 1.15))
  })

  // ── the islands: stone quays rising out of the water, paved on top ──
  for (const is of ISLANDS) {
    b.at(SLAB).tint(STONE, PAVING)
    const c = [V3(is.u0, is.v0, top), V3(is.u1, is.v0, top), V3(is.u1, is.v1, top), V3(is.u0, is.v1, top)]
    const lo = c.map((p) => [p[0], SLAB, p[2]])
    b.quad(c[0], c[1], c[2], c[3], 'roof')
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      b.quad(lo[i], lo[j], c[j], c[i], 'wall')
      b.edge(c[i], c[j])
    }
  }

  // ── streets: which islands each crosses, and the bridges between them ──
  const bridges: { a: [number, number]; c: [number, number] }[] = []
  for (const us of US) {
    const on = ISLANDS.filter((is) => is.u0 + 0.6 < us && us < is.u1 - 0.6).sort((a, c) => a.v0 - c.v0)
    for (let i = 1; i < on.length; i++) if (on[i].v0 - on[i - 1].v1 < 8) bridges.push({ a: [us, on[i - 1].v1], c: [us, on[i].v0] })
  }
  for (const vs of VS) {
    const on = ISLANDS.filter((is) => is.v0 + 0.6 < vs && vs < is.v1 - 0.6).sort((a, c) => a.u0 - c.u0)
    for (let i = 1; i < on.length; i++) if (on[i].u0 - on[i - 1].u1 < 8) bridges.push({ a: [on[i - 1].u1, vs], c: [on[i].u0, vs] })
  }
  // the gates: out over the moat to the roads
  bridges.push({ a: [0, Q], c: [0, MOAT + 0.4] }, { a: [0, -Q], c: [0, -MOAT - 0.4] }, { a: [Q, 7], c: [MOAT + 0.4, 7] }, { a: [-Q, -7], c: [-MOAT - 0.4, -7] })
  for (const br of bridges) bridge(b, br.a, br.c, top)

  // ── the gardens in the middle of each island, and rows of houses round them ──
  const DEPTH = 0.62
  for (const is of ISLANDS) {
    if (is === CENTRE || is === YARD) continue
    const inset = 0.6 + DEPTH * 2 + 0.12
    const inner = R(is.u0 + inset, is.u1 - inset, is.v0 + inset, is.v1 - inset)
    // gardens, cut by the streets that run through
    const cutsU = US.filter((u) => u > inner.u0 && u < inner.u1)
    const cutsV = VS.filter((v) => v > inner.v0 && v < inner.v1)
    const spansU = split(inner.u0, inner.u1, cutsU, 0.45)
    const spansV = split(inner.v0, inner.v1, cutsV, 0.45)
    for (const [u0, u1] of spansU)
      for (const [v0, v1] of spansV) {
        const gd = R(u0, u1, v0, v1)
        if (reserved.some((rv) => overlap(rv, gd))) continue
        b.at(top).tint(undefined, GRASS)
        b.quad(V3(u0, v0, top + 0.012), V3(u1, v0, top + 0.012), V3(u1, v1, top + 0.012), V3(u0, v1, top + 0.012), 'roof')
        // a few trees in each yard
        const n = Math.floor(((u1 - u0) * (v1 - v0)) / 3.2)
        for (let k = 0; k < n; k++) trees.push({ u: u0 + 0.4 + r() * (u1 - u0 - 0.8), v: v0 + 0.4 + r() * (v1 - v0 - 0.8), s: 0.75 + r() * 0.35 })
      }
    // the rows: along each edge, facing the water
    const edges: { a: number; c: number; fixed: number; alongV: boolean; out: 1 | -1 }[] = [
      { a: is.u0 + 0.6, c: is.u1 - 0.6, fixed: is.v1, alongV: false, out: 1 },
      { a: is.u0 + 0.6, c: is.u1 - 0.6, fixed: is.v0, alongV: false, out: -1 },
      { a: is.v0 + 0.6 + DEPTH * 2 + 0.05, c: is.v1 - 0.6 - DEPTH * 2 - 0.05, fixed: is.u1, alongV: true, out: 1 },
      { a: is.v0 + 0.6 + DEPTH * 2 + 0.05, c: is.v1 - 0.6 - DEPTH * 2 - 0.05, fixed: is.u0, alongV: true, out: -1 },
    ]
    for (const e of edges) {
      const streets = e.alongV ? VS : US
      const line = e.fixed - e.out * (0.6 + DEPTH)
      let s = e.a
      while (s < e.c - 0.5) {
        const w = 0.26 + r() * 0.14
        const mid = s + w
        if (mid + w > e.c) break
        const foot = e.alongV ? R(line - DEPTH, line + DEPTH, mid - w, mid + w) : R(mid - w, mid + w, line - DEPTH, line + DEPTH)
        const street = streets.some((st) => Math.abs(st - mid) < w + 0.42)
        if (street || reserved.some((rv) => overlap(rv, foot))) {
          s += 0.2
          continue
        }
        // turned so the house's front (its second axis) looks out over the water
        const f = e.alongV ? { ...W(line, mid), rot: TH - Math.PI / 2 + (e.out < 0 ? Math.PI : 0) } : { ...W(mid, line), rot: TH + (e.out < 0 ? Math.PI : 0) }
        canalHouse(b, f, w, DEPTH, top, r, pick)
        s += w * 2 + 0.015
      }
      // lime trees in a row along the quay, a lamp every so often
      const qline = e.fixed - e.out * 0.3
      let k = 0
      for (let q = e.alongV ? is.v0 + 0.7 : is.u0 + 0.7; q < (e.alongV ? is.v1 : is.u1) - 0.7; q += 1.25, k++) {
        const near = bridges.some((br) => (e.alongV ? Math.abs(br.a[1] - q) < 0.8 && Math.abs(br.a[0] - e.fixed) < 0.1 : Math.abs(br.a[0] - q) < 0.8 && (Math.abs(br.a[1] - e.fixed) < 0.1 || Math.abs(br.c[1] - e.fixed) < 0.1)))
        const at = e.alongV ? { u: qline, v: q } : { u: q, v: qline }
        if (near || reserved.some((rv) => at.u > rv.u0 - 0.2 && at.u < rv.u1 + 0.2 && at.v > rv.v0 - 0.2 && at.v < rv.v1 + 0.2)) continue
        if (k % 4 === 2) {
          const p = W(at.u, at.v)
          lantern(b, g, p.x, p.z)
        } else trees.push({ ...at, s: 0.62 + r() * 0.12 })
      }
    }
  }

  const places: { key: string; kind: Parameters<CapitalCtx['place']>[1]; u: number; v: number; y: number }[] = []
  const place = (key: string, kind: Parameters<CapitalCtx['place']>[1], u: number, v: number, y: number) => places.push({ key, kind, u, v, y })

  // ── the Exchange, on its island in the river, and the governor's clock tower ──
  {
    for (const side of [-1, 1]) {
      const f = F(side * 3.85, 0)
      b.at(top).tint('#8a4634', '#47423e')
      const y = box(b, f, top, 2.05, 1.45, 0.18, { roof: 'trim', windows: false })
      const wy = box(b, f, y, 1.95, 1.35, 1.5)
      gable(b, f, wy, 2.0, 1.4, 0.75)
      // a glazed ridge, lit from inside at night
      for (const k of [-1, 1]) {
        const rg = [V3(side * 3.85 - 1.7, k * 0.34, wy + 0.59), V3(side * 3.85 + 1.7, k * 0.34, wy + 0.59), V3(side * 3.85 + 1.7, 0, wy + 0.77), V3(side * 3.85 - 1.7, 0, wy + 0.77)]
        b.tri(rg[0], rg[1], rg[2], 'accent', 1)
        b.tri(rg[0], rg[2], rg[3], 'accent', 1)
      }
    }
    // the tower
    const f = F(0, 0)
    b.at(top).tint('#7f4231', '#3f3c3a')
    let y = box(b, f, top, 1.05, 1.05, 0.22, { roof: 'trim', windows: false })
    y = box(b, f, y, 0.82, 0.82, 3.9)
    y = box(b, f, y, 0.92, 0.92, 0.12, { roof: 'trim', windows: false })
    // the belfry: open arches, and a clock face on each side
    const by = y
    y = box(b, f, y, 0.7, 0.7, 1.1, { windows: false })
    for (let i = 0; i < 4; i++) {
      const a = TH + (i * Math.PI) / 2
      const n = [Math.cos(a), Math.sin(a)]
      const t = [-n[1], n[0]]
      const cx = n[0] * 0.715, cz = n[1] * 0.715, cy = by + 0.6
      const pts = Array.from({ length: 12 }, (_, k) => {
        const q = (k / 12) * Math.PI * 2
        return [cx + t[0] * Math.cos(q) * 0.36, cy + Math.sin(q) * 0.36, cz + t[1] * Math.cos(q) * 0.36]
      })
      for (let k = 0; k < 12; k++) b.tri([cx, cy, cz], pts[k], pts[(k + 1) % 12], 'canvas', 0.6)
      b.edge([cx, cy, cz], [cx + t[0] * 0.24, cy + 0.08, cz + t[1] * 0.24])
      b.edge([cx, cy, cz], [cx, cy + 0.3, cz])
    }
    y = box(b, f, y, 0.8, 0.8, 0.1, { roof: 'trim', windows: false })
    pyramid(b, f, y, 0.62, 0.62, 2.2)
    // a lantern of the world's own green at the very top
    const ly = y + 2.2
    for (let i = 0; i < 4; i++) {
      const a0 = TH + (i * Math.PI) / 2 + Math.PI / 4, a1 = a0 + Math.PI / 2
      b.tri([Math.cos(a0) * 0.14, ly - 0.3, Math.sin(a0) * 0.14], [Math.cos(a1) * 0.14, ly - 0.3, Math.sin(a1) * 0.14], [0, ly + 0.15, 0], 'brand', 1)
    }
    b.edge([0, ly, 0], [0, ly + 0.9, 0])
    place('tower', 'tower', 0, 0, ly + 0.4)
    // trees at the ends of the island
    for (const side of [-1, 1]) for (const v of [-1.4, 0, 1.4]) trees.push({ u: side * 6.05, v, s: 0.62 })
  }

  // ── the assembly hall, facing the river across its square ──
  {
    const hv = 6.6
    const f = F(0, hv)
    b.at(top).tint('#e3d8c2', '#4a4744')
    const y = box(b, f, top, 3.0, 1.45, 0.22, { roof: 'trim', windows: false })
    const body = box(b, f, y, 2.85, 1.3, 2.1)
    box(b, f, body, 2.95, 1.4, 0.12, { roof: 'trim', windows: false })
    pyramid(b, f, body + 0.12, 2.9, 1.35, 0.55)
    // the projecting middle, with a pediment
    const fm = F(0, hv - 1.36)
    const my = box(b, fm, y, 0.95, 0.12, 2.3, { windows: false })
    const P = (i: number, yy: number) => V3(i, hv - 1.5, yy)
    b.tri(P(-1.0, my), P(1.0, my), P(0, my + 0.55), 'wall')
    b.edge(P(-1.0, my), P(0, my + 0.55))
    b.edge(P(1.0, my), P(0, my + 0.55))
    // the cupola
    const fc = F(0, hv + 0.2)
    let cy = cylinder(b, fc, body + 0.45, 0.42, 0.55, 10, 'trim', false)
    b.tint(undefined, '#6f8f6a')
    dome(b, fc, cy, 0.44, 'roof')
    cy += 0.44
    b.edge([fc.x, cy, fc.z], [fc.x, cy + 0.7, fc.z])
    // banners for the live proposals, filled as far as their support
    input.proposals.slice(0, 6).forEach((pr, i, all) => {
      void all
      const at = [-1.35, 1.35, -1.95, 1.95, -2.55, 2.55][i]
      const w = 0.17, yt = body - 0.15, len = 1.3
      const fill = Math.min(1, Math.max(0.04, pr.support))
      const yf = yt - len + len * fill
      const k = hv - 1.33
      b.quad(V3(at - w, k, yt - len), V3(at + w, k, yt - len), V3(at + w, k, yf), V3(at - w, k, yf), 'brand')
      b.quad(V3(at - w, k, yf), V3(at + w, k, yf), V3(at + w, k, yt), V3(at - w, k, yt), 'canvas')
    })
    place('hall', 'hall', 0, hv, cy + 0.3)
    // the square in front: lamps at its corners
    for (const u of [-3.0, 3.0]) {
      const p = W(u, 4.25)
      lantern(b, g, p.x, p.z)
    }
  }

  // ── the market square: stalls in two rows, the weigh house at the head ──
  {
    b.at(top).tint(undefined, '#c4b598')
    const sq = [V3(MARKET.u0 + 0.3, MARKET.v1 - 0.6, top + 0.015), V3(MARKET.u1 - 0.3, MARKET.v1 - 0.6, top + 0.015), V3(MARKET.u1 - 0.3, MARKET.v0 + 0.6, top + 0.015), V3(MARKET.u0 + 0.3, MARKET.v0 + 0.6, top + 0.015)]
    b.quad(sq[0], sq[1], sq[2], sq[3], 'roof')
    for (let i = 0; i < 4; i++) b.edge(sq[i], sq[(i + 1) % 4])
    const n = Math.max(2, Math.min(8, input.jobs.length))
    for (let i = 0; i < n; i++) {
      const row = i % 2 ? 1 : -1
      const col = Math.floor(i / 2)
      const cols = Math.ceil(n / 2)
      const u = -((cols - 1) * 1.3) / 2 + col * 1.3
      const v = -6.0 + row * 0.95
      const f = { ...W(u, v), rot: TH + (row > 0 ? Math.PI : 0) }
      b.at(top + 0.015)
      const st = box(b, f, top + 0.015, 0.42, 0.28, 0.32, { windows: false })
      const c = Math.cos(f.rot), s = Math.sin(f.rot)
      const Qp = (i2: number, k: number, hy: number) => [f.x + (i2 * c - k * s), hy, f.z + (i2 * s + k * c)]
      b.quad(Qp(-0.5, -0.32, st + 0.24), Qp(0.5, -0.32, st + 0.24), Qp(0.5, 0.5, st), Qp(-0.5, 0.5, st), i % 3 === 0 ? 'brand' : 'canvas')
    }
    // the weigh house: a small keep with a turret at each corner
    const wv = -8.75
    const f = F(0, wv)
    b.at(top).tint('#d9ccb2', '#47423e')
    const wy = box(b, f, top, 1.1, 0.7, 1.4)
    pyramid(b, f, wy, 1.15, 0.75, 0.75)
    for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const ft = F(i * 1.1, wv + k * 0.7)
      const ty = cylinder(b, ft, top, 0.3, 1.75, 8, 'wall')
      cone(b, ft.x, ft.z, ty, 0.36, 0.75, 'roof')
    }
    place('market', 'market', 0, -6.0, wy + 0.9)
  }

  // ── the bank: the treasury in a square of its own ──
  {
    const bu = (BANK.u0 + BANK.u1) / 2, bv = (BANK.v0 + BANK.v1) / 2
    const f = F(bu, bv)
    b.at(top).tint(undefined, '#c4b598')
    const sq = [V3(BANK.u0, BANK.v0, top + 0.015), V3(BANK.u1, BANK.v0, top + 0.015), V3(BANK.u1, BANK.v1, top + 0.015), V3(BANK.u0, BANK.v1, top + 0.015)]
    b.quad(sq[0], sq[1], sq[2], sq[3], 'roof')
    b.at(top).tint('#bdb5a5', '#a88a4c')
    let y = box(b, f, top, 1.75, 1.75, 0.38, { roof: 'trim', windows: false })
    const yb = y
    y = box(b, f, y, 1.5, 1.5, 1.45, { windows: false })
    // the band: lit glass round all four sides, as high as the runway reaches (two years fills it)
    const fill = Math.min(1, Math.max(0.08, input.runway / 24))
    const lo = yb + 0.18, hi = yb + 0.18 + (1.45 - 0.36) * fill
    for (let side = 0; side < 4; side++) {
      const a = TH + (side * Math.PI) / 2
      const n = [Math.cos(a), Math.sin(a)], t = [-n[1], n[0]]
      for (let k = -2; k <= 2; k++) {
        const c = [f.x + n[0] * 1.515 + t[0] * k * 0.55, f.z + n[1] * 1.515 + t[1] * k * 0.55]
        const A = [c[0] - t[0] * 0.17, lo, c[1] - t[1] * 0.17], B = [c[0] + t[0] * 0.17, lo, c[1] + t[1] * 0.17]
        b.tri(A, B, [B[0], hi, B[2]], 'lamp', 1)
        b.tri(A, [B[0], hi, B[2]], [A[0], hi, A[2]], 'lamp', 1)
      }
    }
    y = box(b, f, y, 1.62, 1.62, 0.14, { roof: 'trim', windows: false })
    y = box(b, f, y, 1.15, 1.15, 0.32, { roof: 'trim', windows: false })
    pyramid(b, f, y, 1.15, 1.15, 0.85, 'roof')
    place('vault', 'vault', bu, bv, y + 0.85)
    for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) trees.push({ u: bu + i * 2.25, v: bv + k * 2.2, s: 0.7 })
  }

  // ── the spaceport yard: a pad, the ship and its gantry, warehouses and cranes ──
  {
    const pu = -14.6, pv = -15.4
    const p = W(pu, pv)
    b.at(top).tint(undefined, '#9d9688')
    const pad = cylinder(b, { ...p, rot: 0 }, top, 2.0, 0.12, 28, 'roof')
    for (let i = 0; i < 32; i++) {
      const q0 = (i / 32) * Math.PI * 2, q1 = ((i + 1) / 32) * Math.PI * 2
      b.edge([p.x + Math.cos(q0) * 1.4, pad + 0.005, p.z + Math.sin(q0) * 1.4], [p.x + Math.cos(q1) * 1.4, pad + 0.005, p.z + Math.sin(q1) * 1.4])
    }
    const f = { ...p, rot: 0 }
    b.at(pad).tint('#ece4d4')
    let sy = cylinder(b, f, pad, 0.34, 2.0, 12, 'wall', true)
    sy = cylinder(b, f, sy, 0.36, 0.1, 12, 'trim')
    for (let i = 0; i < 12; i++) {
      const q0 = (i / 12) * Math.PI * 2, q1 = ((i + 1) / 12) * Math.PI * 2
      b.tri([p.x + Math.cos(q0) * 0.34, sy, p.z + Math.sin(q0) * 0.34], [p.x + Math.cos(q1) * 0.34, sy, p.z + Math.sin(q1) * 0.34], [p.x, sy + 0.85, p.z], 'brand')
    }
    for (let i = 0; i < 3; i++) {
      const q = (i / 3) * Math.PI * 2 + 0.3
      const ix = Math.cos(q), iz = Math.sin(q)
      b.tri([p.x + ix * 0.32, pad + 0.65, p.z + iz * 0.32], [p.x + ix * 0.78, pad, p.z + iz * 0.78], [p.x + ix * 0.32, pad, p.z + iz * 0.32], 'roof')
    }
    const gp = W(pu + 1.15, pv + 0.25)
    for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(b, { x: gp.x + i * 0.17, z: gp.z + k * 0.17, rot: 0 }, pad, 0.03, 0.03, 2.7, { roof: 'trim', windows: false, edges: false })
    for (let gy = pad + 0.4; gy < pad + 2.7; gy += 0.5) {
      b.edge([gp.x - 0.17, gy, gp.z - 0.17], [gp.x + 0.17, gy + 0.5, gp.z - 0.17])
      b.edge([gp.x + 0.17, gy, gp.z + 0.17], [gp.x - 0.17, gy + 0.5, gp.z + 0.17])
    }
    b.tri([gp.x - 0.1, pad + 2.75, gp.z], [gp.x + 0.1, pad + 2.75, gp.z], [gp.x, pad + 2.95, gp.z], 'lamp', 1)
    place('port', 'port', pu, pv, sy + 0.85)
    // warehouses along the canal, each with a hoist beam under its gable
    for (let i = 0; i < 3; i++) {
      const fw = { ...W(-17.0 + i * 2.25, -12.95), rot: TH + Math.PI / 2 }
      b.at(top).tint(pick(['#6e3b2d', '#7a3f2f', '#5d4a3c']), '#47423e')
      const wy = box(b, fw, top, 0.62, 0.95, 1.55)
      gable(b, fw, wy, 0.66, 1.0, 0.7)
      const hp = W(-17.0 + i * 2.25, -12.95 + 0.66)
      b.edge([hp.x, wy + 0.3, hp.z], [hp.x + (-SI) * 0.35, wy + 0.3, hp.z + CO * 0.35])
    }
    // two cranes on the outer quay
    for (const cu of [-17.6, -11.3]) {
      const cp = W(cu, -17.9)
      b.at(top).tint('#9a9284')
      box(b, { ...cp, rot: TH }, top, 0.16, 0.16, 1.9, { roof: 'trim', windows: false })
      const tip = V3(cu, -19.4, top + 2.1)
      b.edge([cp.x, top + 1.9, cp.z], tip)
      b.edge([cp.x, top + 2.4, cp.z], tip)
      b.edge([cp.x, top + 1.9, cp.z], [cp.x, top + 2.4, cp.z])
      b.edge(tip, [tip[0], top + 0.4, tip[2]])
    }
    crate(b, -12.0, -13.0, top, r)
    crate(b, -11.6, -16.8, top, r)
  }

  // ── the apps: merchant houses on the river front, each taller than the rest ──
  input.apps.forEach((app, i) => {
    const sl = APP_SLOTS[i % APP_SLOTS.length]
    const f = { ...W(sl.u, sl.v), rot: TH + Math.PI / 2 + (sl.front < 0 ? Math.PI : 0) }
    // first axis across the front; the second runs from the water inward
    const fr = { ...W(sl.u, sl.v), rot: TH }
    b.at(top).tint(['#e2d6be', '#8c4a36', '#d6c8ab', '#6e3b2d'][i % 4], '#47423e')
    const y0 = box(b, fr, top, 1.12, 1.0, 0.16, { roof: 'trim', windows: false })
    const y1 = box(b, fr, y0, 1.0, 0.9, 2.3 + (i === 0 ? 0.5 : 0))
    let peak: number
    if (i % 2 === 0) {
      // a bell gable to the water, a lantern on the ridge
      gable(b, f, y1, 0.9, 1.0, 0.95)
      const c = W(sl.u, sl.v)
      cylinder(b, { ...c, rot: 0 }, y1 + 0.7, 0.16, 0.42, 8, 'brand')
      cone(b, c.x, c.z, y1 + 1.12, 0.2, 0.4, 'roof')
      peak = y1 + 1.52
    } else {
      // a flat front with a balustrade, and a dome behind
      box(b, fr, y1, 1.05, 0.95, 0.1, { roof: 'trim', windows: false })
      const c = W(sl.u, sl.v - sl.front * 0.15)
      b.tint(undefined, '#6f8f6a')
      const dy = cylinder(b, { ...c, rot: 0 }, y1 + 0.1, 0.42, 0.32, 10, 'trim')
      dome(b, { ...c, rot: 0 }, dy, 0.46, 'roof')
      b.edge([c.x, dy + 0.46, c.z], [c.x, dy + 1.0, c.z])
      peak = dy + 0.8
    }
    // a band of the world's green across the front, where the name would be
    const k = sl.v + sl.front * 0.92
    b.quad(V3(sl.u - 0.75, k, y1 - 0.42), V3(sl.u + 0.75, k, y1 - 0.42), V3(sl.u + 0.75, k, y1 - 0.24), V3(sl.u - 0.75, k, y1 - 0.24), 'brand')
    place(app.key, 'app', sl.u, sl.v, peak)
  })

  // ── outside the walls: windmills at the corners ──
  const mills: THREE.Group[] = []
  const millGeo = sailGeometry()
  const millMat = new THREE.MeshLambertMaterial({ color: '#e8dfcb', side: THREE.DoubleSide })
  for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const mu = i * 23.6, mv = k * 23.6
    const p = W(mu, mv)
    b.at(top).tint('#5b5650', '#3f3c3a')
    frustum(b, p.x, p.z, top, 0.9, 0.55, 2.6, 8)
    cone(b, p.x, p.z, top + 2.6, 0.66, 0.6, 'roof')
    // the sails face the wind, which comes off the sea in the west
    const hub = new THREE.Group()
    const face = TH + Math.PI
    hub.position.set(p.x + Math.cos(face) * 0.72, top + 2.65, p.z + Math.sin(face) * 0.72)
    hub.rotation.y = -face + Math.PI / 2
    const sails = new THREE.Mesh(millGeo, millMat)
    sails.castShadow = true
    sails.rotation.z = r() * Math.PI
    hub.add(sails)
    mills.push(hub)
  }

  // ── draw it ──
  const group = b.build(ctx.shared)
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  for (const p of places) {
    const w = W(p.u, p.v)
    ctx.place(p.key, p.kind, w.x, p.y, w.z)
  }

  // the lime trees: trunks and round crowns
  const trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.7, 5).translate(0, 0.35, 0)
  const crownGeo = new THREE.IcosahedronGeometry(0.42, 1).scale(1, 1.1, 1).translate(0, 0.98, 0)
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#5b4632' }), trees.length)
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color()
  const greens = ['#6d8f45', '#7a9a4c', '#5f8240', '#86a456']
  trees.forEach((t, i) => {
    const p = W(t.u, t.v)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2)
    m.compose(new THREE.Vector3(p.x, top, p.z), q, new THREE.Vector3(t.s, t.s, t.s))
    trunks.setMatrixAt(i, m)
    crowns.setMatrixAt(i, m)
    crowns.setColorAt(i, col.set(greens[i % greens.length]).multiplyScalar(0.92 + r() * 0.16))
  })
  for (const im of [trunks, crowns]) {
    im.castShadow = true
    im.receiveShadow = true
  }

  // the barges: round the moat, along the river, up and down the canals
  const lanes: { pts: Pt[]; loop: boolean; n: number }[] = [
    { pts: square(19.5, 2.2), loop: true, n: 3 },
    { pts: river(2.9), loop: false, n: 2 },
    { pts: river(-2.9).reverse(), loop: false, n: 2 },
    { pts: [W(-Q, 11), W(Q, 11)], loop: false, n: 1 },
    { pts: [W(Q, -11), W(-Q, -11)], loop: false, n: 1 },
    { pts: [W(9.6, Q), W(9.6, 3.6)], loop: false, n: 1 },
    { pts: [W(-9.6, -Q), W(-9.6, -3.6)], loop: false, n: 1 },
  ]
  const boats: { lane: number; d: number; speed: number; dir: number }[] = []
  lanes.forEach((ln, li) => {
    for (let i = 0; i < ln.n; i++) boats.push({ lane: li, d: (i + r() * 0.5) / ln.n, speed: 0.55 + r() * 0.3, dir: 1 })
  })
  const laneLen = lanes.map((ln) => {
    let s = 0
    const pts = ln.loop ? [...ln.pts, ln.pts[0]] : ln.pts
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    return s
  })
  const barge = new THREE.InstancedMesh(boatGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), boats.length)
  barge.castShadow = true
  barge.frustumCulled = false
  const hulls = ['#3b3733', '#2f3b3f', '#5a3a2c', '#3d4a3a']
  boats.forEach((_, i) => barge.setColorAt(i, col.set(hulls[i % hulls.length]).lerp(new THREE.Color('#ffffff'), 0.55)))
  const along = (li: number, d: number) => {
    const ln = lanes[li]
    const pts = ln.loop ? [...ln.pts, ln.pts[0]] : ln.pts
    let s = d * laneLen[li]
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
      if (s <= l || i === pts.length - 1) {
        const f = Math.min(1, s / Math.max(l, 1e-6))
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * f, a: Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x) }
      }
      s -= l
    }
    return { x: pts[0].x, z: pts[0].z, a: 0 }
  }
  const placeBoats = () => {
    boats.forEach((bt, i) => {
      const p = along(bt.lane, bt.d)
      const a = bt.dir > 0 ? p.a : p.a + Math.PI
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
      m.compose(new THREE.Vector3(p.x, WATER + top, p.z), q, new THREE.Vector3(1, 1, 1))
      barge.setMatrixAt(i, m)
    })
    barge.instanceMatrix.needsUpdate = true
  }
  placeBoats()

  // the ground: a flat delta, the moat and river cut into it, fields in strips outside
  const plan = drawPlan(80, 1024, TH, { water: 0.25, weight: 9, height: 0.3 }, (p) => {
    const mean = (pts: number[][], w: number, ctx2: CanvasRenderingContext2D) => {
      ctx2.lineWidth = w
      ctx2.lineCap = 'round'
      ctx2.lineJoin = 'round'
      ctx2.beginPath()
      pts.forEach(([u, v], i) => (i ? ctx2.lineTo(u, v) : ctx2.moveTo(u, v)))
      ctx2.stroke()
    }
    const course = (side: 1 | -1) => Array.from({ length: 48 }, (_, i) => {
      const u = side * (MOAT - 1 + i * 1.4)
      return [u, Math.sin((Math.abs(u) - MOAT + 1) / 7.5) * 3.2 * side * Math.min(1, (Math.abs(u) - MOAT + 1) / 6)]
    })
    // pressed flat all round the city; the river runs out to the edge of the plan
    p.weight.fillStyle = '#fff'
    p.weight.beginPath()
    p.weight.arc(0, 0, 58, 0, Math.PI * 2)
    p.weight.fill()
    // the water: the lagoon inside the moat, the river either side
    for (const ctx2 of [p.water, p.height]) {
      const fill = ctx2 === p.water ? '#fff' : p.grey(BED)
      ctx2.fillStyle = fill
      ctx2.strokeStyle = fill
      ctx2.beginPath()
      // (water is allowed a little wider than the cut: the banks decide where it ends)
      const wide = ctx2 === p.water ? 1.5 : 0
      ctx2.roundRect(-MOAT - wide, -MOAT - wide, (MOAT + wide) * 2, (MOAT + wide) * 2, 2.4)
      ctx2.fill()
      mean(course(1), 7.6 + wide * 2, ctx2)
      mean(course(-1), 7.6 + wide * 2, ctx2)
    }
    // the fields: long strips between ditches, fading out toward the hills
    const pr = (() => {
      let s = 7
      return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    })()
    const crops = ['#8c9d50', '#9fa25a', '#7b9147', '#b0995c', '#6f8a45', '#a3a866', '#c0a86e']
    for (let u = -63; u < 63; u += 7) {
      let v = -63
      while (v < 63) {
        const h = 1.6 + pr() * 2.6
        const cu = u + 3.5, cv = v + h / 2
        const d = Math.max(Math.abs(cu), Math.abs(cv))
        if (d > MOAT + 1.2) {
          const fade = 1 - Math.min(1, Math.max(0, (Math.hypot(cu, cv) - 38) / 20))
          p.paint.globalAlpha = 0.6 * fade
          p.paint.fillStyle = crops[Math.floor(pr() * crops.length)]
          p.paint.fillRect(u + 0.12, v + 0.08, 6.76, h - 0.16)
          p.paint.globalAlpha = 0.45 * fade
          p.paint.fillStyle = '#3e5a55'
          p.paint.fillRect(u - 0.06, v, 0.18, h)
          p.paint.fillRect(u, v - 0.05, 7, 0.1)
        }
        v += h
      }
    }
    // the roads out of the gates
    p.paint.globalAlpha = 0.95
    p.paint.strokeStyle = '#c9b78f'
    p.paint.lineCap = 'butt'
    p.paint.lineWidth = 0.9
    for (const [a, c] of [[[0, MOAT], [0, 64]], [[0, -MOAT], [0, -64]], [[MOAT, 7], [64, 7]], [[-MOAT, -7], [-64, -7]]]) {
      p.paint.beginPath()
      p.paint.moveTo(a[0], a[1])
      p.paint.lineTo(c[0], c[1])
      p.paint.stroke()
    }
    // a band of grass along the banks
    p.paint.globalAlpha = 0.4
    p.paint.strokeStyle = '#7c9650'
    p.paint.lineWidth = 2
    p.paint.strokeRect(-MOAT - 1, -MOAT - 1, (MOAT + 1) * 2, (MOAT + 1) * 2)
    p.paint.globalAlpha = 1
  })

  plan.level = WATER
  let spin = 0
  return {
    objects: [group, trunks, crowns, barge, ...mills],
    mesa: 24,
    plan,
    pulse: { ...W(0, 0), sides: 4, rot: Math.PI / 4 - TH },
    route: (a, c) => {
      // along the streets, crossing on the bridges: out to a street, along it, and in
      const ga = G(a), gc = G(c)
      const near = (x: number, list: number[]) => list.reduce((p, q) => (Math.abs(q - x) < Math.abs(p - x) ? q : p))
      const va = near(ga.v, VS), vc = near(gc.v, VS)
      const us = near((ga.u + gc.u) / 2, US)
      return [a, W(ga.u, va), W(us, va), W(us, vc), W(gc.u, vc), c]
    },
    step: (dt, _t, still) => {
      if (still) return false
      spin += dt
      for (const h of mills) (h.children[0] as THREE.Mesh).rotation.z = spin * 0.55 + h.id
      boats.forEach((bt) => {
        const ln = lanes[bt.lane]
        bt.d += (bt.dir * dt * bt.speed * 0.6) / laneLen[bt.lane]
        if (ln.loop) bt.d = ((bt.d % 1) + 1) % 1
        else if (bt.d > 1 || bt.d < 0) {
          // river barges go on downstream and come back round; canal barges turn about
          if (bt.lane === 1 || bt.lane === 2) bt.d = ((bt.d % 1) + 1) % 1
          else {
            bt.dir *= -1
            bt.d = Math.min(1, Math.max(0, bt.d))
          }
        }
      })
      placeBoats()
      return true
    },
  }
}

// ── the parts ──

/** a canal house: narrow and tall, its gable to the water (the frame's second axis points at it) */
function canalHouse(b: Builder, f: { x: number; z: number; rot: number }, w: number, d: number, top: number, r: () => number, pick: <T>(a: T[]) => T) {
  b.at(top).tint(pick(WALLS), pick(ROOFS))
  const h = 0.8 + r() * 0.65
  const y = box(b, f, top, w, d, h)
  const kind = r()
  const gh = w * (1.9 + r() * 0.7)
  // the roof's ridge runs back from the water
  const fr = { ...f, rot: f.rot + Math.PI / 2 }
  const c = Math.cos(f.rot), s = Math.sin(f.rot)
  const P = (i: number, k: number, yy: number) => [f.x + (i * c - k * s), yy, f.z + (i * s + k * c)]
  if (kind < 0.3) {
    // a plain steep gable
    gable(b, fr, y, d, w, gh)
  } else if (kind < 0.62) {
    // a stepped gable: the roof behind, the front wall climbing in steps
    gable(b, fr, y, d * 0.98, w * 0.98, gh * 0.95)
    const steps = 3
    for (let j = 0; j < steps; j++) {
      const sw = w * (1 - (j + 0.5) / (steps + 0.6))
      const sy = y + (j * gh) / steps
      b.quad(P(-sw, d + 0.01, sy), P(sw, d + 0.01, sy), P(sw, d + 0.01, sy + gh / steps), P(-sw, d + 0.01, sy + gh / steps), 'wall')
      b.edge(P(-sw, d + 0.01, sy + gh / steps), P(sw, d + 0.01, sy + gh / steps))
    }
  } else if (kind < 0.85) {
    // a neck gable: a tall narrow front with shoulders, and a little pediment
    gable(b, fr, y, d * 0.98, w * 0.98, gh * 0.8)
    const nw = w * 0.45
    b.quad(P(-nw, d + 0.01, y), P(nw, d + 0.01, y), P(nw, d + 0.01, y + gh), P(-nw, d + 0.01, y + gh), 'wall')
    b.tri(P(-w, d + 0.01, y), P(-nw, d + 0.01, y), P(-nw, d + 0.01, y + gh * 0.5), 'wall')
    b.tri(P(w, d + 0.01, y), P(nw, d + 0.01, y), P(nw, d + 0.01, y + gh * 0.5), 'wall')
    b.tri(P(-nw - 0.04, d + 0.012, y + gh), P(nw + 0.04, d + 0.012, y + gh), P(0, d + 0.012, y + gh + 0.16), 'trim')
    b.edge(P(-nw, d + 0.01, y + gh), P(nw, d + 0.01, y + gh))
  } else {
    // a straight cornice, and a low roof behind it
    box(b, f, y, w * 1.04, d * 1.02, 0.08, { roof: 'trim', windows: false })
    pyramid(b, f, y + 0.08, w * 0.95, d * 0.95, 0.35)
  }
  // the hoist beam under the gable
  if (kind < 0.85) b.edge(P(0, d, y + gh * 0.55), P(0, d + 0.14, y + gh * 0.55))
}

/** an arched stone bridge from one bank to the other, along a street */
function bridge(b: Builder, a: [number, number], c: [number, number], top: number) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1])
  const du = (c[0] - a[0]) / len, dv = (c[1] - a[1]) / len
  const nu = -dv * 0.48, nv = du * 0.48
  const arches = len > 4 ? 3 : 1
  const rise = len > 4 ? 0.3 : 0.4
  const N = len > 4 ? 30 : 12
  b.at(WATER - 0.3).tint('#a39785', '#b7ab96')
  const deck = (t: number) => top + 0.03 + rise * Math.sin(Math.PI * t)
  const under = (t: number) => WATER + 0.05 + Math.max(0, (rise + 0.6) * Math.abs(Math.sin(Math.PI * arches * t))) * 0.95
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N
    const p0 = [a[0] + du * len * t0, a[1] + dv * len * t0], p1 = [a[0] + du * len * t1, a[1] + dv * len * t1]
    const L0 = V3(p0[0] + nu, p0[1] + nv, deck(t0)), R0 = V3(p0[0] - nu, p0[1] - nv, deck(t0))
    const L1 = V3(p1[0] + nu, p1[1] + nv, deck(t1)), R1 = V3(p1[0] - nu, p1[1] - nv, deck(t1))
    b.quad(L0, L1, R1, R0, 'roof')
    // the sides, down to the curve of the arches
    const ul0 = Math.min(deck(t0) - 0.12, under(t0)), ul1 = Math.min(deck(t1) - 0.12, under(t1))
    for (const [s0, s1] of [[L0, L1], [R0, R1]]) {
      b.quad([s0[0], ul0, s0[2]], [s1[0], ul1, s1[2]], s1, s0, 'wall')
      // the parapet
      b.edge([s0[0], s0[1] + 0.14, s0[2]], [s1[0], s1[1] + 0.14, s1[2]])
    }
    b.quad([L0[0], ul0, L0[2]], [L1[0], ul1, L1[2]], [R1[0], ul1, R1[2]], [R0[0], ul0, R0[2]], 'wall')
    b.edge(L0, L1)
    b.edge(R0, R1)
  }
}

/** a tapering tower: a windmill's body */
function frustum(b: Builder, x: number, z: number, y: number, r0: number, r1: number, h: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
    const A = [x + Math.cos(a0) * r0, y, z + Math.sin(a0) * r0], B = [x + Math.cos(a1) * r0, y, z + Math.sin(a1) * r0]
    const C = [x + Math.cos(a1) * r1, y + h, z + Math.sin(a1) * r1], D = [x + Math.cos(a0) * r1, y + h, z + Math.sin(a0) * r1]
    b.quad(A, B, C, D, 'wall')
    if (i % 2 === 0) b.edge(A, D)
    b.edge(D, C)
  }
  // a door and a gallery round the middle
  b.window([x + Math.cos(TH + Math.PI) * (r0 + 0.01), y + 0.3, z + Math.sin(TH + Math.PI) * (r0 + 0.01)], [-Math.sin(TH + Math.PI), 0, Math.cos(TH + Math.PI)], 0.12, 0.28)
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2
    const rr = (r0 + r1) / 2 + 0.28, yy = y + h * 0.45
    b.edge([x + Math.cos(a0) * rr, yy, z + Math.sin(a0) * rr], [x + Math.cos(a1) * rr, yy, z + Math.sin(a1) * rr])
  }
}

/** a stack of crates on a quay */
function crate(b: Builder, u: number, v: number, top: number, r: () => number) {
  for (let i = 0; i < 3; i++) {
    const f = F(u + (r() - 0.5) * 0.6, v + (r() - 0.5) * 0.6)
    b.at(top)
    box(b, { ...f, rot: f.rot + r() * 0.3 }, top, 0.16, 0.16, 0.26, { roof: 'wood', windows: false })
  }
}

/** four sails on a cross: a lattice of spars, canvas over most of it */
function sailGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.PlaneGeometry(0.42, 1.7).translate(0.25, 1.05, 0)
    const spar = new THREE.BoxGeometry(0.06, 2.1, 0.05).translate(0, 1.05, 0)
    for (const g of [blade, spar]) {
      g.rotateZ((i * Math.PI) / 2)
      parts.push(g.index ? g.toNonIndexed() : g)
    }
  }
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

/** a barge: a long low hull with a pointed bow, and a small cabin aft */
function boatGeometry() {
  const s = new THREE.Shape()
  s.moveTo(-0.55, -0.17)
  s.lineTo(0.3, -0.17)
  s.quadraticCurveTo(0.55, -0.12, 0.62, 0)
  s.quadraticCurveTo(0.55, 0.12, 0.3, 0.17)
  s.lineTo(-0.55, 0.17)
  s.closePath()
  const hull = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.04, 0)
  const cabin = new THREE.BoxGeometry(0.3, 0.16, 0.24).translate(-0.3, 0.2, 0)
  const tint = (g: THREE.BufferGeometry, hex: string) => {
    const n = g.getAttribute('position').count
    const c = new THREE.Color(hex)
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3))
    return g.index ? g.toNonIndexed() : g
  }
  const parts = [tint(hull, '#6a5d52'), tint(cabin, '#efe6d4')]
  for (const p of parts) p.deleteAttribute('uv')
  const g = mergeGeometries(parts)
  g.computeVertexNormals()
  return g
}

/** stretches of a line between the street crossings */
function split(a: number, c: number, cuts: number[], half: number): [number, number][] {
  const out: [number, number][] = []
  let s = a
  for (const x of [...cuts].sort((p, q) => p - q)) {
    if (x - half > s + 0.4) out.push([s, x - half])
    s = x + half
  }
  if (c > s + 0.4) out.push([s, c])
  return out
}

/** a square with rounded corners, as points round it */
function square(h: number, rc: number): Pt[] {
  const out: Pt[] = []
  for (const [cu, cv, a0] of [[h - rc, h - rc, 0], [-(h - rc), h - rc, Math.PI / 2], [-(h - rc), -(h - rc), Math.PI], [h - rc, -(h - rc), (Math.PI * 3) / 2]])
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2)
      out.push(W(cu + Math.cos(a) * rc, cv + Math.sin(a) * rc))
    }
  return out
}

/** a lane down the river, following its bends beyond the walls */
function river(off: number): Pt[] {
  const pts: Pt[] = []
  for (let u = -80; u <= 80; u += 2) {
    const a = Math.abs(u)
    const bend = a > MOAT - 1 ? Math.sin((a - MOAT + 1) / 7.5) * 3.2 * Math.sign(u) * Math.min(1, (a - MOAT + 1) / 6) : 0
    pts.push(W(u, bend + off * (a > MOAT ? 0.7 : 1)))
  }
  return pts
}
