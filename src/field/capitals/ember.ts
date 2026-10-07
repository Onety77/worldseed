import * as THREE from 'three'
import { Builder, box, cone, cylinder, dome, gable, strut, taper, type Tone } from '../kit'
import { drawPlan, type Capital, type CapitalCtx, type Pt } from '../capital'

/*
  Emberfall: a volcanic island of crafters, where every item is burned to make the next.

  The city is built down into a crater. Three terraces of black basalt step down from the
  rim to an island in the middle, each held up by a wall and joined to the next by steep
  stairs. Lava pours over the rim, falls terrace to terrace and fills a ring round the
  island; the only way in from outside is a cut through the rim, where the road comes up
  from the ash plain.

  - on the island, the arena: the assembly meets in its stands, a banner over each gate
    for each live proposal; the governor's obsidian spire rises from its floor, and when a
    proof is published the lava flares and a spray of sparks goes up from its crown;
  - the treasury is a crucible vault beside the lava fall, its band of molten gold as
    high as the runway reaches;
  - the market is a bazaar of parts along the top terrace by the road in;
  - each app is a workshop of its own kind: a forge hall, a kiln, a foundry, a glassworks,
    sparks going up from all of them;
  - the spaceport stands on the ash plain outside the cut.

  Houses are dark stone cubes with flat roofs, stacked along the terraces.
*/

const A_IN = 0.9 // where the lava pours over the rim
const STAIRS = [A_IN + 1.4, A_IN + Math.PI, A_IN - 1.4] // the stairs (the middle one is the road in)
const ROAD = A_IN + Math.PI
const LAVA = -0.4
const BED = -1.1
const PLAIN = 2.0
const RIM = 6.8

/** each terrace: where it starts and ends, its height, and the ring people walk along */
const TER = [
  { r0: 0, r1: 5.7, h: 0.3, walk: 5.05 },
  { r0: 10.4, r1: 14, h: 1.4, walk: 12.2 },
  { r0: 14.9, r1: 20, h: 2.8, walk: 17.45 },
  { r0: 20.9, r1: 27, h: 4.2, walk: 23.6 },
]
/** the walls between: inner radius, outer radius, foot, top */
const WALLS = [
  { r0: 5.7, r1: 6.6, lo: BED, hi: 0.42 },
  { r0: 9.5, r1: 10.4, lo: BED, hi: 1.52 },
  { r0: 14, r1: 14.9, lo: 1.1, hi: 2.92 },
  { r0: 20, r1: 20.9, lo: 2.5, hi: 4.32 },
]

const STONE = ['#4a413c', '#3d3532', '#554a43', '#5f5148', '#6b5a4c', '#7a3f2e', '#8a5a3a', '#bfb09a', '#433a36']
const ROOF = '#2a2422'
const BASALT = '#3a322f'
const PAVE = '#5d534c'

const polar = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d })
const V = (a: number, d: number, y: number) => [Math.cos(a) * d, y, Math.sin(a) * d]
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const terOf = (r: number) => (r < 8 ? 0 : r < 14.45 ? 1 : r < 20.45 ? 2 : r < 30 ? 3 : 4)

