import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { Builder, box, cylinder, dome, house, lantern, signature } from '../kit'
import { curve, type Capital, type CapitalCtx } from '../capital'

/*
  The first capital, and still the one for worlds that have not yet grown a city of their
  own: laid out round a plaza.

  - the governor's tower in the middle, which sends a ring out across the city with
    every proof it publishes;
  - the world's apps, each a landmark in its own architecture, in a ring round the plaza;
  - the treasury vault, a domed drum with a lit band that shows its runway;
  - the assembly hall, with a banner for each live proposal, filled as far as it has
    support;
  - the market, a stall for every open job;
  - the spaceport at the edge, where the chain is: a pad and a ship.

  Houses, lamps and trees fill the rest. A gas giant has no ground to stand on, so its
  capital is a station: a deck floating above the cloud bands.
*/

/** the flat ground the city stands on */
const CITY_R = 20

/** what grows on each kind of world (a volcanic one has rocks instead) */
const FLORA: Record<Template, { kind: 'broad' | 'pine' | 'shrub' | 'rock'; colors: string[]; n: number }> = {
  defi: { kind: 'broad', colors: ['#6f9a4a', '#7fa955', '#8db35c'], n: 46 },
  agents: { kind: 'pine', colors: ['#3f6f52', '#4b7d5a', '#365f48'], n: 40 },
  game: { kind: 'rock', colors: ['#3b302b', '#4a3d36', '#2f2724'], n: 34 },
  creator: { kind: 'broad', colors: ['#4f8f3e', '#5f9f47', '#73b04f'], n: 56 },
  prediction: { kind: 'shrub', colors: ['#6c7fb8', '#8090c4', '#5f71a8'], n: 14 },
  frontier: { kind: 'shrub', colors: ['#a08a55', '#8f7c4a', '#b29a62'], n: 24 },
}

