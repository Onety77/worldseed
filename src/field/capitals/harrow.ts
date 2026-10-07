import * as THREE from 'three'
import { Builder, box, cone, cylinder, dish, dome, strut, taper } from '../kit'
import { type Capital, type CapitalCtx, type Pt } from '../capital'

/*
  Harrow: a town of forecasters who keep score in public.

  A gas giant has nothing to stand on, so its capital floats: three ring decks one inside
  the next, joined by six spokes, hanging over the cloud bands with open air between them.
  Everything here watches something.

  - in the middle, the great observatory: its dome and telescope are the governor's, and
    when a proof is published the rings' edge lights run outward, one ring after the next;
  - the assembly sits in a tally hall facing a scoreboard, one bar for each live proposal,
    filled as far as its support;
  - the treasury is a sealed sphere, lit round its middle as far as the runway reaches;
  - the market is a row of kiosks under ticker boards, one for each open job;
  - each app keeps an instrument: a great refractor, a radio dish, an armillary sphere,
    a slit dome;
  - forecast boards stand round the rings, their bars shifting as the odds move;
  - people live in white pods and grow food under glass; the spaceport is a pier off the
    outer ring. Little cars run round the middle ring.
*/

const HUB = 4.2
const RINGS = [
  { r0: 7.0, r1: 10.0 },
  { r0: 13.0, r1: 16.0 },
  { r0: 19.5, r1: 21.8 },
]
const WALK = RINGS.map((g) => (g.r0 + g.r1) / 2)
const SPOKES = Array.from({ length: 6 }, (_, k) => (k * Math.PI) / 3 + 0.26)
const PORT = SPOKES[3] + Math.PI / 6
const DECK = 0.4

const polar = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d })
const V = (a: number, d: number, y: number) => [Math.cos(a) * d, y, Math.sin(a) * d]
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
/** which deck a distance from the middle is on: the hub, or ring 1, 2, 3 */
const deckOf = (r: number) => (r < 5.6 ? 0 : r < 11.5 ? 1 : r < 17.75 ? 2 : 3)

const WHITE = ['#f3f4f6', '#e8ebf0', '#f6f6f4', '#dfe4ec']
const BLUE = '#4b5e97'
const STEEL = '#9aa3b9'