export function ember(ctx: CapitalCtx): Capital {
  const { input, r, top } = ctx
  const b = new Builder(r, 'game')
  b.lit = 0.5 + input.lit * 0.4
  const yAt = (rr: number) => top + (rr < 30 ? TER[Math.min(3, terOf(rr))].h : PLAIN)
  const taken: { a: number; r: number; w: number }[] = [] // (angle, radius, half-width along the arc)
  const blocked = (a: number, rr: number, w: number) =>
    taken.some((t) => Math.abs(t.r - rr) < 1.6 && Math.abs(wrap(t.a - a)) * rr < t.w + w) ||
    STAIRS.some((s) => Math.abs(wrap(s - a)) * rr < 1.1 + w) ||
    Math.abs(wrap(A_IN - a)) * rr < 1.6 + w
  const places: { key: string; kind: Parameters<CapitalCtx['place']>[1]; x: number; z: number; y: number }[] = []
  const chimneys: number[][] = []

  // ── the walls that hold the terraces up, with gaps for the stairs and the lava ──
  for (const [wi, w] of WALLS.entries()) {
    const n = Math.round(w.r1 * 9)
    b.at(w.lo).tint(BASALT, '#4b423d')
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2
      const gapStair = wi > 0 && STAIRS.some((s) => Math.abs(wrap(s - am)) * w.r1 < 0.75)
      const gapLava = wi > 1 && Math.abs(wrap(A_IN - am)) * w.r1 < 1.25
      if (gapStair || gapLava) continue
      const outer = wi === 0 ? w.r0 : w.r1 // the face that looks down on the lower side
      const inner = wi === 0 ? w.r1 : w.r0
      b.quad(V(a0, inner, w.lo), V(a1, inner, w.lo), V(a1, inner, w.hi), V(a0, inner, w.hi), 'wall')
      b.quad(V(a0, outer, w.hi - 0.3), V(a1, outer, w.hi - 0.3), V(a1, outer, w.hi), V(a0, outer, w.hi), 'wall')
      b.quad(V(a0, w.r0, w.hi), V(a1, w.r0, w.hi), V(a1, w.r1, w.hi), V(a0, w.r1, w.hi), 'roof')
      b.edge(V(a0, inner, w.hi), V(a1, inner, w.hi))
      // a parapet stone every so often on the edge over the drop
      if (i % 3 === 0) box(b, { ...polar(am, inner + (wi === 0 ? -0.12 : 0.12)), rot: am + Math.PI / 2 }, w.hi, 0.12, 0.08, 0.14, { roof: 'roof', windows: false, edges: false })
    }
  }

  // ── the stairs: up each wall on the three stair lines; bridges over the lava to the island ──
  for (const s of STAIRS) {
    // the bridge from the island across the lava ring, rising to the first terrace
    archBridge(b, polar(s, 5.9), polar(s, 9.9), top + 0.34, top + 1.42, 0.62)
    for (const wi of [2, 3]) {
      const w = WALLS[wi]
      const lo = top + TER[wi - 1].h, hi = top + TER[wi].h
      const n = 8, r0 = w.r0 - 1.5, r1 = w.r1 + 0.15
      b.at(lo - 0.1).tint('#4f4540', PAVE)
      for (let k = 0; k < n; k++) {
        const ra = r0 + ((r1 - r0) * k) / n, rb = r0 + ((r1 - r0) * (k + 1)) / n
        const f = { ...polar(s, (ra + rb) / 2), rot: s }
        box(b, f, lo - 0.1, (rb - ra) / 2 + 0.01, 0.6, 0.1 + ((hi - lo) * (k + 1)) / n, { roof: 'roof', windows: false, edges: k === n - 1 })
      }
      // side walls up the flight
      for (const sd of [-1, 1]) {
        const off = (p: number[]) => [p[0] - Math.sin(s) * 0.66 * sd, p[1], p[2] + Math.cos(s) * 0.66 * sd]
        b.edge(off(V(s, r0, lo + 0.25)), off(V(s, r1, hi + 0.25)))
      }
    }
  }

  // ── the lava fall and channel: bridges carry each terrace's walk across it ──
  for (const t of [1, 2, 3]) archBridge(b, polar(A_IN - 1.5 / TER[t].walk, TER[t].walk), polar(A_IN + 1.5 / TER[t].walk, TER[t].walk), top + TER[t].h + 0.04, top + TER[t].h + 0.04, 0.55)

  // ── the arena on the island, and the governor's spire in the middle of it ──
  {
    const y0 = top + TER[0].h
    const gates = STAIRS
    const n = 36
    for (let k = 0; k < 3; k++) {
      const ra = 2.7 + k * 0.55, rb = ra + 0.55, h = 0.22 * (k + 1)
      b.at(y0).tint(['#5d524b', '#675a51', '#71635a'][k], '#7a6a5e')
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
        if (gates.some((g) => Math.abs(wrap(g - (a0 + a1) / 2)) < 0.16)) continue
        b.quad(V(a0, ra, y0 + h), V(a1, ra, y0 + h), V(a1, rb, y0 + h), V(a0, rb, y0 + h), 'roof')
        b.quad(V(a0, ra, y0), V(a1, ra, y0), V(a1, ra, y0 + h), V(a0, ra, y0 + h), 'wall')
        if (k === 2) {
          b.quad(V(a0, rb, y0), V(a1, rb, y0), V(a1, rb, y0 + h + 0.35), V(a0, rb, y0 + h + 0.35), 'wall')
          b.quad(V(a0, rb - 0.12, y0 + h), V(a1, rb - 0.12, y0 + h), V(a1, rb - 0.12, y0 + h + 0.35), V(a0, rb - 0.12, y0 + h + 0.35), 'wall')
          b.quad(V(a0, rb - 0.12, y0 + h + 0.35), V(a1, rb - 0.12, y0 + h + 0.35), V(a1, rb, y0 + h + 0.35), V(a0, rb, y0 + h + 0.35), 'roof')
          b.edge(V(a0, rb, y0 + h + 0.35), V(a1, rb, y0 + h + 0.35))
        }
        b.edge(V(a0, ra, y0 + h), V(a1, ra, y0 + h))
      }
    }
    // banners on poles either side of each gate: a live proposal's fills with green
    const props = input.proposals.slice(0, 6)
    gates.forEach((g, gi) => {
      for (const sd of [-1, 1]) {
        const i = gi * 2 + (sd > 0 ? 1 : 0)
        const a = g + sd * 0.2
        const p = polar(a, 4.45)
        const ty = y0 + 0.66 + 1.6
        b.at(y0).tint('#2e2826')
        strut(b, [p.x, y0 + 0.66, p.z], [p.x, ty, p.z], 0.025, 'wall')
        const t = [-Math.sin(a), Math.cos(a)]
        const Pf = (u: number, v: number) => [p.x + t[0] * u * sd, ty - v, p.z + t[1] * u * sd]
        const pr = props[i]
        const fill = pr ? Math.min(1, Math.max(0.05, pr.support)) : 0
        if (pr) {
          b.quad(Pf(0.03, 0.75 - 0.75 * fill), Pf(0.38, 0.75 - 0.75 * fill), Pf(0.38, 0.75), Pf(0.03, 0.75), 'brand')
          b.quad(Pf(0.03, 0), Pf(0.38, 0), Pf(0.38, 0.75 - 0.75 * fill), Pf(0.03, 0.75 - 0.75 * fill), 'canvas')
        } else b.quad(Pf(0.03, 0), Pf(0.38, 0), Pf(0.38, 0.55), Pf(0.03, 0.55), 'roof')
      }
    })
    places.push({ key: 'hall', kind: 'hall', ...polar(STAIRS[0] + 0.5, 3.8), y: y0 + 1.6 })

    // the spire: a plinth, a black needle with glowing seams, and a crown
    const f = { x: 0, z: 0, rot: 0 }
    b.at(y0).tint('#2b2524', '#1f1a19')
    let y = cylinder(b, f, y0, 0.95, 0.3, 8, 'roof')
    y = cylinder(b, f, y, 0.7, 0.18, 8, 'roof')
    const H = 7.4
    const w0 = 0.5, w1 = 0.1
    const corner = (i: number, k: number) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const ww = w0 + (w1 - w0) * k
      return [Math.cos(a) * ww, y + H * k, Math.sin(a) * ww]
    }
    for (let i = 0; i < 4; i++) {
      b.quad(corner(i, 0), corner(i + 1, 0), corner(i + 1, 1), corner(i, 1), 'wall')
      b.edge(corner(i, 0), corner(i, 1))
      // a seam of fire up the middle of each face
      const a = ((i + 0.5) / 4) * Math.PI * 2 + Math.PI / 4
      for (let k = 0; k < 6; k++) {
        const k0 = 0.08 + k * 0.15, k1 = k0 + 0.1
        const d0 = (w0 + (w1 - w0) * k0) * 0.72 + 0.012, d1 = (w0 + (w1 - w0) * k1) * 0.72 + 0.012
        const t = [-Math.sin(a), Math.cos(a)]
        glow(b, [Math.cos(a) * d0 - t[0] * 0.035, y + H * k0, Math.sin(a) * d0 - t[1] * 0.035], [Math.cos(a) * d0 + t[0] * 0.035, y + H * k0, Math.sin(a) * d0 + t[1] * 0.035], [Math.cos(a) * d1 + t[0] * 0.035, y + H * k1, Math.sin(a) * d1 + t[1] * 0.035], [Math.cos(a) * d1 - t[0] * 0.035, y + H * k1, Math.sin(a) * d1 - t[1] * 0.035])
      }
    }
    const crown = y + H
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2, a1 = a0 + Math.PI / 2
      b.tri([Math.cos(a0) * 0.2, crown, Math.sin(a0) * 0.2], [Math.cos(a1) * 0.2, crown, Math.sin(a1) * 0.2], [0, crown + 0.5, 0], 'brand', 1)
      b.tri([Math.cos(a0) * 0.2, crown, Math.sin(a0) * 0.2], [Math.cos(a1) * 0.2, crown, Math.sin(a1) * 0.2], [0, crown - 0.3, 0], 'brand', 1)
    }
    places.push({ key: 'tower', kind: 'tower', x: 0, z: 0, y: crown + 0.4 })
    chimneys.push([0, crown + 0.5, 0])
  }

  // ── the crucible vault, beside the lava fall ──
  {
    const a = A_IN + 0.62, rr = TER[2].walk + 0.2
    const p = polar(a, rr)
    const f = { ...p, rot: a }
    const y0 = top + TER[2].h
    b.at(y0).tint('#433a36', '#6b4a2c')
    let y = cylinder(b, f, y0, 1.75, 0.25, 16, 'roof')
    const yb = y
    y = cylinder(b, f, y, 1.45, 1.35, 16, 'wall')
    const fill = Math.min(1, Math.max(0.08, input.runway / 24))
    const lo = yb + 0.16, hi = yb + 0.16 + (1.35 - 0.32) * fill
    for (let i = 0; i < 16; i++) {
      const q0 = (i / 16) * Math.PI * 2, q1 = ((i + 1) / 16) * Math.PI * 2
      const A = [p.x + Math.cos(q0) * 1.465, lo, p.z + Math.sin(q0) * 1.465], B = [p.x + Math.cos(q1) * 1.465, lo, p.z + Math.sin(q1) * 1.465]
      b.tri(A, B, [B[0], hi, B[2]], 'lamp', 1)
      b.tri(A, [B[0], hi, B[2]], [A[0], hi, A[2]], 'lamp', 1)
    }
    for (let i = 0; i < 4; i++) {
      const q = (i / 4) * Math.PI * 2 + 0.4
      box(b, { x: p.x + Math.cos(q) * 1.55, z: p.z + Math.sin(q) * 1.55, rot: q }, y0, 0.28, 0.16, 1.5, { roof: 'roof', windows: false })
    }
    y = cylinder(b, f, y, 1.6, 0.12, 16, 'roof')
    dome(b, f, y, 1.1, 'roof')
    taken.push({ a, r: rr, w: 2.0 })
    places.push({ key: 'vault', kind: 'vault', x: p.x, z: p.z, y: y + 1.2 })
  }

  // ── the bazaar of parts, along the top terrace by the road in ──
  {
    const a0 = ROAD - 0.32, a1 = ROAD - 0.08
    const rr = TER[3].walk
    const n = Math.max(3, Math.min(8, input.jobs.length + 2))
    const y0 = top + TER[3].h
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1)
      for (const side of [-1, 1]) {
        if ((i + (side > 0 ? 1 : 0)) % 2 && i > input.jobs.length) continue
        const d = rr + side * 0.75
        const p = polar(a, d)
        const f = { ...p, rot: a + Math.PI / 2 }
        b.at(y0).tint('#5f5148', '#5f5148')
        const st = box(b, f, y0, 0.26, 0.2, 0.28, { windows: false })
        const t = [Math.cos(a), Math.sin(a)]
        const Q = (u: number, v: number, hy: number) => [p.x + -Math.sin(a) * u + t[0] * v * -side, hy, p.z + Math.cos(a) * u + t[1] * v * -side]
        b.quad(Q(-0.3, -0.2, st + 0.2), Q(0.3, -0.2, st + 0.2), Q(0.3, 0.32, st), Q(-0.3, 0.32, st), (i + side) % 3 === 0 ? 'brand' : 'canvas')
      }
    }
    taken.push({ a: (a0 + a1) / 2, r: rr, w: ((a1 - a0) * rr) / 2 + 0.8 })
    const pm = polar((a0 + a1) / 2, rr)
    places.push({ key: 'market', kind: 'market', x: pm.x, z: pm.z, y: y0 + 1.1 })
  }

  // ── the apps: a workshop each, of its own kind ──
  const SLOTS = [
    { a: A_IN - 0.72, t: 2 },
    { a: A_IN + 2.3, t: 3 },
    { a: A_IN - 2.3, t: 3 },
    { a: A_IN + 2.45, t: 1 },
  ]
  input.apps.forEach((app, i) => {
    const sl = SLOTS[i % SLOTS.length]
    const rr = TER[sl.t].walk + (sl.t === 1 ? 0 : 0.6)
    const p = polar(sl.a, rr)
    const y0 = top + TER[sl.t].h
    const inward = sl.a + Math.PI
    const f = { ...p, rot: sl.a + Math.PI / 2 }
    let peak = y0
    const mouth = (d: number, w: number, h: number) => {
      // a glowing doorway on the side facing the middle
      const c = polar(sl.a, rr - d)
      const t = [-Math.sin(sl.a), Math.cos(sl.a)]
      glow(b, [c.x - t[0] * w, y0, c.z - t[1] * w], [c.x + t[0] * w, y0, c.z + t[1] * w], [c.x + t[0] * w, y0 + h, c.z + t[1] * w], [c.x - t[0] * w, y0 + h, c.z - t[1] * w])
    }
    if (i % 4 === 0) {
      // the forge hall: long, dark, three chimneys
      b.at(y0).tint('#3d3532', '#2a2422')
      const y = box(b, f, y0, 1.45, 0.8, 1.05, { windows: false })
      gable(b, f, y, 1.5, 0.85, 0.55)
      for (const u of [-0.9, 0, 0.9]) {
        const c = { x: p.x + -Math.sin(sl.a) * u + Math.cos(sl.a) * 0.4, z: p.z + Math.cos(sl.a) * u + Math.sin(sl.a) * 0.4 }
        box(b, { ...c, rot: sl.a }, y0, 0.15, 0.15, 2.3, { roof: 'roof', windows: false })
        chimneys.push([c.x, y0 + 2.3, c.z])
      }
      mouth(0.82, 0.45, 0.6)
      peak = y0 + 2.4
    } else if (i % 4 === 1) {
      // the kiln: a beehive of brick, glowing at its mouth and its crown
      b.at(y0).tint('#7a3f2e', '#5a2e22')
      let y = taper(b, p.x, p.z, y0, 1.25, 1.1, 0.6, 'wall')
      y = taper(b, p.x, p.z, y, 1.1, 0.75, 0.6, 'wall')
      y = taper(b, p.x, p.z, y, 0.75, 0.32, 0.55, 'wall')
      y = taper(b, p.x, p.z, y, 0.32, 0.22, 0.35, 'wall')
      chimneys.push([p.x, y, p.z])
      mouth(1.2, 0.3, 0.5)
      peak = y + 0.2
    } else if (i % 4 === 2) {
      // the foundry: a tall block, a jib with a ladle of molten metal
      b.at(y0).tint('#4a413c', '#2a2422')
      const y = box(b, f, y0, 0.85, 0.85, 2.5)
      box(b, f, y, 0.92, 0.92, 0.12, { roof: 'roof', windows: false })
      const jibEnd = polar(inward, 1.9)
      const tip = [p.x + jibEnd.x, y - 0.1, p.z + jibEnd.z]
      b.edge([p.x, y - 0.1, p.z], tip)
      b.edge([p.x, y + 0.5, p.z], tip)
      b.edge(tip, [tip[0], y - 1.0, tip[2]])
      b.at(y - 1.3)
      cylinder(b, { x: tip[0], z: tip[2], rot: 0 }, y - 1.3, 0.2, 0.25, 8, 'lamp')
      b.at(y0)
      box(b, { ...polar(sl.a, rr + 0.5), rot: sl.a }, y, 0.12, 0.12, 0.9, { roof: 'roof', windows: false })
      const ch = polar(sl.a, rr + 0.5)
      chimneys.push([ch.x, y + 0.9, ch.z])
      mouth(0.87, 0.35, 0.55)
      peak = y + 0.9
    } else {
      // the glassworks: a cone furnace with an annex
      b.at(y0).tint('#bfb09a', '#433a36')
      const y = taper(b, p.x, p.z, y0, 1.0, 0.85, 0.5, 'wall')
      cone(b, p.x, p.z, y, 0.85, 1.9, 'roof')
      chimneys.push([p.x, y + 1.9, p.z])
      const an = { ...polar(sl.a + 0.16, rr - 0.2), rot: sl.a }
      const ay = box(b, an, y0, 0.5, 0.45, 0.7)
      gable(b, { ...an, rot: an.rot + Math.PI / 2 }, ay, 0.45, 0.5, 0.3)
      mouth(1.0, 0.25, 0.45)
      peak = y + 2.0
    }
    // a band of the world's green over the door, where the name would be
    const c = polar(sl.a, rr - (i % 4 === 1 ? 1.2 : i % 4 === 3 ? 1.0 : 0.86))
    const t = [-Math.sin(sl.a), Math.cos(sl.a)]
    b.quad([c.x - t[0] * 0.5, y0 + 0.72, c.z - t[1] * 0.5], [c.x + t[0] * 0.5, y0 + 0.72, c.z + t[1] * 0.5], [c.x + t[0] * 0.5, y0 + 0.86, c.z + t[1] * 0.5], [c.x - t[0] * 0.5, y0 + 0.86, c.z - t[1] * 0.5], 'brand')
    taken.push({ a: sl.a, r: rr, w: 1.7 })
    places.push({ key: app.key, kind: 'app', x: p.x, z: p.z, y: peak })
  })

  // ── the spaceport, on the ash plain outside the cut ──
  {
    const a = ROAD + 0.22
    const p = polar(a, 40)
    const y0 = top + PLAIN
    b.at(y0).tint(undefined, '#4b433e')
    const pad = cylinder(b, { ...p, rot: 0 }, y0 - 0.05, 2.1, 0.16, 28, 'roof')
    for (let i = 0; i < 32; i++) {
      const q0 = (i / 32) * Math.PI * 2, q1 = ((i + 1) / 32) * Math.PI * 2
      b.edge([p.x + Math.cos(q0) * 1.5, pad + 0.005, p.z + Math.sin(q0) * 1.5], [p.x + Math.cos(q1) * 1.5, pad + 0.005, p.z + Math.sin(q1) * 1.5])
    }
    b.at(pad).tint('#e8ddd0')
    let sy = cylinder(b, { ...p, rot: 0 }, pad, 0.34, 2.0, 12, 'wall', true)
    sy = cylinder(b, { ...p, rot: 0 }, sy, 0.36, 0.1, 12, 'trim')
    for (let i = 0; i < 12; i++) {
      const q0 = (i / 12) * Math.PI * 2, q1 = ((i + 1) / 12) * Math.PI * 2
      b.tri([p.x + Math.cos(q0) * 0.34, sy, p.z + Math.sin(q0) * 0.34], [p.x + Math.cos(q1) * 0.34, sy, p.z + Math.sin(q1) * 0.34], [p.x, sy + 0.85, p.z], 'brand')
    }
    for (let i = 0; i < 3; i++) {
      const q = (i / 3) * Math.PI * 2 + 0.2
      b.tri([p.x + Math.cos(q) * 0.32, pad + 0.65, p.z + Math.sin(q) * 0.32], [p.x + Math.cos(q) * 0.78, pad, p.z + Math.sin(q) * 0.78], [p.x + Math.cos(q) * 0.32, pad, p.z + Math.sin(q) * 0.32], 'roof')
    }
    const g = { x: p.x + Math.cos(a + 1.6) * 1.15, z: p.z + Math.sin(a + 1.6) * 1.15 }
    b.at(pad).tint('#5f5148')
    for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) strut(b, [g.x + i * 0.17, pad, g.z + k * 0.17], [g.x + i * 0.17, pad + 2.7, g.z + k * 0.17], 0.03, 'wall')
    for (let gy = pad + 0.4; gy < pad + 2.7; gy += 0.5) {
      b.edge([g.x - 0.17, gy, g.z - 0.17], [g.x + 0.17, gy + 0.5, g.z - 0.17])
      b.edge([g.x + 0.17, gy, g.z + 0.17], [g.x - 0.17, gy + 0.5, g.z + 0.17])
    }
    b.tri([g.x - 0.1, pad + 2.75, g.z], [g.x + 0.1, pad + 2.75, g.z], [g.x, pad + 2.95, g.z], 'lamp', 1)
    places.push({ key: 'port', kind: 'port', x: p.x, z: p.z, y: sy + 0.85 })
  }

  // ── houses: dark stone cubes along the terraces, backs to the wall above ──
  for (const t of [1, 2, 3]) {
    const T = TER[t]
    const rows = t === 1 ? [T.r1 - 0.85] : [T.r1 - 0.85, T.r0 + 0.85]
    for (const [ri, rr] of rows.entries()) {
      for (let a = r() * 0.3; a < Math.PI * 2; ) {
        const w = 0.3 + r() * 0.16
        const step = (w * 2 + 0.06) / rr
        const am = a + step / 2
        if (blocked(am, rr, w)) {
          a += 0.25 / rr
          continue
        }
        // gaps between the houses: lanes, yards, the odd ruin
        if (r() < 0.3) {
          a += step * (1 + r() * 1.5)
          continue
        }
        const f = { ...polar(am, rr), rot: am + Math.PI / 2 + (ri ? Math.PI : 0) }
        const y0 = top + T.h
        b.at(y0).tint(STONE[Math.floor(r() * STONE.length)], ROOF)
        const h = 0.5 + r() * 0.6 + (ri === 0 ? 0.25 : 0)
        const y = box(b, f, y0, w, 0.45, h, { roof: 'roof' })
        const kind = r()
        if (kind < 0.18) dome(b, { ...polar(am, rr), rot: 0 }, y, Math.min(w, 0.4) * 0.8, 'roof')
        else if (kind < 0.5) {
          box(b, f, y, w * 1.02, 0.47, 0.07, { roof: 'roof', windows: false, edges: false })
          // a little chimney, its top warm
          const c = polar(am + (0.15 * w) / rr, rr + (ri ? -0.2 : 0.2))
          box(b, { ...c, rot: f.rot }, y, 0.06, 0.06, 0.3, { roof: 'roof', windows: false, edges: false })
          if (r() < 0.3) chimneys.push([c.x, y + 0.3, c.z])
        } else if (kind < 0.6) {
          // a second, smaller storey set back
          box(b, { ...f }, y, w * 0.6, 0.3, 0.4, { roof: 'roof' })
        }
        a += step
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

  // obsidian shards along the rim, boulders on the ash plain
  const shards: { x: number; z: number; y: number; s: number; tall: boolean }[] = []
  for (let k = 0; k < 60; k++) {
    const a = r() * Math.PI * 2
    if (Math.abs(wrap(a - ROAD)) < 0.22 || Math.abs(wrap(a - A_IN)) < 0.16) continue
    const d = 28.6 + r() * 3.4
    shards.push({ ...polar(a, d), y: top + rimAt(d) - 0.2, s: 0.25 + Math.pow(r(), 2) * 0.75, tall: true })
  }
  for (let k = 0; k < 50; k++) {
    const a = r() * Math.PI * 2, d = 42 + r() * 10
    shards.push({ ...polar(a, d), y: top + PLAIN - 0.1, s: 0.3 + r() * 0.6, tall: false })
  }
  const tallGeo = new THREE.ConeGeometry(0.35, 1.8, 5).translate(0, 0.8, 0)
  const lowGeo = new THREE.DodecahedronGeometry(0.6, 0).scale(1, 0.55, 1)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color()
  const mk = (geo: THREE.BufferGeometry, list: typeof shards) => {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), list.length)
    list.forEach((sh, i) => {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4))
      m.compose(new THREE.Vector3(sh.x, sh.y, sh.z), q, new THREE.Vector3(sh.s, sh.s * (sh.tall ? 0.8 + r() * 0.9 : 1), sh.s))
      im.setMatrixAt(i, m)
      im.setColorAt(i, col.set(sh.tall ? '#221c1b' : '#4a423d').multiplyScalar(0.85 + r() * 0.3))
    })
    im.castShadow = true
    im.receiveShadow = true
    return im
  }
  const rimRocks = mk(tallGeo, shards.filter((s) => s.tall))
  const plainRocks = mk(lowGeo, shards.filter((s) => !s.tall))

  // the lava lights the stone round it, more so at night
  const glows = [polar(A_IN, 8), polar(A_IN + 2.1, 8), polar(A_IN - 2.1, 8), polar(A_IN, 21), polar(A_IN, 28)].map((p, i) => {
    const l = new THREE.PointLight('#ff6a24', 1, 15, 1.4)
    l.position.set(p.x, top + (i < 3 ? 0.6 : i === 3 ? 3.6 : 5.6), p.z)
    return l
  })

  // sparks: always going up from the forges; a spray from the spire when a proof is published
  const MAXS = 140
  const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.055, 0), new THREE.MeshBasicMaterial({ color: '#ffae5a', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXS)
  sparkMesh.frustumCulled = false
  const sparks: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number }[] = []
  const emit = (p: number[], n: number, burst: boolean) => {
    for (let i = 0; i < n; i++) {
      if (sparks.length >= MAXS) sparks.shift()
      const a = Math.random() * Math.PI * 2, sp = burst ? 0.6 + Math.random() * 1.6 : 0.08 + Math.random() * 0.15
      sparks.push({ x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * sp, vy: burst ? 1.2 + Math.random() * 2.2 : 0.7 + Math.random() * 0.7, vz: Math.sin(a) * sp, t: 0, life: burst ? 1.4 + Math.random() : 1.2 + Math.random() * 1.2 })
    }
  }
  const flare = { value: 0 }
  let night = 0
  let since = 0

  // the ground: ash plain, the rim, terraces stepping down, the lava ring and the fall into it
  const plan = drawPlan(
    80,
    1024,
    0,
    { water: 0.25, weight: 8, height: 0.32 },
    (p) => {
      p.weight.fillStyle = '#fff'
      p.weight.beginPath()
      p.weight.arc(0, 0, 54, 0, Math.PI * 2)
      p.weight.fill()
      p.height.fillStyle = p.grey(PLAIN)
      p.height.fillRect(-80, -80, 160, 160)
      // the rim: a cliff up from the top terrace, a long slope down outside
      const g = p.height.createRadialGradient(0, 0, 0, 0, 0, 43)
      const stops: [number, number][] = [[0, 4.4], [26.5, 4.4], [29, RIM], [31.5, RIM - 0.4], [36, 4.0], [43, PLAIN]]
      for (const [d, h] of stops) g.addColorStop(d / 43, p.grey(h))
      p.height.fillStyle = g
      p.height.beginPath()
      p.height.arc(0, 0, 43, 0, Math.PI * 2)
      p.height.fill()
      // the cut where the road comes in
      for (let k = 0; k < 10; k++) {
        const d0 = 26 + k * 1.8
        const h = k < 3 ? TER[3].h : TER[3].h + ((PLAIN - TER[3].h) * (k - 2)) / 7
        p.height.strokeStyle = p.grey(h)
        p.height.lineWidth = 4.2
        p.height.lineCap = 'round'
        p.height.beginPath()
        p.height.moveTo(Math.cos(ROAD) * d0, Math.sin(ROAD) * d0)
        p.height.lineTo(Math.cos(ROAD) * (d0 + 1.9), Math.sin(ROAD) * (d0 + 1.9))
        p.height.stroke()
      }
      // the terraces, then the lava ring, then the island
      const disk = (ctx2: CanvasRenderingContext2D, rr: number, fill: string) => {
        ctx2.fillStyle = fill
        ctx2.beginPath()
        ctx2.arc(0, 0, rr, 0, Math.PI * 2)
        ctx2.fill()
      }
      disk(p.height, 27, p.grey(TER[3].h))
      disk(p.height, WALLS[3].r0 + 0.45, p.grey(TER[2].h))
      disk(p.height, WALLS[2].r0 + 0.45, p.grey(TER[1].h))
      disk(p.height, WALLS[1].r0 + 0.45, p.grey(BED))
      disk(p.height, WALLS[0].r1 - 0.45, p.grey(TER[0].h))
      disk(p.water, 10.2, '#fff')
      // the fall: down the rim and across each terrace in its own channel, each a step lower
      const segs: [number, number, number][] = [
        [WALLS[3].r0 + 0.45, 27, TER[3].h - 0.4],
        [WALLS[2].r0 + 0.45, WALLS[3].r0 + 0.45, TER[2].h - 0.4],
        [WALLS[1].r0 + 0.45, WALLS[2].r0 + 0.45, TER[1].h - 0.4],
      ]
      for (const [d0, d1, lv] of segs) {
        const s = (ctx2: CanvasRenderingContext2D, colr: string, w: number) => {
          ctx2.strokeStyle = colr
          ctx2.lineWidth = w
          ctx2.lineCap = 'butt'
          ctx2.beginPath()
          ctx2.moveTo(Math.cos(A_IN) * d0, Math.sin(A_IN) * d0)
          ctx2.lineTo(Math.cos(A_IN) * d1, Math.sin(A_IN) * d1)
          ctx2.stroke()
        }
        s(p.height, p.grey(lv - 0.5), 2.3)
        s(p.level, p.grey(lv), 2.6)
        s(p.water, '#fff', 3.2)
      }
      // where the lava pours over the rim: a steep chute from the crest
      for (let k = 0; k < 5; k++) {
        const d0 = 26.6 + k * 0.7
        const lv = TER[3].h - 0.4 + ((RIM - 0.35 - (TER[3].h - 0.4)) * k) / 4
        p.height.strokeStyle = p.grey(lv - 0.45)
        p.level.strokeStyle = p.grey(lv)
        p.water.strokeStyle = '#fff'
        for (const [c2, w] of [[p.height, 2.0], [p.level, 2.4], [p.water, 3.0]] as const) {
          c2.lineWidth = w
          c2.beginPath()
          c2.moveTo(Math.cos(A_IN) * d0, Math.sin(A_IN) * d0)
          c2.lineTo(Math.cos(A_IN) * (d0 + 0.9), Math.sin(A_IN) * (d0 + 0.9))
          c2.stroke()
        }
      }
      // paving: a walk round each terrace, sand on the arena floor, ash and scoria outside
      p.paint.globalAlpha = 0.55
      disk(p.paint, 54, '#5e5651')
      p.paint.globalAlpha = 0.7
      disk(p.paint, 27.5, '#4a413c')
      p.paint.globalAlpha = 0.85
      for (const T of TER.slice(1)) {
        p.paint.strokeStyle = PAVE
        p.paint.lineWidth = 1.1
        p.paint.beginPath()
        p.paint.arc(0, 0, T.walk, 0, Math.PI * 2)
        p.paint.stroke()
      }
      disk(p.paint, 2.65, '#a58e6c')
      p.paint.strokeStyle = '#6a5f57'
      p.paint.lineWidth = 3.2
      p.paint.beginPath()
      p.paint.moveTo(Math.cos(ROAD) * 26, Math.sin(ROAD) * 26)
      p.paint.lineTo(Math.cos(ROAD) * 62, Math.sin(ROAD) * 62)
      p.paint.stroke()
      p.paint.globalAlpha = 1
    },
    LAVA,
  )
  plan.molten = true
  plan.flare = flare

  // walkers keep to the terraces, change level by the stairs, and cross the lava by the bridges
  const walkPt = (a: number, t: number): Pt => ({ ...polar(a, t === 4 ? 36 : TER[t].walk), y: t === 4 ? top + PLAIN : top + TER[t].h })
  const arc = (a0: number, a1: number, t: number) => {
    const d = wrap(a1 - a0)
    const n = Math.max(1, Math.ceil((Math.abs(d) * TER[Math.min(3, t)].walk) / 1.2))
    return Array.from({ length: n + 1 }, (_, k) => walkPt(a0 + (d * k) / n, t))
  }
  return {
    objects: [group, rimRocks, plainRocks, sparkMesh, ...glows],
    mesa: 34,
    plan,
    pulse: { x: 0, z: 0, sides: 96, rot: 0 },
    route: (a, c) => {
      const ra = Math.hypot(a.x, a.z), rc = Math.hypot(c.x, c.z)
      const ta = terOf(ra), tc = terOf(rc)
      const aa = Math.atan2(a.z, a.x), ac = Math.atan2(c.z, c.x)
      const pts: Pt[] = [{ ...a, y: yAt(ra) }]
      if (ta === tc && ta < 4) pts.push(...arc(aa, ac, ta))
      else {
        // by the stairs nearest where we start (the road, if leaving the crater)
        const s = ta === 4 || tc === 4 ? ROAD : STAIRS.reduce((p, q) => (Math.abs(wrap(q - aa)) < Math.abs(wrap(p - aa)) ? q : p))
        if (ta < 4) pts.push(...arc(aa, s, ta))
        const lo = Math.min(ta, tc), hi = Math.max(ta, tc)
        const climb: Pt[] = []
        for (let t = lo; t <= Math.min(hi, 3); t++) climb.push(walkPt(s, t))
        if (hi === 4) climb.push(walkPt(s, 4))
        pts.push(...(ta < tc ? climb : climb.reverse()))
        if (tc < 4) pts.push(...arc(s, ac, tc))
      }
      pts.push({ ...c, y: yAt(rc) })
      return pts
    },
    flash: () => {
      flare.value = 1.4
      emit([0, top + TER[0].h + 8.4, 0], 40, true)
    },
    setNight: (k) => {
      night = k
    },
    step: (dt, _t, still) => {
      flare.value = Math.max(0, flare.value - dt * 0.9)
      for (const l of glows) l.intensity = (1.2 + night * 9) * (1 + flare.value * 0.6)
      if (!still) {
        since += dt
        while (since > 0.09) {
          since -= 0.09
          if (chimneys.length) emit(chimneys[Math.floor(Math.random() * chimneys.length)], 1, false)
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.t += dt / s.life
        if (s.t >= 1) {
          sparks.splice(i, 1)
          continue
        }
        const drag = Math.pow(0.4, dt)
        s.vx *= drag
        s.vz *= drag
        s.vy = s.vy * Math.pow(0.7, dt) - 0.25 * dt
        s.x += s.vx * dt + Math.sin(s.t * 9 + i) * 0.004
        s.y += s.vy * dt
        s.z += s.vz * dt
      }
      sparks.forEach((s, i) => {
        m.compose(new THREE.Vector3(s.x, s.y, s.z), q.identity(), new THREE.Vector3(1, 1, 1).multiplyScalar((1 - s.t) * (0.8 + night * 0.5)))
        sparkMesh.setMatrixAt(i, m)
      })
      sparkMesh.count = sparks.length
      sparkMesh.instanceMatrix.needsUpdate = true
      sparkMesh.visible = sparks.length > 0
      return !still || flare.value > 0 || sparks.length > 0
    },
  }
}

