import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Builder, box, cone, cylinder, dish, dome, gable, strut, taper } from '../kit'
import { drawPlan, type Capital, type CapitalCtx, type Pt } from '../capital'

/*
  Quorum Bay: a harbour where agents come to find work and leave with a reputation.

  No one building runs it, so the city has no centre street and no wall. It is a network:
  granite islands scattered round a sheltered bay, each one a node, joined by timber piers
  to a hub and to their neighbours, and strung together overhead by cables from mast to
  mast. Every island keeps its own relay mast; red lights blink on them all night.

  - the hub island holds the governor's relay spire; when a proof is published it runs
    out along every cable at once, a bead of light to each island;
  - the assembly meets in a round hall ringed with flags, one per live proposal, coloured
    as far as its support;
  - the treasury is a granite sea fort guarding the mouth of the bay, its keep banded with
    light as far as the runway reaches;
  - the market is a wharf on stilts, a stall for each open job;
  - each app keeps a relay station on an island of its own, under its own kind of antenna;
  - the spaceport is out on the rocks past the mouth, and a lighthouse marks the way in.

  Small white houses and boathouses sit round the shores with their gables to the water.
  Ferries circle the bay, sailing boats work the outer channel, pines grow in the rock.
*/

const ISLE_H = 0.55 // the tops of the islands
const BED = -1.7 // the floor of the bay
const WATER = -0.62
const DECK = 0.26 // the piers
const HILL = 1.4 // the hills round the bay
const MOUTH = -0.62 // the bay opens to the sea this way
const RING_D = 13.5
const IN_LOOP = 7.3
const OUT_LOOP = 20.8

interface Isle {
  x: number
  z: number
  R: number
  s: number
  role: 'hub' | 'vault' | 'hall' | 'market' | 'app' | 'port' | 'light' | 'homes'
  app?: number
  /** where its cable ties on */
  mast?: number[]
}

const WALLS = ['#f1f2ef', '#e6eaeb', '#f1f2ef', '#d3dce1', '#b7c6cf', '#e8e2d2', '#8a3b2f', '#6d8494']
const ROOFS = ['#3d4b57', '#4f7193', '#2f3a42', '#56636d']
const GRANITE = '#8f918a'
const TIMBER = '#7a6a58'

const polar = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d })

/** an island's shore, a little irregular */
const radius = (is: Isle, a: number) => is.R * (1 + 0.13 * Math.sin(3 * a + is.s) + 0.07 * Math.sin(5 * a + 2 * is.s) + 0.04 * Math.sin(7 * a + 3 * is.s))

