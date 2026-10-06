import * as THREE from 'three'
import { heightAt, type Hill } from './height'
import { Nature } from './nature'
import { rand } from './settlement'
import type { Shared } from './kit'

/*
  The small things that make the Field a place:
  - Woods on the open land between worlds, low and muted, in clusters.
  - Boats: two circling each sovereign island in its moat, a few more out at sea.
  - Trade routes: faint dashed roads between neighbouring worlds. When a token trades or
    a job moves, a sprout packet runs along the roads from that world.
  Everything shares the Field's day and night.
*/

export interface LifeWorld {
  id: string
  hill: Hill
  stage: 'seed' | 'realm' | 'sovereign'
}

const solidVS = /* glsl */ `
attribute vec3 dcolor;
attribute vec3 ncolor;
uniform float uNight;
varying vec3 vC;
varying float vDist;
void main() {
  vC = mix(dcolor, ncolor, uNight);
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const solidFS = /* glsl */ `
uniform vec3 uHaze;
uniform vec2 uFog;
uniform float uOpacity;
varying vec3 vC;
varying float vDist;
void main() {
  gl_FragColor = vec4(mix(vC, uHaze, smoothstep(uFog.x, uFog.y, vDist)), uOpacity);
}`
const routeVS = /* glsl */ `
attribute float ld;
varying float vLd;
varying float vDist;
void main() {
  vLd = ld;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const routeFS = /* glsl */ `
uniform vec3 uHaze;
uniform vec2 uFog;
uniform float uOpacity;
uniform float uNight;
varying float vLd;
varying float vDist;
void main() {
  if (fract(vLd / .9) > .5) discard;
  vec3 c = mix(vec3(.31, .36, .3), vec3(.62, .7, .6), uNight);
  gl_FragColor = vec4(mix(c, uHaze, smoothstep(uFog.x, uFog.y, vDist)), uOpacity * mix(.38, .5, uNight));
}`

const HULL_DAY = new THREE.Color('#f7f6ef'), HULL_NIGHT = new THREE.Color('#5a6670')
const SAIL_DAY = new THREE.Color('#ffffff'), SAIL_NIGHT = new THREE.Color('#9fb0b8')

interface Route {
  a: string
  b: string
  pts: THREE.Vector3[]
  len: number
}

export class Life {
  readonly group = new THREE.Group()
  readonly nature = new Nature()
  /** how many trees and rocks to plant: fewer on modest devices */
  budget = 1400
  private boats: { mesh: THREE.Mesh; cx: number; cz: number; r: number; a: number; speed: number; island: boolean }[] = []
  private routes: Route[] = []
  private routeLines: THREE.LineSegments | null = null
  private packets: THREE.Points
  private live: { route: number; t: number; dir: 1 | -1; speed: number }[] = []
  private shared: Shared
  private own = { uOpacity: { value: 1 } }
  private routeOwn = { uOpacity: { value: 1 } }
  private key = ''

  constructor(shared: Shared) {
    this.shared = shared
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3))
    this.packets = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#5c8f00', size: 1.5, sizeAttenuation: true, transparent: true, depthWrite: false }))
    this.packets.frustumCulled = false
    this.group.add(this.packets, this.nature.group)
  }

  /** (re)build woods, boats and routes for this set of worlds */
  build(worlds: LifeWorld[]) {
    const key = worlds.map((w) => `${w.id}:${w.stage}:${w.hill.radius.toFixed(1)}`).join('|')
    if (key === this.key) return
    this.key = key
    this.clear()
    const hills = worlds.map((w) => w.hill)
    const r = rand(9173)
    this.buildRoutes(worlds, hills)
    // keep woods off the roads: mark the cells the roads pass through
    const road = new Set<string>()
    for (const rt of this.routes) for (const p of rt.pts) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) road.add(`${Math.round(p.x) + dx},${Math.round(p.z) + dz}`)
    this.nature.build(worlds, hills, (x, z) => road.has(`${Math.round(x)},${Math.round(z)}`), this.budget)
    this.buildBoats(worlds, r)
  }

  private clear() {
    for (const o of [this.routeLines, ...this.boats.map((b) => b.mesh)]) {
      if (!o) continue
      this.group.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    this.routeLines = null
    this.boats = []
    this.routes = []
    this.live = []
  }

  private material() {
    return new THREE.ShaderMaterial({ vertexShader: solidVS, fragmentShader: solidFS, uniforms: { ...this.shared, ...this.own }, transparent: true })
  }

  private boat(scale: number) {
    // a hull and a sail, pointing along +x
    const pos: number[] = [], day: number[] = [], night: number[] = []
    const push = (p: number[], d: THREE.Color, n: THREE.Color) => {
      pos.push(p[0] * scale, p[1] * scale, p[2] * scale)
      day.push(d.r, d.g, d.b)
      night.push(n.r, n.g, n.b)
    }
    const hull = [[0.9, 0.12, 0], [-0.6, 0.12, 0.28], [-0.6, 0.12, -0.28], [-0.45, -0.05, 0]]
    for (const [a, b, c] of [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]) for (const i of [a, b, c]) push(hull[i], HULL_DAY, HULL_NIGHT)
    for (const p of [[-0.35, 0.12, 0], [0.35, 0.12, 0], [-0.25, 1.05, 0]]) push(p, SAIL_DAY, SAIL_NIGHT)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('dcolor', new THREE.Float32BufferAttribute(day, 3))
    g.setAttribute('ncolor', new THREE.Float32BufferAttribute(night, 3))
    const m = this.material()
    m.side = THREE.DoubleSide
    return new THREE.Mesh(g, m)
  }

  private buildBoats(worlds: LifeWorld[], r: () => number) {
    for (const w of worlds.filter((x) => x.stage === 'sovereign')) {
      for (let i = 0; i < 2; i++) {
        const mesh = this.boat(0.75)
        this.group.add(mesh)
        this.boats.push({ mesh, cx: w.hill.x, cz: w.hill.z, r: w.hill.radius * 1.24, a: r() * Math.PI * 2, speed: (0.05 + r() * 0.04) * (i ? -1 : 1), island: true })
      }
    }
    // a few further out, sailing round the continent
    for (let i = 0; i < 5; i++) {
      const mesh = this.boat(1)
      this.group.add(mesh)
      this.boats.push({ mesh, cx: 0, cz: 2, r: 54 + r() * 10, a: r() * Math.PI * 2, speed: (0.008 + r() * 0.006) * (i % 2 ? -1 : 1), island: false })
    }
  }

  private buildRoutes(worlds: LifeWorld[], hills: Hill[]) {
    // join each world to its two nearest neighbours, once per pair
    const seen = new Set<string>()
    for (const a of worlds) {
      const near = worlds
        .filter((b) => b.id !== a.id)
        .map((b) => ({ b, d: Math.hypot(a.hill.x - b.hill.x, a.hill.z - b.hill.z) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 2)
      for (const { b, d } of near) {
        const k = [a.id, b.id].sort().join('~')
        if (seen.has(k) || d > 30) continue
        seen.add(k)
        const pts: THREE.Vector3[] = []
        const dx = b.hill.x - a.hill.x, dz = b.hill.z - a.hill.z
        const nx = -dz / d, nz = dx / d
        const bow = (k.length % 2 ? 1 : -1) * d * 0.12
        for (let i = 0; i <= 40; i++) {
          const t = i / 40
          // leave and arrive at each hill's foot, bowing gently between
          // from the ring road at one world's foot to the ring road at the other's
          const s = (a.hill.radius * 1.05) / d + t * (1 - ((a.hill.radius + b.hill.radius) * 1.05) / d)
          const x = a.hill.x + dx * s + nx * Math.sin(s * Math.PI) * bow
          const z = a.hill.z + dz * s + nz * Math.sin(s * Math.PI) * bow
          pts.push(new THREE.Vector3(x, Math.max(0.12, heightAt(x, z, hills)) + 0.18, z))
        }
        let len = 0
        for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1])
        this.routes.push({ a: a.id, b: b.id, pts, len })
      }
    }
    const pos: number[] = [], ld: number[] = []
    for (const rt of this.routes) {
      let acc = 0
      for (let i = 1; i < rt.pts.length; i++) {
        const p = rt.pts[i - 1], q = rt.pts[i]
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z)
        ld.push(acc)
        acc += p.distanceTo(q)
        ld.push(acc)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('ld', new THREE.Float32BufferAttribute(ld, 1))
    this.routeLines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: routeVS, fragmentShader: routeFS, uniforms: { ...this.shared, ...this.routeOwn }, transparent: true, depthWrite: false }))
    // the roads themselves are painted on the ground; these lines are kept only for the packets' path
  }

  /** the roads, for painting on the ground */
  roads() {
    return this.routes.map((r) => ({ a: r.a, b: r.b, pts: r.pts }))
  }

  /** something happened at this world: send packets down its roads */
  pulse(worldId: string) {
    this.routes.forEach((rt, i) => {
      if (rt.a !== worldId && rt.b !== worldId) return
      if (this.live.length >= 24) return
      this.live.push({ route: i, t: 0, dir: rt.a === worldId ? 1 : -1, speed: 7 + Math.random() * 3 })
    })
  }

  /** move boats and packets; returns true while something moves that needs frames */
  step(dt: number) {
    for (const b of this.boats) {
      b.a += b.speed * dt
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r
      b.mesh.position.set(x, 0.02 + Math.sin(b.a * 7) * 0.03, z)
      // face along the circle
      b.mesh.rotation.y = -b.a - (b.speed > 0 ? Math.PI / 2 : -Math.PI / 2)
    }
    const arr = this.packets.geometry.getAttribute('position') as THREE.BufferAttribute
    this.live = this.live.filter((p) => p.t < 1)
    for (let i = 0; i < 24; i++) {
      const p = this.live[i]
      if (!p) {
        arr.setXYZ(i, 0, -999, 0)
        continue
      }
      const rt = this.routes[p.route]
      p.t += (dt * p.speed) / rt.len
      const u = Math.min(1, Math.max(0, p.dir === 1 ? p.t : 1 - p.t)) * (rt.pts.length - 1)
      const i0 = Math.floor(u), f = u - i0
      const a = rt.pts[i0], b = rt.pts[Math.min(rt.pts.length - 1, i0 + 1)]
      arr.setXYZ(i, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + 0.15, a.z + (b.z - a.z) * f)
    }
    arr.needsUpdate = true
    return this.live.length > 0
  }

  /** woods and boats always; roads only where they help (the Atlas, not inside a world) */
  setLook(opacity: number, routes: number) {
    const night = (this.shared.uNight.value as number) ?? 0
    ;(this.packets.material as THREE.PointsMaterial).color.set('#5c8f00').lerp(new THREE.Color('#c4ef3a'), night)
    this.own.uOpacity.value = opacity
    this.nature.setOpacity(opacity)
    this.routeOwn.uOpacity.value = routes
    if (this.routeLines) this.routeLines.visible = routes > 0.01
    ;(this.packets.material as THREE.PointsMaterial).opacity = routes
    this.packets.visible = routes > 0.01
  }

  dispose() {
    this.clear()
    this.nature.dispose()
    this.packets.geometry.dispose()
    ;(this.packets.material as THREE.Material).dispose()
  }
}
