import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { heightAt, type Hill } from './height'
import { Builder, footing, house, pole, setLook, signature, tent, type Shared } from './kit'
import { rand, seedOf } from './settlement'

/*
  Inside a world: what the Field shows when you step into one.
  - Each deployed app is a signature building of the world's type, larger than the houses
    around it, with a sprout roof so you can find the apps at a glance.
  - Each open job is a construction site: a slab and a dashed scaffold where work goes.
  - Houses fill the terraces, so it reads as a settlement and not a diagram.
  - Agents (small dots) walk between buildings and sites: the work happening.
  Anchors tell the label layer where each app and job stands.
*/

export interface DistrictInput {
  id: string
  template: Template
  apps: { key: string }[]
  jobs: { key: string }[]
  seed: boolean
  lit: number
}

export interface Anchor {
  key: string
  kind: 'app' | 'job'
  x: number
  y: number
  z: number
}

const AGENT_DAY = [new THREE.Color('#141813'), new THREE.Color('#3f6b00')]
const AGENT_NIGHT = [new THREE.Color('#e8ece4'), new THREE.Color('#c4ef3a')]

export class District {
  readonly group: THREE.Group
  readonly anchors: Anchor[] = []
  private agents: { from: number; to: number; t: number; speed: number; lift: number }[] = []
  private points: THREE.Points
  private hills: Hill[]
  private hill: Hill
  private stops: { x: number; z: number }[] = []
  private night = -1

  constructor(input: DistrictInput, hill: Hill, hills: Hill[], shared: Shared) {
    this.hill = hill
    this.hills = hills
    const r = rand(seedOf(input.id + ':inside'))
    const b = new Builder(r, input.template)
    b.lit = 0.35 + input.lit * 0.55
    const g = (x: number, z: number) => heightAt(x, z, hills)
    const placed: { x: number; z: number; s: number }[] = []
    const find = (lo: number, hi: number, s: number) => {
      for (let i = 0; i < 60; i++) {
        const a = r() * Math.PI * 2
        const d = hill.radius * (lo + r() * (hi - lo))
        const x = hill.x + Math.cos(a) * d, z = hill.z + Math.sin(a) * d
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 1.3)) continue
        placed.push({ x, z, s })
        return { x, z, s, rot: a + Math.PI / 2 }
      }
      return null
    }

    // the apps, on the upper terraces, in the world's own architecture
    for (const app of input.apps) {
      const site = find(0.12, 0.5, 1.45)
      if (!site) continue
      const top = signature(input.template, b, g, site, true, r, 'brand')
      this.anchors.push({ key: app.key, kind: 'app', x: site.x, y: top, z: site.z })
    }

    // open jobs: a slab and a dashed scaffold
    for (const job of input.jobs) {
      const site = find(0.45, 0.82, 1.15)
      if (!site) continue
      const f = { x: site.x, z: site.z, rot: site.rot }
      const s = 0.95
      const y = footing(g, f, s, s)
      b.at(y)
      const c = Math.cos(f.rot), sn = Math.sin(f.rot)
      const P = (i: number, k: number, h: number) => [f.x + (i * c - k * sn), h, f.z + (i * sn + k * c)]
      const k = 1.2
      b.quad(P(-k, -k, y + 0.1), P(k, -k, y + 0.1), P(k, k, y + 0.1), P(-k, k, y + 0.1), 'canvas')
      const h = 2.2
      const lo = [P(-s, -s, y), P(s, -s, y), P(s, s, y), P(-s, s, y)]
      const hi = [P(-s, -s, y + h), P(s, -s, y + h), P(s, s, y + h), P(-s, s, y + h)]
      const mid = lo.map((p) => [p[0], p[1] + h / 2, p[2]])
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        b.dash(lo[i], hi[i])
        b.dash(hi[i], hi[j])
        b.dash(mid[i], mid[j])
        b.dash(lo[i], hi[j])
      }
      this.anchors.push({ key: job.key, kind: 'job', x: site.x, y: y + h, z: site.z })
    }

    if (input.seed) {
      const top = g(hill.x, hill.z)
      b.at(top)
      pole(b, hill.x, hill.z, top, 2.6)
      const site = find(0.2, 0.5, 0.8)
      if (site) {
        const y = footing(g, site, 0.7, 0.5)
        b.at(y)
        tent(b, site, y, 0.7, 0.5, 0.8)
      }
    }

    const houses = input.seed ? 2 : 6 + input.apps.length * 3
    for (let i = 0; i < houses; i++) {
      const site = find(0.1, 0.85, 0.45 + r() * 0.3)
      if (site) house(input.template, b, g, site, r)
    }

    this.group = b.build(shared)

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
    pg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3))
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }))
    this.group.add(this.points)
    this.setNight(0)
    this.step(0)
  }

  /** the agents carry little lights after dark */
  setNight(k: number) {
    if (Math.abs(k - this.night) < 0.01) return
    this.night = k
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < this.agents.length; i++) {
      const c = AGENT_DAY[i % 3 === 0 ? 0 : 1].clone().lerp(AGENT_NIGHT[i % 3 === 0 ? 0 : 1], k)
      col.setXYZ(i, c.r, c.g, c.b)
    }
    col.needsUpdate = true
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
    setLook(this.group, 0.4 + 0.6 * o, o)
    ;(this.points.material as THREE.PointsMaterial).opacity = o
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