export function quorum(ctx: CapitalCtx): Capital {
  const { input, r, top } = ctx
  const H = top + ISLE_H
  const b = new Builder(r, 'agents')
  b.lit = 0.45 + input.lit * 0.45
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]

  // ── the islands ──
  const isles: Isle[] = [{ x: 0, z: 0, R: 4.3, s: 1.3, role: 'hub' }]
  const ring: Isle['role'][] = ['vault', 'app', 'market', 'hall', 'app', 'app', 'app']
  let appN = 0
  ring.forEach((role, k) => {
    const a = MOUTH + ((k + 0.5) * Math.PI * 2) / 7
    const d = RING_D + (r() - 0.5) * 0.8
    const civic = role !== 'app'
    isles.push({ ...polar(a, d), R: civic ? 3.5 : 3.0, s: r() * 6, role, app: role === 'app' ? appN++ : undefined })
  })
  const port: Isle = { ...polar(MOUTH - 0.42, 25.5), R: 3.1, s: 2.1, role: 'port' }
  const light: Isle = { ...polar(MOUTH + 0.38, 27.5), R: 1.55, s: 4.2, role: 'light' }
  isles.push(port, light)
  for (const k of [1, 3, 4]) isles.push({ ...polar(MOUTH + ((k + 1) * Math.PI * 2) / 7, 25.5), R: 2.2 + r() * 0.5, s: r() * 6, role: 'homes' })

  // ── the piers: spokes from the hub, links round the ring (open at the mouth), out to the rest ──
  const links: [number, number][] = []
  for (let k = 1; k <= 7; k++) links.push([0, k])
  for (let k = 1; k < 7; k++) links.push([k, k + 1])
  const nearestRing = (is: Isle) => {
    let best = 1
    for (let k = 1; k <= 7; k++) if (Math.hypot(isles[k].x - is.x, isles[k].z - is.z) < Math.hypot(isles[best].x - is.x, isles[best].z - is.z)) best = k
    return best
  }
  isles.forEach((is, i) => {
    if (is.role === 'port' || is.role === 'homes') links.push([nearestRing(is), i])
  })
  const piers = links.map(([i, j]) => {
    const A = isles[i], B = isles[j]
    const a = Math.atan2(B.z - A.z, B.x - A.x)
    const ra = radius(A, a) * 0.86, rb = radius(B, a + Math.PI) * 0.86
    return { i, j, a, p0: { x: A.x + Math.cos(a) * ra, z: A.z + Math.sin(a) * ra }, p1: { x: B.x - Math.cos(a) * rb, z: B.z - Math.sin(a) * rb } }
  })
  for (const p of piers) pier(b, p.p0, p.p1)
  // which way the piers leave each island, so nothing is built across them
  const exits = isles.map((_, i) => piers.filter((p) => p.i === i || p.j === i).map((p) => (p.i === i ? p.a : p.a + Math.PI)))

  const taken: { x: number; z: number; r: number }[] = []
  const free = (x: number, z: number, rr: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + rr)
  const places: { key: string; kind: Parameters<CapitalCtx['place']>[1]; x: number; z: number; y: number }[] = []
  const trees: { x: number; z: number; y: number; s: number }[] = []
  const rocks: { x: number; z: number; y: number; s: number }[] = []
  const beacons: number[][] = []
  const moored: { x: number; z: number; a: number }[] = []

  // ── the hub: the governor's relay spire ──
  {
    const f = { x: 0, z: 0, rot: 0 }
    b.at(H).tint(GRANITE, '#9aa3a8')
    cylinder(b, f, H - 0.04, 2.3, 0.1, 18, 'trim')
    b.at(H).tint('#e9ecec', '#3d4b57')
    let y = cylinder(b, f, H + 0.06, 1.35, 0.95, 14, 'wall', true)
    y = cylinder(b, f, y, 1.45, 0.08, 14, 'roof')
    taken.push({ x: 0, z: 0, r: 2.5 })
    // a three-legged lattice mast
    const H0 = y, H1 = y + 8.6
    const legs = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + 0.3)
    const at = (i: number, yy: number) => {
      const k = (yy - H0) / (H1 - H0)
      const rr = 0.62 * (1 - k) + 0.14 * k
      return [Math.cos(legs[i]) * rr, yy, Math.sin(legs[i]) * rr]
    }
    b.at(H0).tint('#c9d0d4')
    for (let i = 0; i < 3; i++) strut(b, at(i, H0), at(i, H1), 0.035, 'wall')
    for (let yy = H0, n = 0; yy < H1 - 0.3; yy += 0.55, n++) for (let i = 0; i < 3; i++) b.edge(at(i, yy), at((i + 1) % 3, yy + 0.55))
    // platforms, dishes and the beacon
    for (const py of [H0 + 3.4, H0 + 6.0]) cylinder(b, f, py, 0.5 - (py - H0) * 0.03, 0.06, 10, 'trim')
    dish(b, [0.55, H0 + 3.9, 0.2], [1, 0.15, 0.3], 0.42)
    dish(b, [-0.35, H0 + 6.4, -0.3], [-0.6, 0.25, -0.7], 0.32)
    for (let i = 0; i < 4; i++) {
      const a0 = (i * Math.PI) / 2, a1 = a0 + Math.PI / 2
      b.tri([Math.cos(a0) * 0.16, H1, Math.sin(a0) * 0.16], [Math.cos(a1) * 0.16, H1, Math.sin(a1) * 0.16], [0, H1 + 0.35, 0], 'brand', 1)
      b.tri([Math.cos(a0) * 0.16, H1, Math.sin(a0) * 0.16], [Math.cos(a1) * 0.16, H1, Math.sin(a1) * 0.16], [0, H1 - 0.3, 0], 'brand', 1)
    }
    b.edge([0, H1 + 0.35, 0], [0, H1 + 1.2, 0])
    isles[0].mast = [0, H1 - 0.1, 0]
    beacons.push([0, H1 + 1.2, 0], [0.4, H0 + 6.05, 0])
    places.push({ key: 'tower', kind: 'tower', x: 0, z: 0, y: H1 + 0.6 })
  }

  for (const [idx, is] of isles.entries()) {
    if (is.role === 'hub') continue
    const out = Math.atan2(is.z, is.x) // away from the middle of the bay
    const inward = out + Math.PI
    const f = { x: is.x, z: is.z, rot: 0 }

    if (is.role === 'hall') {
      // the round hall, and its ring of flags
      b.at(H).tint(GRANITE)
      cylinder(b, f, H - 0.04, 2.55, 0.08, 20, 'trim')
      b.at(H).tint('#eef0ee', '#4f7193')
      const y = cylinder(b, f, H + 0.04, 1.45, 0.95, 16, 'wall', true)
      cone(b, is.x, is.z, y, 1.62, 0.95, 'roof')
      const ly = cylinder(b, { ...f }, y + 0.78, 0.2, 0.3, 8, 'trim')
      cone(b, is.x, is.z, ly, 0.26, 0.3, 'roof')
      const props = input.proposals.slice(0, 8)
      const n = 10
      for (let i = 0; i < n; i++) {
        const a = inward + (i / n) * Math.PI * 2
        const px = is.x + Math.cos(a) * 2.3, pz = is.z + Math.sin(a) * 2.3
        b.at(H).tint('#d5d9db')
        strut(b, [px, H, pz], [px, H + 1.7, pz], 0.02, 'wall')
        // the flag flies to one side; a live proposal's fills with green as far as its support
        const t = [-Math.sin(a), Math.cos(a)]
        const pr = props[i]
        const w = 0.52, h = 0.32, yt = H + 1.66
        const Pf = (u: number, v: number) => [px + t[0] * u, yt - v, pz + t[1] * u]
        if (pr) {
          const fill = Math.min(1, Math.max(0.05, pr.support))
          b.quad(Pf(0, 0), Pf(w * fill, 0), Pf(w * fill, h), Pf(0, h), 'brand')
          b.quad(Pf(w * fill, 0), Pf(w, 0), Pf(w, h), Pf(w * fill, h), 'canvas')
        } else b.tri(Pf(0, 0), Pf(w * 0.8, h / 2), Pf(0, h), 'roof')
      }
      taken.push({ x: is.x, z: is.z, r: 2.7 })
      is.mast = [is.x, ly + 0.3, is.z]
      places.push({ key: 'hall', kind: 'hall', x: is.x, z: is.z, y: ly + 0.6 })
    }

    if (is.role === 'vault') {
      // a granite sea fort: a round wall, and the keep banded with light
      b.at(H).tint(GRANITE, '#7d8079')
      let y = cylinder(b, f, H - 0.3, 2.2, 0.95, 20, 'roof')
      for (let i = 0; i < 20; i++) {
        if (i % 2) continue
        const a = (i / 20) * Math.PI * 2
        box(b, { x: is.x + Math.cos(a) * 2.08, z: is.z + Math.sin(a) * 2.08, rot: a + Math.PI / 2 }, y, 0.2, 0.1, 0.2, { roof: 'roof', windows: false, edges: false })
      }
      b.at(y).tint('#a3a59e', '#3d4b57')
      const yb = y
      y = cylinder(b, f, y, 1.15, 1.15, 16, 'wall')
      const fill = Math.min(1, Math.max(0.08, input.runway / 24))
      const lo = yb + 0.16, hi = yb + 0.16 + (1.15 - 0.32) * fill
      for (let i = 0; i < 16; i++) {
        if (i % 2) continue
        const q0 = (i / 16) * Math.PI * 2, q1 = ((i + 0.8) / 16) * Math.PI * 2
        const A = [is.x + Math.cos(q0) * 1.165, lo, is.z + Math.sin(q0) * 1.165], B = [is.x + Math.cos(q1) * 1.165, lo, is.z + Math.sin(q1) * 1.165]
        b.tri(A, B, [B[0], hi, B[2]], 'lamp', 1)
        b.tri(A, [B[0], hi, B[2]], [A[0], hi, A[2]], 'lamp', 1)
      }
      y = cylinder(b, f, y, 1.25, 0.1, 16, 'trim')
      dome(b, f, y, 0.95, 'roof')
      const fy = y + 0.95
      b.edge([is.x, fy, is.z], [is.x, fy + 1.1, is.z])
      b.tri([is.x, fy + 1.1, is.z], [is.x + 0.45, fy + 0.98, is.z], [is.x, fy + 0.86, is.z], 'brand')
      taken.push({ x: is.x, z: is.z, r: 2.5 })
      is.mast = [is.x, fy + 1.0, is.z]
      places.push({ key: 'vault', kind: 'vault', x: is.x, z: is.z, y: fy + 0.5 })
    }

    if (is.role === 'market') {
      // the job wharf: a deck on stilts over the water, a stall for each open job, and the shed behind
      const a = inward + 0.75
      const e = radius(is, a) * 0.8
      const p0 = { x: is.x + Math.cos(a) * e, z: is.z + Math.sin(a) * e }
      const L = 2.6
      const p1 = { x: p0.x + Math.cos(a) * L, z: p0.z + Math.sin(a) * L }
      const t = [-Math.sin(a), Math.cos(a)]
      b.at(BED).tint(TIMBER, '#9a8a74')
      const W2 = 0.85
      const c = [[p0.x + t[0] * W2, p0.z + t[1] * W2], [p1.x + t[0] * W2, p1.z + t[1] * W2], [p1.x - t[0] * W2, p1.z - t[1] * W2], [p0.x - t[0] * W2, p0.z - t[1] * W2]]
      b.quad([c[0][0], top + DECK, c[0][1]], [c[1][0], top + DECK, c[1][1]], [c[2][0], top + DECK, c[2][1]], [c[3][0], top + DECK, c[3][1]], 'roof')
      for (let i = 0; i < 4; i++) b.edge([c[i][0], top + DECK, c[i][1]], [c[(i + 1) % 4][0], top + DECK, c[(i + 1) % 4][1]])
      for (let k = 0; k <= 4; k++)
        for (const sd of [-1, 1]) {
          const x = p0.x + (p1.x - p0.x) * (k / 4) + t[0] * W2 * sd * 0.9, z = p0.z + (p1.z - p0.z) * (k / 4) + t[1] * W2 * sd * 0.9
          strut(b, [x, BED, z], [x, top + DECK, z], 0.04, 'wall')
        }
      const n = Math.max(2, Math.min(8, input.jobs.length))
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1
        const k = (Math.floor(i / 2) + 0.6) / (Math.ceil(n / 2) + 0.2)
        const x = p0.x + (p1.x - p0.x) * k + t[0] * 0.48 * side, z = p0.z + (p1.z - p0.z) * k + t[1] * 0.48 * side
        const sf = { x, z, rot: a }
        b.at(top + DECK)
        const st = box(b, sf, top + DECK, 0.24, 0.2, 0.28, { windows: false })
        const Q = (u: number, v: number, hy: number) => [x + Math.cos(a) * u + t[0] * v * side, hy, z + Math.sin(a) * u + t[1] * v * side]
        b.quad(Q(-0.28, -0.3, st + 0.2), Q(0.28, -0.3, st + 0.2), Q(0.28, 0.12, st), Q(-0.28, 0.12, st), i % 3 === 0 ? 'brand' : 'canvas')
      }
      // the shed, its long side to the wharf
      const sp = { x: is.x + Math.cos(a) * (e - 1.2), z: is.z + Math.sin(a) * (e - 1.2), rot: a + Math.PI / 2 }
      b.at(H).tint('#e6eaeb', '#4f7193')
      const sy = box(b, sp, H, 1.35, 0.6, 0.85)
      gable(b, sp, sy, 1.4, 0.65, 0.5)
      taken.push({ x: sp.x, z: sp.z, r: 1.5 }, { x: p0.x, z: p0.z, r: 1.0 })
      const mp = { x: is.x - Math.cos(a) * 1.4, z: is.z - Math.sin(a) * 1.4 }
      is.mast = mastAt(b, mp.x, mp.z, H, 3.2, beacons)
      taken.push({ x: mp.x, z: mp.z, r: 0.5 })
      const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 }
      places.push({ key: 'market', kind: 'market', x: mid.x, z: mid.z, y: top + DECK + 1.0 })
    }

    if (is.role === 'app' && is.app !== undefined && is.app < input.apps.length) {
      // a relay station: a tall house, and a mast with this app's own antenna
      const i = is.app
      const hp = { x: is.x + Math.cos(inward) * 0.6, z: is.z + Math.sin(inward) * 0.6, rot: inward + Math.PI / 2 }
      b.at(H).tint(['#eef0ee', '#d3dce1', '#e8e2d2', '#c3d0d8'][i % 4], '#3d4b57')
      const hy = box(b, hp, H, 0.95, 0.65, 1.55)
      gable(b, hp, hy, 1.0, 0.7, 0.6)
      // a green band along the front, where the name would be
      const c = Math.cos(hp.rot), s = Math.sin(hp.rot)
      const P = (u: number, v: number, yy: number) => [hp.x + u * c - v * s, yy, hp.z + u * s + v * c]
      b.quad(P(-0.7, 0.665, hy - 0.42), P(0.7, 0.665, hy - 0.42), P(0.7, 0.665, hy - 0.26), P(-0.7, 0.665, hy - 0.26), 'brand')
      const mp = { x: is.x + Math.cos(out) * 0.9, z: is.z + Math.sin(out) * 0.9 }
      const mh = 4.2 + (i % 2) * 0.8
      b.at(H).tint('#c9d0d4', '#e9ecec')
      strut(b, [mp.x, H, mp.z], [mp.x, H + mh, mp.z], 0.07, 'wall')
      const ty = H + mh
      if (i % 4 === 0) dish(b, [mp.x, ty - 0.2, mp.z], [Math.cos(inward), 0.35, Math.sin(inward)], 0.55)
      else if (i % 4 === 1) {
        // a halo ring
        for (let k = 0; k < 16; k++) {
          const q0 = (k / 16) * Math.PI * 2, q1 = ((k + 1) / 16) * Math.PI * 2
          b.edge([mp.x + Math.cos(q0) * 0.5, ty - 0.3, mp.z + Math.sin(q0) * 0.5], [mp.x + Math.cos(q1) * 0.5, ty - 0.3, mp.z + Math.sin(q1) * 0.5])
          b.edge([mp.x + Math.cos(q0) * 0.36, ty - 0.05, mp.z + Math.sin(q0) * 0.36], [mp.x + Math.cos(q1) * 0.36, ty - 0.05, mp.z + Math.sin(q1) * 0.36])
        }
        for (let k = 0; k < 4; k++) {
          const q = (k / 4) * Math.PI * 2
          b.edge([mp.x, ty - 0.3, mp.z], [mp.x + Math.cos(q) * 0.5, ty - 0.3, mp.z + Math.sin(q) * 0.5])
        }
      } else if (i % 4 === 2) {
        // a crossbar of horns
        const t = [-Math.sin(out), Math.cos(out)]
        b.edge([mp.x - t[0] * 0.6, ty - 0.2, mp.z - t[1] * 0.6], [mp.x + t[0] * 0.6, ty - 0.2, mp.z + t[1] * 0.6])
        for (const u of [-0.55, 0, 0.55]) cone(b, mp.x + t[0] * u, mp.z + t[1] * u, ty - 0.2, 0.09, 0.35, 'roof')
      } else {
        // a radome
        dome(b, { x: mp.x, z: mp.z, rot: 0 }, ty - 0.2, 0.42, 'roof')
        dome(b, { x: mp.x, z: mp.z, rot: 0 }, ty - 0.2, -0.42, 'roof')
      }
      b.edge([mp.x, ty, mp.z], [mp.x, ty + 0.7, mp.z])
      beacons.push([mp.x, ty + 0.7, mp.z])
      is.mast = [mp.x, ty, mp.z]
      taken.push({ x: hp.x, z: hp.z, r: 1.25 }, { x: mp.x, z: mp.z, r: 0.5 })
      places.push({ key: input.apps[i].key, kind: 'app', x: mp.x, z: mp.z, y: ty + 0.4 })
    } else if (is.role === 'app') {
      is.mast = mastAt(b, is.x, is.z, H, 3.0, beacons)
      taken.push({ x: is.x, z: is.z, r: 0.5 })
    }

    if (is.role === 'port') {
      // the launch pad on the rocks, the ship and its gantry, a crane over the landing
      const p = { x: is.x + Math.cos(out) * 0.3, z: is.z + Math.sin(out) * 0.3 }
      b.at(H).tint(undefined, '#9aa3a8')
      const pad = cylinder(b, { ...p, rot: 0 }, H - 0.04, 1.75, 0.14, 26, 'roof')
      for (let i = 0; i < 28; i++) {
        const q0 = (i / 28) * Math.PI * 2, q1 = ((i + 1) / 28) * Math.PI * 2
        b.edge([p.x + Math.cos(q0) * 1.25, pad + 0.005, p.z + Math.sin(q0) * 1.25], [p.x + Math.cos(q1) * 1.25, pad + 0.005, p.z + Math.sin(q1) * 1.25])
      }
      b.at(pad).tint('#eef0ee')
      let sy = cylinder(b, { ...p, rot: 0 }, pad, 0.32, 1.9, 12, 'wall', true)
      sy = cylinder(b, { ...p, rot: 0 }, sy, 0.34, 0.1, 12, 'trim')
      for (let i = 0; i < 12; i++) {
        const q0 = (i / 12) * Math.PI * 2, q1 = ((i + 1) / 12) * Math.PI * 2
        b.tri([p.x + Math.cos(q0) * 0.32, sy, p.z + Math.sin(q0) * 0.32], [p.x + Math.cos(q1) * 0.32, sy, p.z + Math.sin(q1) * 0.32], [p.x, sy + 0.8, p.z], 'brand')
      }
      for (let i = 0; i < 3; i++) {
        const q = (i / 3) * Math.PI * 2 + 0.5
        b.tri([p.x + Math.cos(q) * 0.3, pad + 0.6, p.z + Math.sin(q) * 0.3], [p.x + Math.cos(q) * 0.74, pad, p.z + Math.sin(q) * 0.74], [p.x + Math.cos(q) * 0.3, pad, p.z + Math.sin(q) * 0.3], 'roof')
      }
      const g = { x: p.x + Math.cos(inward + 1.3) * 1.05, z: p.z + Math.sin(inward + 1.3) * 1.05 }
      b.at(pad).tint('#c9d0d4')
      for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) strut(b, [g.x + i * 0.16, pad, g.z + k * 0.16], [g.x + i * 0.16, pad + 2.6, g.z + k * 0.16], 0.025, 'wall')
      for (let gy = pad + 0.4; gy < pad + 2.6; gy += 0.5) {
        b.edge([g.x - 0.16, gy, g.z - 0.16], [g.x + 0.16, gy + 0.5, g.z - 0.16])
        b.edge([g.x + 0.16, gy, g.z + 0.16], [g.x - 0.16, gy + 0.5, g.z + 0.16])
      }
      beacons.push([g.x, pad + 2.75, g.z])
      is.mast = [g.x, pad + 2.6, g.z]
      taken.push({ x: p.x, z: p.z, r: 2.0 }, { x: g.x, z: g.z, r: 0.4 })
      places.push({ key: 'port', kind: 'port', x: p.x, z: p.z, y: sy + 0.8 })
    }

    if (is.role === 'light') {
      // the lighthouse: a white tower with one red band, a gallery and the lamp
      b.at(H).tint('#f2f2ee', '#3d4b57')
      let y = taper(b, is.x, is.z, H, 0.6, 0.48, 1.4, 'wall')
      b.tint('#a8473a')
      y = taper(b, is.x, is.z, y, 0.48, 0.44, 0.45, 'wall')
      b.tint('#f2f2ee')
      y = taper(b, is.x, is.z, y, 0.44, 0.38, 1.0, 'wall')
      y = cylinder(b, f, y, 0.58, 0.07, 14, 'trim')
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2
        b.edge([is.x + Math.cos(a0) * 0.56, y + 0.2, is.z + Math.sin(a0) * 0.56], [is.x + Math.cos(a1) * 0.56, y + 0.2, is.z + Math.sin(a1) * 0.56])
      }
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2
        const A = [is.x + Math.cos(a0) * 0.3, y, is.z + Math.sin(a0) * 0.3], B = [is.x + Math.cos(a1) * 0.3, y, is.z + Math.sin(a1) * 0.3]
        b.tri(A, B, [B[0], y + 0.42, B[2]], 'lamp', 1)
        b.tri(A, [B[0], y + 0.42, B[2]], [A[0], y + 0.42, A[2]], 'lamp', 1)
      }
      cone(b, is.x, is.z, y + 0.42, 0.38, 0.4, 'roof')
      taken.push({ x: is.x, z: is.z, r: 0.9 })
    }

    // houses round the shore, gables to the water; some boathouses out over it on stilts
    const step = 0.92 / is.R
    for (let a = r() * Math.PI * 2, end = a + Math.PI * 2; a < end; a += step * (0.85 + r() * 0.4)) {
      if (exits[idx].some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) < 0.95 / Math.sqrt(is.R))) continue
      const rr = radius(is, a)
      const boat = r() < 0.28 && is.role !== 'light'
      const d = boat ? rr + 0.15 : rr - 1.05
      const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d
      const w = 0.28 + r() * 0.1, dp = boat ? 0.42 : 0.4
      if (!free(x, z, Math.max(w, dp) + 0.12)) continue
      if (!boat && rr - 1.05 < 0.9) continue
      taken.push({ x, z, r: Math.max(w, dp) + 0.05 })
      // the house's second axis points out to the water
      const hf = { x, z, rot: a - Math.PI / 2 }
      if (boat) {
        b.at(BED).tint(pick(['#8a3b2f', '#6d8494', '#e6eaeb', '#7a6a58']), pick(ROOFS))
        for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const c = Math.cos(hf.rot), s = Math.sin(hf.rot)
          const px = x + (i * w * 0.85 * c - k * dp * 0.85 * s), pz = z + (i * w * 0.85 * s + k * dp * 0.85 * c)
          strut(b, [px, BED, pz], [px, top + DECK, pz], 0.03, 'wall')
        }
        const y = box(b, hf, top + DECK, w, dp, 0.5, { windows: false })
        gable(b, { ...hf, rot: hf.rot + Math.PI / 2 }, y, dp, w, w * 1.3)
        moored.push({ x: x + Math.cos(a) * (dp + 0.45), z: z + Math.sin(a) * (dp + 0.45), a: a + Math.PI / 2 })
      } else {
        b.at(H).tint(pick(WALLS), pick(ROOFS))
        const y = box(b, hf, H, w, dp, 0.62 + r() * 0.45)
        gable(b, { ...hf, rot: hf.rot + Math.PI / 2 }, y, dp, w, w * (1.2 + r() * 0.5))
      }
    }

    // pines in the rock, and boulders at the water's edge
    const nT = Math.round(is.R * is.R * 0.45)
    for (let k = 0, tries = 0; k < nT && tries < 200; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius(is, a) * 0.78
      const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d
      if (!free(x, z, 0.35)) continue
      taken.push({ x, z, r: 0.3 })
      trees.push({ x, z, y: H, s: 0.7 + r() * 0.5 })
      k++
    }
    for (let k = 0; k < Math.round(is.R * 1.4); k++) {
      const a = r() * Math.PI * 2, d = radius(is, a) * (0.9 + r() * 0.12)
      const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d
      if (exits[idx].some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) < 0.5)) continue
      rocks.push({ x, z, y: WATER + 0.25, s: 0.35 + r() * 0.4 })
    }
  }

  // pines along the hills round the bay
  for (let k = 0; k < 110; k++) {
    const a = r() * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - MOUTH), Math.cos(a - MOUTH))) < 0.6) continue
    const d = 40 + r() * 7
    trees.push({ ...polar(a, d), y: top + HILL, s: 0.8 + r() * 0.6 })
  }

  // the cables: from the spire to every island's mast, sagging a little
  const hub = isles[0].mast!
  const cables = isles.filter((is) => is.mast && is.role !== 'hub').map((is) => is.mast!)
  const curve = (c: number[], t: number) => {
    const len = Math.hypot(c[0] - hub[0], c[2] - hub[2])
    return [hub[0] + (c[0] - hub[0]) * t, hub[1] + (c[1] - hub[1]) * t - Math.sin(Math.PI * t) * len * 0.06, hub[2] + (c[2] - hub[2]) * t]
  }
  for (const c of cables) for (let k = 0; k < 16; k++) b.edge(curve(c, k / 16), curve(c, (k + 1) / 16))

  const group = b.build(ctx.shared)
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  for (const p of places) ctx.place(p.key, p.kind, p.x, p.y, p.z)

  // pines and boulders
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0)
  const pineGeo = mergeGeometries([new THREE.CylinderGeometry(0.05, 0.07, 0.5, 5).translate(0, 0.25, 0).toNonIndexed(), new THREE.ConeGeometry(0.42, 1.3, 7).translate(0, 1.05, 0).toNonIndexed(), new THREE.ConeGeometry(0.3, 0.9, 7).translate(0, 1.55, 0).toNonIndexed()].map((g) => {
    g.deleteAttribute('uv')
    return g
  }))
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length)
  const greens = ['#3f6a50', '#46745a', '#365f48', '#4f7a5c']
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, r() * Math.PI * 2)
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + r() * 0.3), t.s))
    pines.setMatrixAt(i, m)
    pines.setColorAt(i, col.set(greens[i % greens.length]).multiplyScalar(0.9 + r() * 0.2))
  })
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0).scale(1, 0.6, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), rocks.length)
  rocks.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(r(), r() * 6, r()))
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s))
    boulders.setMatrixAt(i, m)
    boulders.setColorAt(i, col.set(GRANITE).multiplyScalar(0.8 + r() * 0.3))
  })
  for (const im of [pines, boulders]) {
    im.castShadow = true
    im.receiveShadow = true
  }

  // the red lights on the masts, which blink all night
  const lights = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ff5a46', toneMapped: false }), beacons.length)
  beacons.forEach((p, i) => {
    m.makeTranslation(p[0], p[1], p[2])
    lights.setMatrixAt(i, m)
  })
  lights.frustumCulled = false

  // proofs: a bead of light down every cable
  const MAXB = 4
  const beads = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#c4ef3a', toneMapped: false, transparent: true }), cables.length * MAXB)
  beads.frustumCulled = false
  beads.visible = false
  const bursts: number[] = []

  // boats: ferries round the inner bay, sail round the outer channel, a few out through the mouth
  const ferryGeo = boatGeometry(false), sailGeo = boatGeometry(true)
  type Boat = { lane: (d: number) => { x: number; z: number; a: number }; d: number; speed: number; dir: number; loop: boolean; sail: boolean }
  const loop = (R: number, cw: boolean) => (d: number) => {
    const a = (cw ? -1 : 1) * d * Math.PI * 2 + 0.4
    return { x: Math.cos(a) * R, z: Math.sin(a) * R, a: a + (cw ? -Math.PI / 2 : Math.PI / 2) }
  }
  const outLane = (side: number) => (d: number) => {
    const dd = IN_LOOP + d * 62
    const off = side * 0.7
    return { x: Math.cos(MOUTH) * dd - Math.sin(MOUTH) * off, z: Math.sin(MOUTH) * dd + Math.cos(MOUTH) * off, a: MOUTH }
  }
  const boats: Boat[] = [
    { lane: loop(IN_LOOP, false), d: 0, speed: 0.5, dir: 1, loop: true, sail: false },
    { lane: loop(IN_LOOP, false), d: 0.5, speed: 0.5, dir: 1, loop: true, sail: false },
    { lane: loop(OUT_LOOP, true), d: 0.1, speed: 0.45, dir: 1, loop: true, sail: true },
    { lane: loop(OUT_LOOP, true), d: 0.45, speed: 0.45, dir: 1, loop: true, sail: true },
    { lane: loop(OUT_LOOP, true), d: 0.75, speed: 0.55, dir: 1, loop: true, sail: false },
    { lane: outLane(1), d: 0.2, speed: 0.6, dir: 1, loop: false, sail: true },
    { lane: outLane(-1), d: 0.7, speed: 0.6, dir: -1, loop: false, sail: false },
  ]
  const ferries = new THREE.InstancedMesh(ferryGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), boats.filter((x) => !x.sail).length + Math.min(moored.length, 8))
  const sails = new THREE.InstancedMesh(sailGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), boats.filter((x) => x.sail).length)
  for (const im of [ferries, sails]) {
    im.castShadow = true
    im.frustumCulled = false
  }
  const lens = boats.map((bt) => (bt.loop ? Math.PI * 2 * Math.hypot(bt.lane(0).x, bt.lane(0).z) : 62))
  const placeBoats = () => {
    let fi = 0, si = 0
    boats.forEach((bt) => {
      const p = bt.lane(bt.d)
      q.setFromAxisAngle(up, -(bt.dir > 0 ? p.a : p.a + Math.PI))
      m.compose(new THREE.Vector3(p.x, top + WATER, p.z), q, new THREE.Vector3(1, 1, 1))
      if (bt.sail) sails.setMatrixAt(si++, m)
      else ferries.setMatrixAt(fi++, m)
    })
    ferries.instanceMatrix.needsUpdate = true
    sails.instanceMatrix.needsUpdate = true
  }
  {
    let fi = boats.filter((x) => !x.sail).length
    for (const mb of moored.slice(0, 8)) {
      q.setFromAxisAngle(up, -mb.a)
      m.compose(new THREE.Vector3(mb.x, top + WATER, mb.z), q, new THREE.Vector3(0.8, 0.8, 0.8))
      ferries.setMatrixAt(fi++, m)
    }
  }
  placeBoats()

  // the ground: hills round a deep bay, open to the sea at the mouth; islands of granite in it
  const plan = drawPlan(90, 1024, 0, { water: 0.3, weight: 10, height: 0.65 }, (p) => {
    p.weight.fillStyle = '#fff'
    p.weight.beginPath()
    p.weight.arc(0, 0, 60, 0, Math.PI * 2)
    p.weight.fill()
    p.water.fillStyle = '#fff'
    p.water.beginPath()
    p.water.arc(0, 0, 80, 0, Math.PI * 2)
    p.water.fill()
    // the bay: deep in the middle, shelving up to the hills
    const g = p.height.createRadialGradient(0, 0, 30, 0, 0, 39)
    g.addColorStop(0, p.grey(BED))
    g.addColorStop(0.55, p.grey(-0.2))
    g.addColorStop(1, p.grey(HILL))
    p.height.fillStyle = g
    p.height.fillRect(-90, -90, 180, 180)
    // the mouth, out to the open sea
    for (let k = 0; k < 6; k++) {
      p.height.strokeStyle = p.grey(HILL - ((k + 1) / 6) * (HILL - BED))
      p.height.lineWidth = 22 - k * 2.4
      p.height.lineCap = 'round'
      p.height.beginPath()
      p.height.moveTo(Math.cos(MOUTH) * 18, Math.sin(MOUTH) * 18)
      p.height.lineTo(Math.cos(MOUTH) * 95, Math.sin(MOUTH) * 95)
      p.height.stroke()
    }
    // a shallow shelf round each island, then the island
    const shape = (ctx2: CanvasRenderingContext2D, is: Isle, k: number) => {
      ctx2.beginPath()
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2
        const rr = radius(is, a) * k
        const x = is.x + Math.cos(a) * rr, z = is.z + Math.sin(a) * rr
        if (i) ctx2.lineTo(x, z)
        else ctx2.moveTo(x, z)
      }
      ctx2.closePath()
    }
    for (const is of isles) {
      p.height.fillStyle = p.grey(-0.95)
      shape(p.height, { ...is, R: is.R + 1.1 }, 1)
      p.height.fill()
    }
    for (const is of isles) {
      p.height.fillStyle = p.grey(ISLE_H)
      shape(p.height, is, 1)
      p.height.fill()
      // moss on top, bare granite at the shore
      p.paint.globalAlpha = 0.75
      p.paint.fillStyle = '#8c8f87'
      shape(p.paint, { ...is, R: is.R + 0.6 }, 1)
      p.paint.fill()
      p.paint.globalAlpha = 0.6
      p.paint.fillStyle = '#6c8766'
      shape(p.paint, is, 0.8)
      p.paint.fill()
    }
    p.paint.globalAlpha = 1
  })

  // walkers: from island to island along the piers, the shortest way
  const nearest = (pt: Pt) => {
    let best = 0
    isles.forEach((is, i) => {
      if (Math.hypot(is.x - pt.x, is.z - pt.z) < Math.hypot(isles[best].x - pt.x, isles[best].z - pt.z)) best = i
    })
    return best
  }
  const hops = (a: number, c: number) => {
    const prev = new Map<number, { from: number; pier: (typeof piers)[number] }>()
    const seen = new Set([a])
    const queue = [a]
    while (queue.length) {
      const n = queue.shift()!
      if (n === c) break
      for (const p of piers) {
        const o = p.i === n ? p.j : p.j === n ? p.i : -1
        if (o < 0 || seen.has(o)) continue
        seen.add(o)
        prev.set(o, { from: n, pier: p })
        queue.push(o)
      }
    }
    const out: { from: number; to: number; pier: (typeof piers)[number] }[] = []
    for (let n = c; n !== a && prev.has(n); ) {
      const s = prev.get(n)!
      out.unshift({ from: s.from, to: n, pier: s.pier })
      n = s.from
    }
    return out
  }

  let night = 0
  let clock = 0
  return {
    objects: [group, pines, boulders, lights, beads, ferries, sails],
    mesa: 8,
    plan,
    pulse: { x: 0, z: 0, sides: 96, rot: 0 },
    route: (a, c) => {
      const ia = nearest(a), ic = nearest(c)
      const pts: Pt[] = [{ ...a, y: H }]
      for (const h of hops(ia, ic)) {
        const fwd = h.pier.i === h.from
        const e0 = fwd ? h.pier.p0 : h.pier.p1, e1 = fwd ? h.pier.p1 : h.pier.p0
        const A = isles[h.from], B = isles[h.to]
        pts.push({ x: A.x, z: A.z, y: H }, { ...e0, y: top + DECK }, { ...e1, y: top + DECK }, { x: B.x, z: B.z, y: H })
      }
      pts.push({ ...c, y: H })
      return pts
    },
    flash: () => {
      bursts.push(0)
      if (bursts.length > MAXB) bursts.shift()
    },
    setNight: (k) => {
      night = k
    },
    step: (dt, _t, still) => {
      clock += dt
      // the mast lights: two short blinks, then dark
      const ph = clock % 2.4
      const on = ph < 0.18 || (ph > 0.42 && ph < 0.6) ? 1 : 0.18
      ;(lights.material as THREE.MeshBasicMaterial).color.set('#ff5a46').multiplyScalar(on * (0.35 + night * 1.2))
      // beads run down the cables
      for (let i = bursts.length - 1; i >= 0; i--) {
        bursts[i] += dt / 1.8
        if (bursts[i] >= 1) bursts.splice(i, 1)
      }
      let k = 0
      for (const t of bursts) {
        const e = 1 - (1 - t) * (1 - t)
        for (const c of cables) {
          const p = curve(c, e)
          m.compose(new THREE.Vector3(p[0], p[1], p[2]), q.identity(), new THREE.Vector3(1, 1, 1).multiplyScalar(1 - t * 0.5))
          beads.setMatrixAt(k++, m)
        }
      }
      beads.count = k
      beads.visible = k > 0
      beads.instanceMatrix.needsUpdate = true
      if (!still) {
        for (const [i, bt] of boats.entries()) {
          bt.d += (bt.dir * dt * bt.speed * 0.6) / lens[i]
          if (bt.loop) bt.d = ((bt.d % 1) + 1) % 1
          else if (bt.d > 1 || bt.d < 0) {
            bt.dir *= -1
            bt.d = Math.min(1, Math.max(0, bt.d))
          }
        }
        placeBoats()
      }
      return !still || bursts.length > 0
    },
  }
}