export function classic(ctx: CapitalCtx): Capital {
const { input, r } = ctx
let flora: THREE.InstancedMesh | null = null
  const t = input.template
  const top = ctx.top
  const b = new Builder(r, t)
  b.lit = 0.45 + input.lit * 0.45
  const g = () => top
  const used: { x: number; z: number; s: number }[] = []
  const roads: { ax: number; az: number; bx: number; bz: number }[] = []
  const take = (x: number, z: number, s: number) => used.push({ x, z, s })
  const clear = (x: number, z: number, s: number) =>
    Math.hypot(x, z) < CITY_R - s - 0.4 &&
    !used.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 1.08) &&
    !roads.some((rd) => segDist(x, z, rd) < s + 0.55)
  const at = (a: number, d: number) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d })
  const place = ctx.place

  // a station is a deck; anywhere else, the plaza is paved on the mesa
  if (ctx.station) {
    b.at(top - 1.2)
    cylinder(b, { x: 0, z: 0, rot: 0 }, top - 1.2, CITY_R + 2.4, 1.2, 48, 'trim')
    cylinder(b, { x: 0, z: 0, rot: 0 }, top - 2.6, CITY_R - 3, 1.4, 40, 'wall')
    cylinder(b, { x: 0, z: 0, rot: 0 }, top - 4.4, CITY_R - 9, 1.8, 32, 'wall')
    cylinder(b, { x: 0, z: 0, rot: 0 }, top - 7.4, 3, 3, 16, 'trim')
    // the rail round the edge, with lamps
    const R = CITY_R + 2.3
    for (let i = 0; i < 72; i++) {
      const a0 = (i / 72) * Math.PI * 2, a1 = ((i + 1) / 72) * Math.PI * 2
      b.edge([Math.cos(a0) * R, top + 0.45, Math.sin(a0) * R], [Math.cos(a1) * R, top + 0.45, Math.sin(a1) * R])
      if (i % 3 === 0) b.edge([Math.cos(a0) * R, top, Math.sin(a0) * R], [Math.cos(a0) * R, top + 0.45, Math.sin(a0) * R])
      if (i % 9 === 0) {
        const p = [Math.cos(a0) * R, top + 0.5, Math.sin(a0) * R]
        b.tri([p[0] - 0.08, p[1], p[2]], [p[0] + 0.08, p[1], p[2]], [p[0], p[1] + 0.16, p[2]], 'lamp', 1)
      }
    }
    // masts hanging below
    b.edge([0, top - 7.4, 0], [0, top - 13, 0])
  }
  b.at(top - 0.04)
  cylinder(b, { x: 0, z: 0, rot: 0 }, top - 0.04, 3.8, 0.1, 40, 'trim')
  take(0, 0, 3.8)
  for (const rad of [2.7, 1.6]) for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2
    b.edge([Math.cos(a0) * rad, top + 0.065, Math.sin(a0) * rad], [Math.cos(a1) * rad, top + 0.065, Math.sin(a1) * rad])
  }

  // the governor's tower, in the middle of the plaza
  b.at(top + 0.06)
  let y = cylinder(b, { x: 0, z: 0, rot: 0 }, top + 0.06, 0.95, 0.45, 12, 'trim')
  y = cylinder(b, { x: 0, z: 0, rot: 0 }, y, 0.46, 3.6, 10, 'wall', true)
  y = cylinder(b, { x: 0, z: 0, rot: 0 }, y, 0.62, 0.1, 12, 'roof')
  y = cylinder(b, { x: 0, z: 0, rot: 0 }, y, 0.34, 1.5, 10, 'wall', true)
  // the crown: glass that glows, a cap, a mast
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2
    const p0 = [Math.cos(a0) * 0.4, y, Math.sin(a0) * 0.4], p1 = [Math.cos(a1) * 0.4, y, Math.sin(a1) * 0.4]
    b.tri(p0, p1, [p1[0], y + 0.55, p1[2]], 'brand', 1)
    b.tri(p0, [p1[0], y + 0.55, p1[2]], [p0[0], y + 0.55, p0[2]], 'brand', 1)
  }
  y = cylinder(b, { x: 0, z: 0, rot: 0 }, y + 0.55, 0.5, 0.08, 12, 'roof')
  b.edge([0, y, 0], [0, y + 1.6, 0])
  place('tower', 'tower', 0, y + 0.3, 0)

  // where each part of the world stands: civic places on an outer ring, apps on an inner one
  const a0 = r() * Math.PI * 2
  const civic = { vault: a0, hall: a0 + (Math.PI * 2) / 3, market: a0 + (Math.PI * 4) / 3 }
  const portA = a0 + Math.PI * 0.33
  const avenue = (a: number, d: number) => roads.push({ ax: Math.cos(a) * 3.8, az: Math.sin(a) * 3.8, bx: Math.cos(a) * d, bz: Math.sin(a) * d })
  for (const a of Object.values(civic)) avenue(a, 12.2)
  avenue(portA, 15.6)

  // the treasury vault: a drum with a lit band that rises with its runway, under a dome
  {
    const p = at(civic.vault, 13.2)
    take(p.x, p.z, 2.2)
    b.at(top)
    const f = { x: p.x, z: p.z, rot: civic.vault }
    let vy = cylinder(b, f, top, 1.7, 0.3, 20, 'trim')
    const drum = 1.25
    const yb = vy
    vy = cylinder(b, f, vy, 1.3, drum, 18, 'wall')
    // the band: lit glass to the height the runway reaches (two years fills it)
    const fill = Math.min(1, Math.max(0.08, input.runway / 24))
    for (let i = 0; i < 18; i++) {
      const q0 = (i / 18) * Math.PI * 2, q1 = ((i + 1) / 18) * Math.PI * 2
      const rr = 1.315
      const lo = yb + 0.12, hi = yb + 0.12 + (drum - 0.24) * fill
      const A = [p.x + Math.cos(q0) * rr, lo, p.z + Math.sin(q0) * rr], B = [p.x + Math.cos(q1) * rr, lo, p.z + Math.sin(q1) * rr]
      if (i % 3 !== 1) {
        b.tri(A, B, [B[0], hi, B[2]], 'lamp', 1)
        b.tri(A, [B[0], hi, B[2]], [A[0], hi, A[2]], 'lamp', 1)
      }
    }
    vy = cylinder(b, f, vy, 1.42, 0.12, 20, 'trim')
    dome(b, f, vy, 1.3, 'roof')
    place('vault', 'vault', p.x, vy + 1.3, p.z)
  }

  // the assembly hall: a colonnade, a pediment, and a banner per live proposal
  {
    const p = at(civic.hall, 13.2)
    take(p.x, p.z, 2.4)
    const rot = civic.hall + Math.PI / 2
    const f = { x: p.x, z: p.z, rot }
    const c = Math.cos(rot), s = Math.sin(rot)
    const P = (i: number, k: number, hy: number) => [p.x + (i * c - k * s), hy, p.z + (i * s + k * c)]
    b.at(top)
    const base = box(b, f, top, 1.9, 1.15, 0.28, { roof: 'trim', windows: false })
    const body = box(b, { x: P(0, -0.25, 0)[0], z: P(0, -0.25, 0)[2], rot }, base, 1.6, 0.75, 1.35, { windows: false })
    // columns along the front, facing the plaza
    for (let i = 0; i < 6; i++) {
      const q = P(-1.6 + (i * 3.2) / 5, 0.95, 0)
      cylinder(b, { x: q[0], z: q[2], rot: 0 }, base, 0.11, 1.35, 8, 'trim')
    }
    const roofY = base + 1.35
    box(b, f, roofY, 1.95, 1.2, 0.14, { roof: 'trim', windows: false })
    const pe = roofY + 0.14
    b.tri(P(-1.95, 1.2, pe), P(1.95, 1.2, pe), P(0, 1.2, pe + 0.62), 'wall')
    b.quad(P(-1.95, 1.2, pe), P(0, 1.2, pe + 0.62), P(0, -1.2, pe + 0.62), P(-1.95, -1.2, pe), 'roof')
    b.quad(P(1.95, 1.2, pe), P(1.95, -1.2, pe), P(0, -1.2, pe + 0.62), P(0, 1.2, pe + 0.62), 'roof')
    b.edge(P(-1.95, 1.2, pe), P(0, 1.2, pe + 0.62))
    b.edge(P(1.95, 1.2, pe), P(0, 1.2, pe + 0.62))
    void body
    // banners hang between the columns: the brand colour climbs as far as support has
    input.proposals.slice(0, 5).forEach((pr, i, all) => {
      const u = -1.25 + ((i + 0.5) * 2.5) / Math.max(all.length, 1)
      const k = 0.5, w = 0.17, yt = roofY - 0.08, len = 1.0
      const fill = Math.min(1, Math.max(0.04, pr.support))
      const yf = yt - len + len * fill
      b.quad(P(u - w, k, yt - len), P(u + w, k, yt - len), P(u + w, k, yf), P(u - w, k, yf), 'brand')
      b.quad(P(u - w, k, yf), P(u + w, k, yf), P(u + w, k, yt), P(u - w, k, yt), 'canvas')
    })
    place('hall', 'hall', p.x, pe + 0.62, p.z)
  }

  // the market: a paved square with a stall for every open job
  {
    const p = at(civic.market, 13.0)
    take(p.x, p.z, 2.6)
    b.at(top - 0.02)
    cylinder(b, { x: p.x, z: p.z, rot: 0 }, top - 0.02, 2.5, 0.06, 6, 'trim')
    const n = Math.max(2, Math.min(6, input.jobs.length))
    for (let i = 0; i < n; i++) {
      const a = civic.market + Math.PI + ((i - (n - 1) / 2) / n) * Math.PI * 1.5
      const sx = p.x + Math.cos(a) * 1.55, sz = p.z + Math.sin(a) * 1.55
      const f = { x: sx, z: sz, rot: a + Math.PI / 2 }
      b.at(top + 0.04)
      const st = box(b, f, top + 0.04, 0.42, 0.3, 0.42, { windows: false })
      // a striped canvas awning
      const c = Math.cos(f.rot), s = Math.sin(f.rot)
      const Q = (i2: number, k: number, hy: number) => [sx + (i2 * c - k * s), hy, sz + (i2 * s + k * c)]
      b.quad(Q(-0.5, -0.36, st + 0.22), Q(0.5, -0.36, st + 0.22), Q(0.5, 0.52, st), Q(-0.5, 0.52, st), i % 2 ? 'canvas' : 'brand')
    }
    place('market', 'market', p.x, top + 1.4, p.z)
  }

  // the spaceport, where the chain is: a pad, a ship and its gantry
  {
    const p = at(portA, 16.6)
    take(p.x, p.z, 2.6)
    b.at(top - 0.02)
    const pad = cylinder(b, { x: p.x, z: p.z, rot: 0 }, top - 0.02, 2.3, 0.16, 28, 'trim')
    for (let i = 0; i < 32; i++) {
      const q0 = (i / 32) * Math.PI * 2, q1 = ((i + 1) / 32) * Math.PI * 2
      b.edge([p.x + Math.cos(q0) * 1.6, pad + 0.005, p.z + Math.sin(q0) * 1.6], [p.x + Math.cos(q1) * 1.6, pad + 0.005, p.z + Math.sin(q1) * 1.6])
    }
    // the ship: a body, a nose and three fins
    const f = { x: p.x, z: p.z, rot: 0 }
    let sy = cylinder(b, f, pad, 0.36, 2.1, 12, 'wall', true)
    sy = cylinder(b, f, sy, 0.38, 0.1, 12, 'trim')
    for (let i = 0; i < 12; i++) {
      const q0 = (i / 12) * Math.PI * 2, q1 = ((i + 1) / 12) * Math.PI * 2
      b.tri([p.x + Math.cos(q0) * 0.36, sy, p.z + Math.sin(q0) * 0.36], [p.x + Math.cos(q1) * 0.36, sy, p.z + Math.sin(q1) * 0.36], [p.x, sy + 0.9, p.z], 'brand')
    }
    for (let i = 0; i < 3; i++) {
      const q = (i / 3) * Math.PI * 2
      const ix = Math.cos(q), iz = Math.sin(q)
      b.tri([p.x + ix * 0.34, pad + 0.7, p.z + iz * 0.34], [p.x + ix * 0.82, pad, p.z + iz * 0.82], [p.x + ix * 0.34, pad, p.z + iz * 0.34], 'roof')
    }
    // the gantry beside it
    const gx = p.x + Math.cos(portA + 1.2) * 1.2, gz = p.z + Math.sin(portA + 1.2) * 1.2
    for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(b, { x: gx + i * 0.18, z: gz + k * 0.18, rot: 0 }, pad, 0.03, 0.03, 2.8, { roof: 'trim', windows: false, edges: false })
    for (let gy = pad + 0.4; gy < pad + 2.8; gy += 0.55) {
      b.edge([gx - 0.18, gy, gz - 0.18], [gx + 0.18, gy + 0.55, gz - 0.18])
      b.edge([gx + 0.18, gy, gz + 0.18], [gx - 0.18, gy + 0.55, gz + 0.18])
    }
    b.tri([gx - 0.1, pad + 2.85, gz], [gx + 0.1, pad + 2.85, gz], [gx, pad + 3.05, gz], 'lamp', 1)
    place('port', 'port', p.x, sy + 0.9, p.z)
  }

  // the apps: landmarks round the plaza, the first in the world's grandest style
  const nA = input.apps.length
  input.apps.forEach((app, i) => {
    const a = civic.vault + Math.PI / 3 + (i / Math.max(nA, 1)) * Math.PI * 2 + (nA > 3 ? 0 : 0.25)
    const d = 7.6
    const p = at(a, d)
    // skip a spot an avenue runs through
    const site = { x: p.x, z: p.z, s: 1.5, rot: a + Math.PI / 2 }
    take(p.x, p.z, 1.6)
    const peak = signature(t, b, g, site, true, r, i === 0 ? 'roof' : 'brand')
    place(app.key, 'app', p.x, peak, p.z)
  })

  // avenues, paved, with lamps along them
  for (const rd of roads) {
    const len = Math.hypot(rd.bx - rd.ax, rd.bz - rd.az)
    const dx = (rd.bx - rd.ax) / len, dz = (rd.bz - rd.az) / len
    const nx = -dz * 0.45, nz = dx * 0.45
    b.at(top)
    b.quad([rd.ax + nx, top + 0.03, rd.az + nz], [rd.bx + nx, top + 0.03, rd.bz + nz], [rd.bx - nx, top + 0.03, rd.bz - nz], [rd.ax - nx, top + 0.03, rd.az - nz], 'trim')
    b.edge([rd.ax + nx, top + 0.04, rd.az + nz], [rd.bx + nx, top + 0.04, rd.bz + nz])
    b.edge([rd.ax - nx, top + 0.04, rd.az - nz], [rd.bx - nx, top + 0.04, rd.bz - nz])
    for (let s = 1.6; s < len - 1; s += 2.6) {
      const side = s % 5.2 < 2.6 ? 1 : -1
      lantern(b, g, rd.ax + dx * s + nx * 1.7 * side, rd.az + dz * s + nz * 1.7 * side)
    }
  }
  // a ring road round the apps
  for (let i = 0; i < 48; i++) {
    const q0 = (i / 48) * Math.PI * 2, q1 = ((i + 1) / 48) * Math.PI * 2
    const R0 = 10.2, R1 = 10.9
    b.quad([Math.cos(q0) * R0, top + 0.03, Math.sin(q0) * R0], [Math.cos(q1) * R0, top + 0.03, Math.sin(q1) * R0], [Math.cos(q1) * R1, top + 0.03, Math.sin(q1) * R1], [Math.cos(q0) * R1, top + 0.03, Math.sin(q0) * R1], 'trim')
  }
  for (let i = 0; i < 48; i++) roads.push({ ax: Math.cos((i / 48) * Math.PI * 2) * 10.55, az: Math.sin((i / 48) * Math.PI * 2) * 10.55, bx: Math.cos(((i + 1) / 48) * Math.PI * 2) * 10.55, bz: Math.sin(((i + 1) / 48) * Math.PI * 2) * 10.55 })

  // houses fill the rest, facing the middle
  let houses = 0
  for (let i = 0; i < 900 && houses < (ctx.station ? 42 : 64); i++) {
    const a = r() * Math.PI * 2, d = 4.6 + Math.sqrt(r()) * (CITY_R - 5.2)
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    const s = 0.42 + r() * 0.26
    if (!clear(x, z, s * 1.25)) continue
    take(x, z, s * 1.25)
    house(t, b, g, { x, z, s, rot: a + Math.PI / 2 + (r() - 0.5) * 0.3 }, r)
    houses++
  }
  const group = b.build(ctx.shared)
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })

  // trees (or rocks) in the gaps
  const fl = FLORA[t]
  const spots: { x: number; z: number; s: number }[] = []
  for (let i = 0; i < 1400 && spots.length < (ctx.station ? 10 : fl.n); i++) {
    const a = r() * Math.PI * 2, d = 4.5 + Math.sqrt(r()) * (CITY_R - 4.6)
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    const s = 0.4 + r() * 0.4
    if (!clear(x, z, s * 0.9)) continue
    take(x, z, s * 0.9)
    spots.push({ x, z, s })
  }
  if (spots.length) {
    const geo =
      fl.kind === 'pine'
        ? new THREE.ConeGeometry(0.5, 1.6, 7).translate(0, 0.95, 0)
        : fl.kind === 'rock'
          ? new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.6, 1).translate(0, 0.15, 0)
          : fl.kind === 'shrub'
            ? new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.7, 1).translate(0, 0.3, 0)
            : new THREE.IcosahedronGeometry(0.62, 1).translate(0, 1.15, 0)
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), spots.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color()
    spots.forEach((sp, i) => {
      e.set(0, r() * Math.PI * 2, 0)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(sp.x, top, sp.z), q, new THREE.Vector3(sp.s * 1.3, sp.s * 1.3, sp.s * 1.3))
      im.setMatrixAt(i, m)
      im.setColorAt(i, col.set(fl.colors[i % fl.colors.length]).multiplyScalar(0.9 + r() * 0.2))
    })
    im.castShadow = true
    im.receiveShadow = true
    flora = im
  }
  return { objects: flora ? [group, flora] : [group], mesa: CITY_R, pulse: { x: 0, z: 0, sides: 96, rot: 0 }, route: curve }
}

function segDist(x: number, z: number, s: { ax: number; az: number; bx: number; bz: number }) {
  const dx = s.bx - s.ax, dz = s.bz - s.az
  const l = dx * dx + dz * dz || 1
  const t = Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l))
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t))
}
