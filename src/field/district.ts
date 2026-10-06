import * as THREE from 'three'
import { heightAt, type Hill } from './height'

/*
  Inside a world: what the Field shows when you step into one.
  - Each deployed app is a building: taller than the houses around it, with a sprout roof.
  - Each open job is a construction site: a slab and a dashed scaffold where the work goes.
  - Houses fill in the terraces, so it reads as a settlement and not a diagram.
  - Agents (small dots) walk between buildings and sites: the work happening.
  Everything stands on the hill's surface; anchors tell the label layer where to point.
*/

export interface DistrictInput {
  id: string
  apps: { key: string }[]
  jobs: { key: string }[]
  /** a seed has no apps yet; it gets its survey stake and site office */
  seed: boolean
}

export interface Anchor {
  key: string
  kind: 'app' | 'job'
  x: number
  y: number
  z: number
}

const TOP = new THREE.Color('#fbfbf8')
const ROOF = new THREE.Color('#c4ef3a')
const SIDE_A = new THREE.Color('#dfe3db')
const SIDE_B = new THREE.Color('#c3cac0')
const SLAB = new THREE.Color('#e8ebe3')
const INK = new THREE.Color('#141813')

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

interface Spot {
  x: number
  z: number
  s: number
}

export class District {
  readonly group = new THREE.Group()
  readonly anchors: Anchor[] = []
  private agents: { from: number; to: number; t: number; speed: number; lift: number }[] = []
  private points: THREE.Points
  private hill: Hill
  private hills: Hill[]
  private stops: { x: number; z: number }[] = []