// ── the parts ──

/** a slim relay mast with a light on top; returns where its cable ties on */
function mastAt(b: Builder, x: number, z: number, y0: number, h: number, beacons: number[][]) {
  b.at(y0).tint('#c9d0d4')
  strut(b, [x, y0, z], [x, y0 + h, z], 0.05, 'wall')
  b.edge([x - 0.3, y0 + h - 0.4, z], [x + 0.3, y0 + h - 0.4, z])
  b.edge([x, y0 + h - 0.4, z - 0.3], [x, y0 + h - 0.4, z + 0.3])
  beacons.push([x, y0 + h + 0.08, z])
  return [x, y0 + h - 0.1, z]
}

/** a timber pier on posts from one shore to another */
function pier(b: Builder, a: Pt, c: Pt) {
  const len = Math.hypot(c.x - a.x, c.z - a.z)
  const dx = (c.x - a.x) / len, dz = (c.z - a.z) / len
  const nx = -dz * 0.3, nz = dx * 0.3
  b.at(BED).tint(TIMBER, '#9a8a74')
  const y = DECK
  b.quad([a.x + nx, y, a.z + nz], [c.x + nx, y, c.z + nz], [c.x - nx, y, c.z - nz], [a.x - nx, y, a.z - nz], 'roof')
  b.quad([a.x + nx, y - 0.08, a.z + nz], [c.x + nx, y - 0.08, c.z + nz], [c.x + nx, y, c.z + nz], [a.x + nx, y, a.z + nz], 'wall')
  b.quad([a.x - nx, y - 0.08, a.z - nz], [c.x - nx, y - 0.08, c.z - nz], [c.x - nx, y, c.z - nz], [a.x - nx, y, a.z - nz], 'wall')
  // rails
  b.edge([a.x + nx, y + 0.2, a.z + nz], [c.x + nx, y + 0.2, c.z + nz])
  b.edge([a.x - nx, y + 0.2, a.z - nz], [c.x - nx, y + 0.2, c.z - nz])
  for (let s = 0; s <= len; s += 1.1) {
    const px = a.x + dx * s, pz = a.z + dz * s
    for (const sd of [1, -1]) {
      strut(b, [px + nx * sd, BED, pz + nz * sd], [px + nx * sd, y, pz + nz * sd], 0.035, 'wall')
      b.edge([px + nx * sd, y, pz + nz * sd], [px + nx * sd, y + 0.2, pz + nz * sd])
    }
  }
}