export function harrow(ctx: CapitalCtx): Capital {
  const { input, r, top } = ctx
  const b = new Builder(r, 'prediction')
  b.lit = 0.5 + input.lit * 0.4
  const y0 = top
  const taken: { a: number; r: number; w: number }[] = []
  const nearSpoke = (a: number, rr: number, w: number) => SPOKES.some((s) => Math.abs(wrap(s - a)) * rr < 0.9 + w) || Math.abs(wrap(PORT - a)) * rr < (rr > 18 ? 1.1 + w : 0)
  const free = (a: number, rr: number, w: number) => !nearSpoke(a, rr, w) && !taken.some((t) => Math.abs(t.r - rr) < 1.4 && Math.abs(wrap(t.a - a)) * rr < t.w + w)
  const places: { key: string; kind: Parameters<CapitalCtx['place']>[1]; x: number; z: number; y: number }[] = []

  // ── the decks: the hub and three rings, thin slabs with lit edges and trusses beneath ──
  const slab = (r0: number, r1: number, n: number) => {
    b.at(y0 - DECK).tint(STEEL, '#e3e6ec')
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
      b.quad(V(a0, r0, y0), V(a1, r0, y0), V(a1, r1, y0), V(a0, r1, y0), 'roof')
      b.quad(V(a0, r0, y0 - DECK), V(a1, r0, y0 - DECK), V(a1, r1, y0 - DECK), V(a0, r1, y0 - DECK), 'wall')
      b.quad(V(a0, r1, y0 - DECK), V(a1, r1, y0 - DECK), V(a1, r1, y0), V(a0, r1, y0), 'wall')
      if (r0 > 0) b.quad(V(a0, r0, y0 - DECK), V(a1, r0, y0 - DECK), V(a1, r0, y0), V(a0, r0, y0), 'wall')
      b.edge(V(a0, r1, y0), V(a1, r1, y0))
      if (r0 > 0) b.edge(V(a0, r0, y0), V(a1, r0, y0))
      // a rail round the outer edge
      b.edge(V(a0, r1 - 0.06, y0 + 0.32), V(a1, r1 - 0.06, y0 + 0.32))
      if (i % 2 === 0) b.edge(V(a0, r1 - 0.06, y0), V(a0, r1 - 0.06, y0 + 0.32))
      // trusses beneath, down to a keel
      if (i % 4 === 0) {
        const rm = (r0 + r1) / 2
        b.edge(V(a0, r0 || 0.6, y0 - DECK), V(a0, rm, y0 - DECK - 1.1))
        b.edge(V(a0, r1, y0 - DECK), V(a0, rm, y0 - DECK - 1.1))
      }
      b.edge(V(a0, (r0 + r1) / 2, y0 - DECK - 1.1), V(a1, (r0 + r1) / 2, y0 - DECK - 1.1))
    }
  }
  slab(0, HUB, 40)
  for (const g of RINGS) slab(g.r0, g.r1, Math.round(g.r1 * 7))
  // the hub's keel: a long mast hanging into the clouds, with a light at its tip
  b.at(y0 - 9).tint(STEEL)
  taper(b, 0, 0, y0 - 5.5, 0.15, 1.4, 5.1, 'wall')
  b.edge([0, y0 - 5.5, 0], [0, y0 - 11, 0])
  b.tri([-0.1, y0 - 11, 0], [0.1, y0 - 11, 0], [0, y0 - 11.25, 0], 'lamp', 1)

  // ── the spokes: covered walkways from the hub out to each ring ──
  for (const s of SPOKES) {
    for (const [ra, rb] of [[HUB - 0.2, RINGS[0].r0 + 0.2], [RINGS[0].r1 - 0.2, RINGS[1].r0 + 0.2], [RINGS[1].r1 - 0.2, RINGS[2].r0 + 0.2]]) {
      const t = [-Math.sin(s), Math.cos(s)]
      const P = (d: number, side: number, y: number) => [Math.cos(s) * d + t[0] * side, y, Math.sin(s) * d + t[1] * side]
      b.at(y0 - 0.3).tint(STEEL, '#d7dce5')
      b.quad(P(ra, -0.55, y0 - 0.02), P(rb, -0.55, y0 - 0.02), P(rb, 0.55, y0 - 0.02), P(ra, 0.55, y0 - 0.02), 'roof')
      b.quad(P(ra, -0.55, y0 - 0.28), P(rb, -0.55, y0 - 0.28), P(rb, 0.55, y0 - 0.28), P(ra, 0.55, y0 - 0.28), 'wall')
      for (const sd of [-0.55, 0.55]) {
        b.quad(P(ra, sd, y0 - 0.28), P(rb, sd, y0 - 0.28), P(rb, sd, y0 - 0.02), P(ra, sd, y0 - 0.02), 'wall')
        b.edge(P(ra, sd, y0 + 0.3), P(rb, sd, y0 + 0.3))
      }
      // a glass arch over the walkway, ribbed
      for (let d = ra + 0.4; d < rb; d += 0.7) {
        const N = 6
        for (let k = 0; k < N; k++) {
          const q0 = (k / N) * Math.PI, q1 = ((k + 1) / N) * Math.PI
          b.edge(P(d, Math.cos(q0) * 0.55, y0 + Math.sin(q0) * 0.6), P(d, Math.cos(q1) * 0.55, y0 + Math.sin(q1) * 0.6))
        }
      }
      b.edge(P(ra, 0, y0 + 0.6), P(rb, 0, y0 + 0.6))
    }
  }

  // ── the observatory in the middle: the governor's ──
  {
    const f = { x: 0, z: 0, rot: 0 }
    b.at(y0).tint('#eef0f4', BLUE)
    let y = cylinder(b, f, y0, 2.9, 0.22, 24, 'trim')
    y = cylinder(b, f, y, 2.35, 1.35, 20, 'wall', true)
    y = cylinder(b, f, y, 2.5, 0.12, 20, 'trim')
    dome(b, f, y, 2.35, 'roof')
    // the telescope, out through the slit
    const a = 0.0
    const base = [0, y + 0.9, 0], tip = [Math.cos(a) * 2.9, y + 3.0, Math.sin(a) * 2.9]
    b.tint('#d9dde6')
    strut(b, base, tip, 0.2, 'wall')
    strut(b, tip, [tip[0] + Math.cos(a) * 0.35, tip[1] + 0.25, tip[2] + Math.sin(a) * 0.35], 0.24, 'trim')
    // a weather mast on the drum
    const m = polar(2.0, 2.0)
    strut(b, [m.x, y0, m.z], [m.x, y + 3.6, m.z], 0.05, 'wall')
    for (let k = 0; k < 3; k++) {
      const q = (k / 3) * Math.PI * 2
      b.edge([m.x, y + 3.6, m.z], [m.x + Math.cos(q) * 0.35, y + 3.6, m.z + Math.sin(q) * 0.35])
      b.tri([m.x + Math.cos(q) * 0.35, y + 3.6, m.z + Math.sin(q) * 0.35], [m.x + Math.cos(q) * 0.35, y + 3.45, m.z + Math.sin(q) * 0.35], [m.x + Math.cos(q + 0.4) * 0.3, y + 3.52, m.z + Math.sin(q + 0.4) * 0.3], 'brand', 1)
    }
    places.push({ key: 'tower', kind: 'tower', x: 0, z: 0, y: y + 2.6 })
  }

  // ── ring 1: the tally hall and its scoreboard, the treasury sphere, the market kiosks ──
  const a1 = (k: number) => SPOKES[k] + Math.PI / 6
  {
    // the tally hall: tiers of seats in an arc, facing the board across the deck
    const a = a1(1), rr = WALK[0]
    const c = polar(a, rr)
    const face = a + Math.PI / 2 // the board stands along the ring, the seats look at it
    const t = [Math.cos(face), Math.sin(face)], n = [Math.cos(a), Math.sin(a)]
    const P = (u: number, v: number, y: number) => [c.x + t[0] * u + n[0] * v, y, c.z + t[1] * u + n[1] * v]
    b.at(y0).tint('#e8ebf0', '#cfd5e0')
    for (let k = 0; k < 3; k++) {
      const N = 10, R = 1.0 + k * 0.45, h = 0.16 * (k + 1)
      for (let i = 0; i < N; i++) {
        const q0 = Math.PI * (0.15 + (0.7 * i) / N), q1 = Math.PI * (0.15 + (0.7 * (i + 1)) / N)
        const S = (q: number, rr2: number, yy: number) => P(Math.cos(q) * rr2 - 0.6, Math.sin(q) * rr2 * 0.8, yy)
        b.quad(S(q0, R, y0 + h), S(q1, R, y0 + h), S(q1, R + 0.45, y0 + h), S(q0, R + 0.45, y0 + h), 'roof')
        b.quad(S(q0, R, y0), S(q1, R, y0), S(q1, R, y0 + h), S(q0, R, y0 + h), 'wall')
        b.edge(S(q0, R, y0 + h), S(q1, R, y0 + h))
      }
    }
    // the board: a frame, and a bar per proposal
    const bu = -0.6, bv = -0.9
    b.tint('#3b4466', '#2a3150')
    const fy = y0 + 0.5, W = 1.5, Hh = 1.6
    b.quad(P(bu - W, bv, fy), P(bu + W, bv, fy), P(bu + W, bv, fy + Hh), P(bu - W, bv, fy + Hh), 'wall')
    for (const u of [bu - W, bu + W]) strut(b, P(u, bv, y0), P(u, bv, fy + Hh + 0.1), 0.05, 'roof')
    const props = input.proposals.slice(0, 6)
    const nb = Math.max(1, props.length)
    props.forEach((pr, i) => {
      const u0 = bu - W + 0.2 + (i * (2 * W - 0.4)) / nb, u1 = u0 + (2 * W - 0.4) / nb - 0.12
      const fill = Math.min(1, Math.max(0.04, pr.support))
      const yb = fy + 0.15, yt = fy + 0.15 + (Hh - 0.3) * fill
      b.quad(P(u0, bv + 0.02, yb), P(u1, bv + 0.02, yb), P(u1, bv + 0.02, yt), P(u0, bv + 0.02, yt), 'brand')
      b.quad(P(u0, bv + 0.02, yt), P(u1, bv + 0.02, yt), P(u1, bv + 0.02, fy + Hh - 0.15), P(u0, bv + 0.02, fy + Hh - 0.15), 'canvas')
    })
    if (!props.length) b.quad(P(bu - W + 0.2, bv + 0.02, fy + 0.15), P(bu + W - 0.2, bv + 0.02, fy + 0.15), P(bu + W - 0.2, bv + 0.02, fy + 0.25), P(bu - W + 0.2, bv + 0.02, fy + 0.25), 'canvas')
    taken.push({ a, r: rr, w: 2.4 })
    const tag = P(bu, bv, fy + Hh + 0.3)
    places.push({ key: 'hall', kind: 'hall', x: tag[0], z: tag[2], y: tag[1] })
  }
  {
    // the treasury: a sealed sphere on four legs, lit round its middle as far as the runway goes
    const a = a1(3), rr = WALK[0]
    const c = polar(a, rr)
    const R = 1.15, cy = y0 + 0.9 + R
    b.at(y0).tint('#e9ecf2', '#d3d9e4')
    for (let k = 0; k < 4; k++) {
      const q = (k / 4) * Math.PI * 2 + 0.4
      strut(b, [c.x + Math.cos(q) * 1.1, y0, c.z + Math.sin(q) * 1.1], [c.x + Math.cos(q) * 0.6, cy - 0.3, c.z + Math.sin(q) * 0.6], 0.06, 'wall')
    }
    dome(b, { ...c, rot: 0 }, cy, R, 'roof')
    dome(b, { ...c, rot: 0 }, cy, -R, 'roof')
    const fill = Math.min(1, Math.max(0.06, input.runway / 24))
    const N = 24
    for (let i = 0; i < N; i++) {
      if (i / N >= fill) break
      const q0 = (i / N) * Math.PI * 2 + a, q1 = ((i + 0.85) / N) * Math.PI * 2 + a
      const A = [c.x + Math.cos(q0) * (R + 0.02), cy - 0.12, c.z + Math.sin(q0) * (R + 0.02)], B = [c.x + Math.cos(q1) * (R + 0.02), cy - 0.12, c.z + Math.sin(q1) * (R + 0.02)]
      b.tri(A, B, [B[0], cy + 0.12, B[2]], 'lamp', 1)
      b.tri(A, [B[0], cy + 0.12, B[2]], [A[0], cy + 0.12, A[2]], 'lamp', 1)
    }
    cylinder(b, { ...c, rot: 0 }, cy - 0.16, R + 0.06, 0.04, 24, 'trim')
    taken.push({ a, r: rr, w: 1.6 })
    places.push({ key: 'vault', kind: 'vault', x: c.x, z: c.z, y: cy + R + 0.2 })
  }
  {
    // the market: kiosks along the ring, each under a little ticker board
    const a = a1(5), rr = WALK[0]
    const n = Math.max(2, Math.min(7, input.jobs.length))
    for (let i = 0; i < n; i++) {
      const q = a + ((i - (n - 1) / 2) * 0.95) / rr
      for (const side of [-1, 1]) {
        if (side > 0 && i % 2) continue
        const p = polar(q, rr + side * 0.75)
        const f = { ...p, rot: q + Math.PI / 2 }
        b.at(y0).tint(WHITE[i % WHITE.length], BLUE)
        const ky = box(b, f, y0, 0.28, 0.22, 0.4, { roof: 'roof', windows: false })
        const tb = polar(q, rr + side * 0.98)
        strut(b, [tb.x, ky, tb.z], [tb.x, ky + 0.55, tb.z], 0.015, 'wall')
        const t = [-Math.sin(q), Math.cos(q)]
        const Bp = (u: number, yy: number) => [tb.x + t[0] * u, yy, tb.z + t[1] * u]
        b.quad(Bp(-0.26, ky + 0.42), Bp(0.26, ky + 0.42), Bp(0.26, ky + 0.66), Bp(-0.26, ky + 0.66), i % 3 === 0 ? 'brand' : 'canvas')
      }
    }
    taken.push({ a, r: rr, w: (n * 0.95) / 2 + 0.4 })
    const p = polar(a, rr)
    places.push({ key: 'market', kind: 'market', x: p.x, z: p.z, y: y0 + 1.3 })
  }

  // ── ring 2: an instrument for each app ──
  const APPS = [a1(0) + 0.12, a1(2) - 0.1, a1(4) + 0.1, a1(1) + 0.55]
  input.apps.forEach((app, i) => {
    const a = APPS[i % APPS.length], rr = WALK[1]
    const c = polar(a, rr)
    const out = [Math.cos(a), Math.sin(a)]
    let peak = y0 + 2
    // a little lab beside it, with the world's green band on it
    const lab = { ...polar(a + 0.12, rr + 0.9), rot: a + Math.PI / 2 }
    b.at(y0).tint(WHITE[(i + 1) % WHITE.length], BLUE)
    const ly = box(b, lab, y0, 0.55, 0.38, 0.75)
    box(b, lab, ly, 0.58, 0.4, 0.06, { roof: 'roof', windows: false })
    const t = [-Math.sin(a + 0.12), Math.cos(a + 0.12)]
    const lp = polar(a + 0.12, rr + 0.9 - 0.39)
    b.quad([lp.x - t[0] * 0.4, ly - 0.3, lp.z - t[1] * 0.4], [lp.x + t[0] * 0.4, ly - 0.3, lp.z + t[1] * 0.4], [lp.x + t[0] * 0.4, ly - 0.18, lp.z + t[1] * 0.4], [lp.x - t[0] * 0.4, ly - 0.18, lp.z - t[1] * 0.4], 'brand')
    b.at(y0).tint('#e3e7ee', BLUE)
    if (i % 4 === 0) {
      // the great refractor on its mount
      cylinder(b, { ...c, rot: 0 }, y0, 0.6, 0.25, 12, 'trim')
      strut(b, [c.x, y0 + 0.25, c.z], [c.x, y0 + 1.2, c.z], 0.12, 'wall')
      const base = [c.x - out[0] * 1.2, y0 + 0.7, c.z - out[1] * 1.2], tip = [c.x + out[0] * 1.5, y0 + 2.6, c.z + out[1] * 1.5]
      strut(b, base, tip, 0.17, 'roof')
      strut(b, tip, [tip[0] + out[0] * 0.2, tip[1] + 0.14, tip[2] + out[1] * 0.2], 0.21, 'trim')
      peak = y0 + 2.8
    } else if (i % 4 === 1) {
      // a radio dish looking up and out
      cylinder(b, { ...c, rot: 0 }, y0, 0.55, 0.3, 10, 'trim')
      strut(b, [c.x, y0 + 0.3, c.z], [c.x, y0 + 1.3, c.z], 0.1, 'wall')
      dish(b, [c.x, y0 + 1.5, c.z], [out[0] * 0.6, 1, out[1] * 0.6], 1.1)
      peak = y0 + 2.6
    } else if (i % 4 === 2) {
      // an armillary sphere: rings within rings on a pillar
      taper(b, c.x, c.z, y0, 0.4, 0.18, 1.0, 'wall')
      const cy = y0 + 1.8, R = 0.75
      const ring = (ax: number[], ay: number[], rr2: number) => {
        for (let k = 0; k < 24; k++) {
          const q0 = (k / 24) * Math.PI * 2, q1 = ((k + 1) / 24) * Math.PI * 2
          const p0 = [c.x + (ax[0] * Math.cos(q0) + ay[0] * Math.sin(q0)) * rr2, cy + (ax[1] * Math.cos(q0) + ay[1] * Math.sin(q0)) * rr2, c.z + (ax[2] * Math.cos(q0) + ay[2] * Math.sin(q0)) * rr2]
          const p1 = [c.x + (ax[0] * Math.cos(q1) + ay[0] * Math.sin(q1)) * rr2, cy + (ax[1] * Math.cos(q1) + ay[1] * Math.sin(q1)) * rr2, c.z + (ax[2] * Math.cos(q1) + ay[2] * Math.sin(q1)) * rr2]
          strut(b, p0, p1, 0.025, k % 6 === 0 ? 'brand' : 'trim')
        }
      }
      ring([1, 0, 0], [0, 0, 1], R)
      ring([1, 0, 0], [0, 1, 0], R)
      ring([0, 0, 1], [0, 1, 0], R)
      ring([0.7, 0.7, 0], [0, 0, 1], R * 0.85)
      strut(b, [c.x, cy - 0.9, c.z], [c.x, cy + 0.9, c.z], 0.02, 'wall')
      peak = cy + R + 0.3
    } else {
      // a slit dome on a drum
      const y = cylinder(b, { ...c, rot: 0 }, y0, 0.95, 0.9, 14, 'wall', true)
      dome(b, { ...c, rot: 0 }, y, 0.95, 'roof')
      peak = y + 1.1
    }
    taken.push({ a, r: rr, w: 1.7 }, { a: a + 0.12, r: rr + 0.9, w: 0.7 })
    places.push({ key: app.key, kind: 'app', x: c.x, z: c.z, y: peak })
  })

  // ── the spaceport: a pier off the outer ring, the pad at its end ──
  {
    const a = PORT
    const t = [-Math.sin(a), Math.cos(a)]
    const P = (d: number, side: number, y: number) => [Math.cos(a) * d + t[0] * side, y, Math.sin(a) * d + t[1] * side]
    b.at(y0 - DECK).tint(STEEL, '#d7dce5')
    b.quad(P(21.6, -0.6, y0), P(25.4, -0.6, y0), P(25.4, 0.6, y0), P(21.6, 0.6, y0), 'roof')
    b.quad(P(21.6, -0.6, y0 - DECK), P(25.4, -0.6, y0 - DECK), P(25.4, 0.6, y0 - DECK), P(21.6, 0.6, y0 - DECK), 'wall')
    for (const sd of [-0.6, 0.6]) b.edge(P(21.6, sd, y0 + 0.3), P(25.4, sd, y0 + 0.3))
    const p = polar(a, 27.2)
    const pad = cylinder(b, { ...p, rot: 0 }, y0 - DECK, 2.0, DECK + 0.02, 28, 'roof')
    for (let i = 0; i < 32; i++) {
      const q0 = (i / 32) * Math.PI * 2, q1 = ((i + 1) / 32) * Math.PI * 2
      b.edge([p.x + Math.cos(q0) * 1.4, pad + 0.005, p.z + Math.sin(q0) * 1.4], [p.x + Math.cos(q1) * 1.4, pad + 0.005, p.z + Math.sin(q1) * 1.4])
      if (i % 4 === 0) b.tri([p.x + Math.cos(q0) * 1.95, pad + 0.01, p.z + Math.sin(q0) * 1.95], [p.x + Math.cos(q0 + 0.05) * 1.95, pad + 0.01, p.z + Math.sin(q0 + 0.05) * 1.95], [p.x + Math.cos(q0) * 1.8, pad + 0.01, p.z + Math.sin(q0) * 1.8], 'lamp', 1)
    }
    b.at(pad).tint('#f1f2f5')
    let sy = cylinder(b, { ...p, rot: 0 }, pad, 0.34, 2.0, 12, 'wall', true)
    sy = cylinder(b, { ...p, rot: 0 }, sy, 0.36, 0.1, 12, 'trim')
    for (let i = 0; i < 12; i++) {
      const q0 = (i / 12) * Math.PI * 2, q1 = ((i + 1) / 12) * Math.PI * 2
      b.tri([p.x + Math.cos(q0) * 0.34, sy, p.z + Math.sin(q0) * 0.34], [p.x + Math.cos(q1) * 0.34, sy, p.z + Math.sin(q1) * 0.34], [p.x, sy + 0.85, p.z], 'brand')
    }
    for (let i = 0; i < 3; i++) {
      const q = (i / 3) * Math.PI * 2 + 0.3
      b.tri([p.x + Math.cos(q) * 0.32, pad + 0.65, p.z + Math.sin(q) * 0.32], [p.x + Math.cos(q) * 0.78, pad, p.z + Math.sin(q) * 0.78], [p.x + Math.cos(q) * 0.32, pad, p.z + Math.sin(q) * 0.32], 'roof')
    }
    places.push({ key: 'port', kind: 'port', x: p.x, z: p.z, y: sy + 0.85 })
  }

  // ── forecast boards round the rings (their bars move; see below) ──
  const boards: { c: number[]; t: number[]; n: number[] }[] = []
  for (const [k, ring] of [[0, 1], [2, 1], [4, 1], [1, 2], [3, 2], [5, 2]] as const) {
    const a = SPOKES[k] + Math.PI / 6 + (ring === 2 ? 0.3 : -0.55)
    const rr = WALK[ring] + (ring === 2 ? 0.75 : 0.95)
    if (!free(a, rr, 0.8)) continue
    const c = polar(a, rr)
    const t = [-Math.sin(a), Math.cos(a)], n = [Math.cos(a), Math.sin(a)]
    b.at(y0).tint('#3b4466', '#2a3150')
    const P = (u: number, yy: number) => [c.x + t[0] * u, yy, c.z + t[1] * u]
    b.quad(P(-0.75, y0 + 0.9), P(0.75, y0 + 0.9), P(0.75, y0 + 2.0), P(-0.75, y0 + 2.0), 'wall')
    for (const u of [-0.75, 0.75]) strut(b, P(u, y0), P(u, y0 + 2.05), 0.035, 'roof')
    taken.push({ a, r: rr, w: 0.9 })
    boards.push({ c: [c.x, y0 + 0.98, c.z], t, n })
  }

  // ── pods and glasshouses fill the rings ──
  for (const [gi, g] of RINGS.entries()) {
    const rows = gi === 0 ? [g.r1 - 0.55] : [g.r0 + 0.6, g.r1 - 0.6]
    for (const [ri, rr] of rows.entries()) {
      for (let a = r() * 0.4; a < Math.PI * 2; ) {
        const glass = r() < 0.09
        const w = glass ? 0.55 : 0.28 + r() * 0.12
        const am = a + w / rr
        if (!free(am, rr, w)) {
          a += 0.25 / rr
          continue
        }
        if (r() < 0.22) {
          a += (w * 2 + 0.5) / rr
          continue
        }
        const p = polar(am, rr)
        const f = { ...p, rot: am + Math.PI / 2 + (ri ? 0 : Math.PI) }
        if (glass) {
          // a glasshouse: a low drum and a glass dome, lit from within at night
          b.at(y0).tint('#e3e7ee', '#b9d6cf')
          const y = cylinder(b, { ...p, rot: 0 }, y0, w, 0.2, 12, 'trim')
          glassDome(b, p.x, p.z, y, w * 0.95)
        } else {
          b.at(y0).tint(WHITE[Math.floor(r() * WHITE.length)], r() < 0.3 ? BLUE : '#d3d9e4')
          const h = 0.4 + r() * 0.35
          const y = box(b, f, y0, w, 0.32, h, { roof: 'roof' })
          if (r() < 0.45) dome(b, { ...p, rot: 0 }, y, Math.min(w, 0.32) * 0.9, 'roof')
          else if (r() < 0.3) cone(b, p.x, p.z, y, 0.08, 0.5, 'trim')
        }
        a += (w * 2 + 0.12) / rr
      }
    }
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
  for (const p of places) ctx.place(p.key, p.kind, p.x, p.y, p.z)

  // the forecast boards' bars, which move as the odds do
  const BARS = 5
  const odds = boards.flatMap(() => Array.from({ length: BARS }, () => 0.2 + r() * 0.7))
  const drift = odds.map(() => (r() - 0.5) * 0.2)
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#c4ef3a', toneMapped: false }), Math.max(1, boards.length * BARS))
  bars.frustumCulled = false
  const m = new THREE.Matrix4(), q = new THREE.Quaternion()
  const placeBars = () => {
    boards.forEach((bd, bi) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(bd.t[1], bd.t[0]))
      for (let k = 0; k < BARS; k++) {
        const u = -0.6 + (k + 0.5) * (1.2 / BARS)
        const h = 0.9 * odds[bi * BARS + k]
        m.compose(new THREE.Vector3(bd.c[0] + bd.t[0] * u + bd.n[0] * 0.03, bd.c[1], bd.c[2] + bd.t[1] * u + bd.n[1] * 0.03), q, new THREE.Vector3(0.17, h, 0.02))
        bars.setMatrixAt(bi * BARS + k, m)
      }
    })
    bars.count = boards.length * BARS
    bars.instanceMatrix.needsUpdate = true
  }
  placeBars()

  // the edge lights round each ring: dim all night, and running outward with each proof
  const rails = [HUB, ...RINGS.map((g) => g.r1)].map((R) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(R - 0.03, R + 0.05, Math.round(R * 14)), new THREE.MeshBasicMaterial({ color: '#c4ef3a', toneMapped: false, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = y0 + 0.012
    return mesh
  })

  // little cars round the middle ring
  const cars = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.5, 3, 8).rotateZ(Math.PI / 2).translate(0, 0.2, 0), new THREE.MeshLambertMaterial({ color: '#eef0f4' }), 3)
  cars.castShadow = true
  cars.frustumCulled = false
  const carD = [0, 0.33, 0.66]
  const placeCars = () => {
    carD.forEach((d, i) => {
      const a = d * Math.PI * 2
      const p = polar(a, WALK[1])
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2)
      m.compose(new THREE.Vector3(p.x, y0, p.z), q, new THREE.Vector3(1, 1, 1))
      cars.setMatrixAt(i, m)
    })
    cars.instanceMatrix.needsUpdate = true
  }
  placeCars()

  let night = 0
  let wave = -1
  const walkPt = (a: number, d: number): Pt => ({ ...polar(a, d === 0 ? 3.4 : WALK[d - 1]), y: y0 })
  const arc = (a0: number, a1: number, d: number) => {
    const dd = wrap(a1 - a0)
    const R = d === 0 ? 3.4 : WALK[d - 1]
    const n = Math.max(1, Math.ceil((Math.abs(dd) * R) / 1.2))
    return Array.from({ length: n + 1 }, (_, k) => walkPt(a0 + (dd * k) / n, d))
  }
  return {
    objects: [group, bars, cars, ...rails],
    mesa: 20,
    pulse: { x: 0, z: 0, sides: 96, rot: 0 },
    route: (a, c) => {
      const ra = Math.hypot(a.x, a.z), rc = Math.hypot(c.x, c.z)
      const da = deckOf(ra), dc = deckOf(rc)
      const aa = Math.atan2(a.z, a.x), ac = Math.atan2(c.z, c.x)
      const pts: Pt[] = [{ ...a, y: y0 }]
      if (da === dc) pts.push(...arc(aa, ac, da))
      else {
        // along a spoke: the one nearest where we start
        const s = SPOKES.reduce((p, x) => (Math.abs(wrap(x - aa)) < Math.abs(wrap(p - aa)) ? x : p))
        pts.push(...arc(aa, s, da))
        const step = da < dc ? 1 : -1
        for (let d = da + step; d !== dc + step; d += step) pts.push(walkPt(s, d))
        pts.push(...arc(s, ac, dc))
      }
      pts.push({ ...c, y: y0 })
      return pts
    },
    flash: () => {
      wave = 0
    },
    setNight: (k) => {
      night = k
    },
    step: (dt, _t, still) => {
      if (wave >= 0) {
        wave += dt / 1.6
        if (wave > 1.6) wave = -1
      }
      rails.forEach((rl, i) => {
        const k = wave < 0 ? 0 : Math.max(0, 1 - Math.abs(wave * 4 - i - 0.5) * 1.2)
        ;(rl.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.08 + night * 0.35 + k)
      })
      if (!still) {
        for (let i = 0; i < odds.length; i++) {
          drift[i] += (Math.random() - 0.5) * dt * 0.08
          drift[i] = Math.max(-0.08, Math.min(0.08, drift[i]))
          odds[i] = Math.max(0.08, Math.min(1, odds[i] + drift[i] * dt))
          if (odds[i] <= 0.08 || odds[i] >= 1) drift[i] *= -1
        }
        placeBars()
        for (let i = 0; i < carD.length; i++) carD[i] = (carD[i] + (dt * 0.9) / (Math.PI * 2 * WALK[1])) % 1
        placeCars()
      }
      return !still || wave >= 0
    },
  }
}

/** a glass dome over a glasshouse: lit inside at night */
function glassDome(b: Builder, x: number, z: number, y: number, r: number) {
  const n = 10, m = 3
  const pt = (i: number, k: number) => {
    const a = (i / n) * Math.PI * 2
    const t = (k / m) * (Math.PI / 2)
    return [x + Math.cos(a) * r * Math.cos(t), y + r * Math.sin(t), z + Math.sin(a) * r * Math.cos(t)]
  }
  for (let k = 0; k < m; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      if (k === m - 1) b.tri(pt(i, k), pt(j, k), [x, y + r, z], 'roof', 0.22)
      else {
        b.tri(pt(i, k), pt(j, k), pt(j, k + 1), 'roof', 0.22)
        b.tri(pt(i, k), pt(j, k + 1), pt(i, k + 1), 'roof', 0.22)
      }
      b.edge(pt(i, k), pt(i, k + 1))
    }
}