/** a quad that glows like a furnace mouth */
function glow(b: Builder, p0: number[], p1: number[], p2: number[], p3: number[]) {
  b.tri(p0, p1, p2, 'lamp', 1)
  b.tri(p0, p2, p3, 'lamp', 1)
}

/** the rim's height at a distance out from the middle (for setting things on it) */
function rimAt(d: number) {
  const st: [number, number][] = [[26.5, 4.4], [29, RIM], [31.5, RIM - 0.4], [36, 4.0], [43, PLAIN]]
  for (let i = 1; i < st.length; i++) if (d <= st[i][0]) return st[i - 1][1] + ((st[i][1] - st[i - 1][1]) * (d - st[i - 1][0])) / (st[i][0] - st[i - 1][0])
  return PLAIN
}

/** a stone bridge on an arch, from one point to another, rising from one height to the next */
function archBridge(b: Builder, a: Pt, c: Pt, y0: number, y1: number, half: number) {
  const len = Math.hypot(c.x - a.x, c.z - a.z)
  const dx = (c.x - a.x) / len, dz = (c.z - a.z) / len
  const nx = -dz * half, nz = dx * half
  b.at(BED).tint('#4f4540', PAVE)
  const N = 14
  const deck = (t: number) => y0 + (y1 - y0) * t + 0.18 * Math.sin(Math.PI * t)
  const under = (t: number) => Math.min(deck(t) - 0.14, LAVA + 0.1 + (y0 + (y1 - y0) * t - LAVA) * 0.2 + 0.9 * Math.sin(Math.PI * t))
  const tone: Tone = 'wall'
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N
    const p0 = [a.x + dx * len * t0, a.z + dz * len * t0], p1 = [a.x + dx * len * t1, a.z + dz * len * t1]
    const L0 = [p0[0] + nx, deck(t0), p0[1] + nz], R0 = [p0[0] - nx, deck(t0), p0[1] - nz]
    const L1 = [p1[0] + nx, deck(t1), p1[1] + nz], R1 = [p1[0] - nx, deck(t1), p1[1] - nz]
    b.quad(L0, L1, R1, R0, 'roof')
    for (const [s0, s1] of [[L0, L1], [R0, R1]]) {
      b.quad([s0[0], under(t0), s0[2]], [s1[0], under(t1), s1[2]], s1, s0, tone)
      b.edge([s0[0], s0[1] + 0.16, s0[2]], [s1[0], s1[1] + 0.16, s1[2]])
    }
    b.quad([L0[0], under(t0), L0[2]], [L1[0], under(t1), L1[2]], [R1[0], under(t1), R1[2]], [R0[0], under(t0), R0[2]], tone)
  }
}