/** a small boat: a ferry with a wheelhouse, or a sailing boat with a mast and a white sail */
function boatGeometry(sail: boolean) {
  const s = new THREE.Shape()
  s.moveTo(-0.42, -0.14)
  s.lineTo(0.2, -0.14)
  s.quadraticCurveTo(0.42, -0.1, 0.5, 0)
  s.quadraticCurveTo(0.42, 0.1, 0.2, 0.14)
  s.lineTo(-0.42, 0.14)
  s.closePath()
  const hull = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.04, 0)
  const tint = (g: THREE.BufferGeometry, hex: string) => {
    const gg = g.index ? g.toNonIndexed() : g
    const n = gg.getAttribute('position').count
    const c = new THREE.Color(hex)
    gg.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3))
    if (gg.getAttribute('uv')) gg.deleteAttribute('uv')
    return gg
  }
  const parts = [tint(hull, sail ? '#f1f2ef' : '#3d4b57')]
  if (sail) {
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0.08, 0.1, 0, -0.38, 0.12, 0, 0.08, 1.05, 0], 3))
    tri.computeVertexNormals()
    parts.push(tint(tri, '#f6f4ee'), tint(new THREE.BoxGeometry(0.03, 1.0, 0.03).translate(0.08, 0.6, 0), '#6b5d4f'))
  } else parts.push(tint(new THREE.BoxGeometry(0.24, 0.16, 0.2).translate(-0.12, 0.18, 0), '#eef0ee'))
  const g = mergeGeometries(parts)
  g.computeVertexNormals()
  return g
}