  constructor(input: DistrictInput, hill: Hill, hills: Hill[]) {
    this.hill = hill
    this.hills = hills
    const r = rand([...input.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) % 2147483646 || 1)
    const placed: Spot[] = []
    const pos: number[] = []
    const col: number[] = []
    const edges: number[] = []
    const dashes: number[] = []

    // somewhere free on the hill, within a band of its radius
    const find = (lo: number, hi: number, size: number): Spot | null => {
      for (let i = 0; i < 60; i++) {
        const a = r() * Math.PI * 2
        const d = hill.radius * (lo + r() * (hi - lo))
        const x = hill.x + Math.cos(a) * d
        const z = hill.z + Math.sin(a) * d
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + size) * 1.35)) continue
        const spot = { x, z, s: size }
        placed.push(spot)
        return spot
      }
      return null
    }
    const groundUnder = (x: number, z: number, w: number, d: number) => Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => heightAt(x + i * w, z + j * d, hills))) - 0.05
    const box = (x: number, z: number, w: number, d: number, h: number, roof: THREE.Color, rot: number) => {
      const base = groundUnder(x, z, w, d)
      const c = Math.cos(rot), sn = Math.sin(rot)
      const P = (i: number, k: number, y: number) => [x + (i * w * c - k * d * sn), y, z + (i * w * sn + k * d * c)]
      const b = [P(-1, -1, base), P(1, -1, base), P(1, 1, base), P(-1, 1, base)]
      const t = [P(-1, -1, base + h), P(1, -1, base + h), P(1, 1, base + h), P(-1, 1, base + h)]
      const quad = (q: number[][], color: THREE.Color) => {
        for (const i of [0, 1, 2, 0, 2, 3]) {
          pos.push(...q[i])
          col.push(color.r, color.g, color.b)
        }
      }
      quad(t, roof)
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        quad([b[i], b[j], t[j], t[i]], i % 2 ? SIDE_A : SIDE_B)
        edges.push(...t[i], ...t[j], ...b[i], ...t[i])
      }
      return base + h
    }

    // the apps, on the upper terraces
    input.apps.forEach((app) => {
      const s = 1.1 + r() * 0.45
      const spot = find(0.12, 0.5, s)
      if (!spot) return
      const top = box(spot.x, spot.z, s, s * (0.75 + r() * 0.3), 2 + r() * 1.6, ROOF, r() * Math.PI)
      this.anchors.push({ key: app.key, kind: 'app', x: spot.x, y: top, z: spot.z })
    })

    // the open jobs, as construction sites further down
    input.jobs.forEach((job) => {
      const s = 1.1
      const spot = find(0.45, 0.82, s)
      if (!spot) return
      const base = groundUnder(spot.x, spot.z, s, s)
      const rot = r() * Math.PI
      const c = Math.cos(rot), sn = Math.sin(rot)
      const P = (i: number, k: number, y: number) => [spot.x + (i * s * c - k * s * sn), y, spot.z + (i * s * sn + k * s * c)]
      // the slab
      const slab = [P(-1.2, -1.2, base + 0.12), P(1.2, -1.2, base + 0.12), P(1.2, 1.2, base + 0.12), P(-1.2, 1.2, base + 0.12)]
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...slab[i])
        col.push(SLAB.r, SLAB.g, SLAB.b)
      }
      // the scaffold: a dashed frame and a cross brace on each face
      const h = 2.2
      const b = [P(-1, -1, base), P(1, -1, base), P(1, 1, base), P(-1, 1, base)]
      const t = [P(-1, -1, base + h), P(1, -1, base + h), P(1, 1, base + h), P(-1, 1, base + h)]
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        dashes.push(...b[i], ...t[i], ...t[i], ...t[j], ...b[i], ...t[j])
      }
      this.anchors.push({ key: job.key, kind: 'job', x: spot.x, y: base + h, z: spot.z })
    })

    if (input.seed) {
      // a seed: the stake at the top and a small site office
      const top = heightAt(hill.x, hill.z, hills)
      dashes.push(hill.x, top, hill.z, hill.x, top + 2.6, hill.z)
      const spot = find(0.2, 0.5, 0.8)
      if (spot) box(spot.x, spot.z, 0.8, 0.6, 0.9, TOP, r() * Math.PI)
    }

    // houses fill the terraces
    const houses = input.seed ? 2 : 6 + input.apps.length * 3
    for (let i = 0; i < houses; i++) {
      const s = 0.45 + r() * 0.35
      const spot = find(0.1, 0.85, s)
      if (spot) box(spot.x, spot.z, s, s * (0.7 + r() * 0.4), 0.5 + r() * 0.9, TOP, r() * Math.PI)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    this.group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })))
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3))
    this.group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 })))
    if (dashes.length) {
      const dg = new THREE.BufferGeometry()
      dg.setAttribute('position', new THREE.Float32BufferAttribute(dashes, 3))
      const dl = new THREE.LineSegments(dg, new THREE.LineDashedMaterial({ color: INK, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.8 }))
      dl.computeLineDistances()
      this.group.add(dl)
    }

    // agents walk between the places where work happens
    this.stops = this.anchors.length >= 2 ? this.anchors.map((a) => ({ x: a.x, z: a.z })) : placed.slice(0, 4).map((p) => ({ x: p.x, z: p.z }))
    const n = this.stops.length >= 2 ? Math.min(14, 4 + this.anchors.length * 2) : 0
    for (let i = 0; i < n; i++) {
      const from = Math.floor(r() * this.stops.length)
      let to = Math.floor(r() * this.stops.length)
      if (to === from) to = (to + 1) % this.stops.length
      this.agents.push({ from, to, t: r(), speed: 0.12 + r() * 0.12, lift: 0.35 + r() * 0.15 })
    }
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3))
    const colors = new Float32Array(Math.max(1, n) * 3)
    for (let i = 0; i < n; i++) {
      const c = i % 3 === 0 ? INK : new THREE.Color('#3f6b00')
      colors.set([c.r, c.g, c.b], i * 3)
    }
    pg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }))
    this.group.add(this.points)
    this.step(0)
  }

  /** move the agents along; returns whether anything is walking */
  step(dt: number) {
    if (!this.agents.length) return false
    const arr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    this.agents.forEach((a, i) => {
      const from = this.stops[a.from], to = this.stops[a.to]
      const len = Math.max(1, Math.hypot(to.x - from.x, to.z - from.z))
      a.t += (dt * a.speed * 6) / len
      if (a.t >= 1) {
        a.t = 0
        a.from = a.to
        a.to = (a.to + 1 + Math.floor(Math.random() * (this.stops.length - 1))) % this.stops.length
      }
      // ease in and out at each stop, with a slight curve so paths don't overlap
      const e = a.t * a.t * (3 - 2 * a.t)
      const f2 = this.stops[a.from], t2 = this.stops[a.to]
      const bend = Math.sin(e * Math.PI) * 0.8 * (i % 2 ? 1 : -1)
      const nx = -(t2.z - f2.z), nz = t2.x - f2.x
      const nl = Math.hypot(nx, nz) || 1
      const x = f2.x + (t2.x - f2.x) * e + (nx / nl) * bend
      const z = f2.z + (t2.z - f2.z) * e + (nz / nl) * bend
      arr.setXYZ(i, x, Math.max(0.2, heightAt(x, z, this.hills)) + a.lift, z)
    })
    arr.needsUpdate = true
    return true
  }

  setOpacity(o: number) {
    this.group.visible = o > 0.01
    this.group.traverse((n) => {
      const m = (n as THREE.Mesh).material as THREE.Material | undefined
      if (!m) return
      m.transparent = true
      const base = (m.userData.base ??= m.opacity)
      m.opacity = base * o
    })
  }

  /** a spot for a proof ping: one of its buildings */
  pingSpot() {
    const apps = this.anchors.filter((a) => a.kind === 'app')
    const list = apps.length ? apps : this.anchors
    if (!list.length) return { x: this.hill.x, z: this.hill.z }
    const a = list[Math.floor(Math.random() * list.length)]
    return { x: a.x, z: a.z }
  }

  dispose() {
    this.group.traverse((n) => {
      const mesh = n as THREE.Mesh
      mesh.geometry?.dispose()
      ;(mesh.material as THREE.Material | undefined)?.dispose()
    })
  }
}
