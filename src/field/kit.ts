import * as THREE from 'three'
import type { Template } from '@/lib/types'

/*
  The architecture kit. Every world on the Field builds from the same handful of shapes
  (boxes, gables, cylinders, domes, tents, sawtooth roofs, masts), and each kind of world
  has its own vocabulary of them:

    DeFi Kingdom          market halls and stepped vault towers
    Agent Republic        slender relay towers and dock cranes
    Game World            a ring arena and smoking workshops
    Creator Nation        sawtooth studios and rows of storefronts
    Prediction            observatories with domes, and a tall mast
    Open Frontier         survey tents and flagged poles

  A Builder collects triangles with two colours each (day, night), the ground height each
  building stands on (so it can rise out of the ground), and ink edges. Faces are shaded
  once on the CPU from a fixed light, so the whole map reads as one drawing.
*/

const LIGHT = new THREE.Vector3(-0.45, 0.85, 0.35).normalize()

// day: survey paper in light and shade; night: blue-grey walls, warm windows
const DAY = { lit: new THREE.Color('#fbfbf8'), shade: new THREE.Color('#bcc4b8'), roof: new THREE.Color('#c4ef3a'), glass: new THREE.Color('#9aa59c'), canvas: new THREE.Color('#efe9d8'), water: new THREE.Color('#9fb6b9') }
const NIGHT = { lit: new THREE.Color('#3a4650'), shade: new THREE.Color('#1c242b'), roof: new THREE.Color('#7f9a2a'), glass: new THREE.Color('#242c33'), window: new THREE.Color('#ffd27a'), canvas: new THREE.Color('#5a5446') }

export type Tone = 'wall' | 'roof' | 'accent' | 'canvas'

export interface Shared {
  uNight: { value: number }
  uHaze: { value: THREE.Color }
  uFog: { value: THREE.Vector2 }
}

const solidVS = /* glsl */ `
attribute vec3 dcolor;
attribute vec3 ncolor;
attribute float base;
uniform float uNight;
uniform float uRise;
varying vec3 vC;
varying float vDist;
void main() {
  vec3 p = position;
  p.y = base + (p.y - base) * uRise;
  vC = mix(dcolor, ncolor, uNight);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
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
const lineVS = /* glsl */ `
attribute float base;
attribute float ld;
uniform float uRise;
varying float vLd;
varying float vDist;
void main() {
  vec3 p = position;
  p.y = base + (p.y - base) * uRise;
  vLd = ld;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const lineFS = /* glsl */ `
uniform vec3 uHaze;
uniform vec2 uFog;
uniform float uOpacity;
uniform float uNight;
uniform float uDash;
varying float vLd;
varying float vDist;
void main() {
  if (uDash > 0. && fract(vLd / uDash) > .55) discard;
  vec3 ink = mix(vec3(.078, .094, .075), vec3(.86, .89, .84), uNight);
  gl_FragColor = vec4(mix(ink, uHaze, smoothstep(uFog.x, uFog.y, vDist)), uOpacity * mix(.75, .45, uNight));
}`

export class Builder {
  private pos: number[] = []
  private day: number[] = []
  private night: number[] = []
  private base: number[] = []
  private edges: number[] = []
  private edgeBase: number[] = []
  private dashes: number[] = []
  private dashBase: number[] = []
  private dashLd: number[] = []
  private ground = 0
  /** chance a window is lit at night: busier worlds glow brighter */
  lit = 0.5
  private r: () => number

  constructor(r: () => number) {
    this.r = r
  }

  /** set the ground height for the next building (it rises from here) */
  at(ground: number) {
    this.ground = ground
    return this
  }

  tri(a: number[], b: number[], c: number[], tone: Tone) {
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize()
    // shade both sides alike: flip normals that face down or away
    const k = Math.abs(n.dot(LIGHT))
    const up = Math.abs(n.y) > 0.92
    const d = tone === 'roof' ? DAY.roof.clone() : tone === 'canvas' ? DAY.canvas.clone() : DAY.shade.clone().lerp(DAY.lit, up ? 1 : 0.25 + k * 0.75)
    if (tone === 'accent') d.copy(DAY.glass)
    if (tone === 'roof') d.lerp(new THREE.Color('#9fc21c'), up ? 0 : 0.35)
    const nn = tone === 'roof' ? NIGHT.roof.clone() : tone === 'canvas' ? NIGHT.canvas.clone() : NIGHT.shade.clone().lerp(NIGHT.lit, up ? 0.8 : 0.2 + k * 0.6)
    if (tone === 'accent') nn.copy(NIGHT.glass)
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2])
      this.day.push(d.r, d.g, d.b)
      this.night.push(nn.r, nn.g, nn.b)
      this.base.push(this.ground)
    }
  }

  quad(a: number[], b: number[], c: number[], d: number[], tone: Tone) {
    this.tri(a, b, c, tone)
    this.tri(a, c, d, tone)
  }

  edge(a: number[], b: number[]) {
    this.edges.push(...a, ...b)
    this.edgeBase.push(this.ground, this.ground)
  }

  dash(a: number[], b: number[]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    this.dashes.push(...a, ...b)
    this.dashBase.push(this.ground, this.ground)
    this.dashLd.push(0, len)
  }

  /** a lit or dark window on a wall, centred at p, facing along n */
  window(p: number[], along: number[], w: number, h: number) {
    const on = this.r() < this.lit
    const a = [p[0] - along[0] * w, p[1] - h, p[2] - along[2] * w]
    const b = [p[0] + along[0] * w, p[1] - h, p[2] + along[2] * w]
    const c = [p[0] + along[0] * w, p[1] + h, p[2] + along[2] * w]
    const d = [p[0] - along[0] * w, p[1] + h, p[2] - along[2] * w]
    for (const q of [a, b, c, a, c, d]) {
      this.pos.push(q[0], q[1], q[2])
      this.day.push(DAY.glass.r, DAY.glass.g, DAY.glass.b)
      const n = on ? NIGHT.window : NIGHT.glass
      this.night.push(n.r, n.g, n.b)
      this.base.push(this.ground)
    }
  }

  build(shared: Shared) {
    const group = new THREE.Group()
    const solid = new THREE.BufferGeometry()
    solid.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    solid.setAttribute('dcolor', new THREE.Float32BufferAttribute(this.day, 3))
    solid.setAttribute('ncolor', new THREE.Float32BufferAttribute(this.night, 3))
    solid.setAttribute('base', new THREE.Float32BufferAttribute(this.base, 1))
    const own = { uRise: { value: 1 }, uOpacity: { value: 1 } }
    const mat = new THREE.ShaderMaterial({
      vertexShader: solidVS,
      fragmentShader: solidFS,
      uniforms: { ...shared, ...own },
      side: THREE.DoubleSide,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    group.add(new THREE.Mesh(solid, mat))
    const lines = (pts: number[], base: number[], ld: number[] | null, dash: number) => {
      if (!pts.length) return
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      g.setAttribute('base', new THREE.Float32BufferAttribute(base, 1))
      g.setAttribute('ld', new THREE.Float32BufferAttribute(ld ?? new Array(base.length).fill(0), 1))
      group.add(new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: lineVS, fragmentShader: lineFS, uniforms: { ...shared, ...own, uDash: { value: dash } }, transparent: true })))
    }
    lines(this.edges, this.edgeBase, null, 0)
    lines(this.dashes, this.dashBase, this.dashLd, 0.36)
    group.userData.own = own
    return group
  }
}

/** rise (0 under the ground … 1 standing) and fade, for a group the Builder made */
export function setLook(group: THREE.Group, rise: number, opacity: number) {
  const own = group.userData.own as { uRise: { value: number }; uOpacity: { value: number } } | undefined
  if (!own) return
  own.uRise.value = rise
  own.uOpacity.value = opacity
  group.visible = opacity > 0.01 && rise > 0.01
}

// ── shapes ──

type Ground = (x: number, z: number) => number
interface Frame {
  x: number
  z: number
  rot: number
}
const P = (f: Frame, i: number, k: number, y: number) => {
  const c = Math.cos(f.rot), s = Math.sin(f.rot)
  return [f.x + (i * c - k * s), y, f.z + (i * s + k * c)]
}

/** the lowest ground under a footprint, so nothing floats on a slope */
export const footing = (g: Ground, f: Frame, w: number, d: number) =>
  Math.min(
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([i, k]) => {
      const p = P(f, i * w, k * d, 0)
      return g(p[0], p[2])
    }),
  ) - 0.06

/** a box: walls, a top, edges, and windows on its long faces */
function box(b: Builder, f: Frame, y0: number, w: number, d: number, h: number, opts: { roof?: Tone; windows?: boolean; edges?: boolean } = {}) {
  const lo = [P(f, -w, -d, y0), P(f, w, -d, y0), P(f, w, d, y0), P(f, -w, d, y0)]
  const hi = [P(f, -w, -d, y0 + h), P(f, w, -d, y0 + h), P(f, w, d, y0 + h), P(f, -w, d, y0 + h)]
  b.quad(hi[0], hi[1], hi[2], hi[3], opts.roof ?? 'wall')
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    b.quad(lo[i], lo[j], hi[j], hi[i], 'wall')
    if (opts.edges !== false) {
      b.edge(hi[i], hi[j])
      b.edge(lo[i], hi[i])
    }
  }
  if (opts.windows !== false && h > 0.7) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot)
    const floors = Math.max(1, Math.floor(h / 0.75))
    // windows on the two long faces, set just proud of the wall
    for (const side of [-1, 1]) {
      const cols = Math.max(1, Math.floor(w / 0.42))
      for (let fl = 0; fl < floors; fl++)
        for (let ci = 0; ci < cols; ci++) {
          const u = -w + ((ci + 0.5) / cols) * 2 * w
          const p = P(f, u, side * (d + 0.012), y0 + 0.42 + fl * 0.75)
          b.window(p, [c, 0, s], 0.09, 0.13)
        }
    }
  }
  return y0 + h
}

/** a pitched roof over a w×d footprint, ridge along w */
function gable(b: Builder, f: Frame, y: number, w: number, d: number, h: number, tone: Tone = 'wall') {
  const e = [P(f, -w, -d, y), P(f, w, -d, y), P(f, w, d, y), P(f, -w, d, y)]
  const r0 = P(f, -w, 0, y + h), r1 = P(f, w, 0, y + h)
  b.quad(e[0], e[1], r1, r0, tone)
  b.quad(e[3], e[2], r1, r0, tone)
  b.tri(e[0], e[3], r0, 'wall')
  b.tri(e[1], e[2], r1, 'wall')
  b.edge(r0, r1)
  b.edge(e[0], r0)
  b.edge(e[1], r1)
}

/** an n-sided column */
function cylinder(b: Builder, f: Frame, y0: number, r: number, h: number, n = 10, top: Tone = 'wall', windows = false) {
  const ring = (y: number) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [f.x + Math.cos(a) * r, y, f.z + Math.sin(a) * r]
  })
  const lo = ring(y0), hi = ring(y0 + h)
  const c = [f.x, y0 + h, f.z]
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    b.quad(lo[i], lo[j], hi[j], hi[i], 'wall')
    b.tri(c, hi[i], hi[j], top)
    b.edge(hi[i], hi[j])
    if (i % Math.ceil(n / 4) === 0) b.edge(lo[i], hi[i])
    if (windows && i % 2 === 0 && h > 0.8) {
      const a = ((i + 0.5) / n) * Math.PI * 2
      for (let y = y0 + 0.45; y < y0 + h - 0.3; y += 0.7) b.window([f.x + Math.cos(a) * (r + 0.012), y, f.z + Math.sin(a) * (r + 0.012)], [-Math.sin(a), 0, Math.cos(a)], 0.08, 0.12)
    }
  }
  return y0 + h
}

/** a low-poly dome */
function dome(b: Builder, f: Frame, y0: number, r: number, tone: Tone = 'wall') {
  const n = 10, m = 3
  const pt = (i: number, k: number) => {
    const a = (i / n) * Math.PI * 2
    const t = (k / m) * (Math.PI / 2)
    return [f.x + Math.cos(a) * r * Math.cos(t), y0 + r * Math.sin(t), f.z + Math.sin(a) * r * Math.cos(t)]
  }
  for (let k = 0; k < m; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      if (k === m - 1) b.tri(pt(i, k), pt(j, k), [f.x, y0 + r, f.z], tone)
      else b.quad(pt(i, k), pt(j, k), pt(j, k + 1), pt(i, k + 1), tone)
    }
  for (let i = 0; i < n; i++) b.edge(pt(i, 1), pt((i + 1) % n, 1))
  // the slit of the telescope
  b.edge(pt(0, 0), [f.x, y0 + r, f.z])
}

/** a tent: a ridge with two sloped canvas sides */
export function tent(b: Builder, f: Frame, y0: number, w: number, d: number, h: number) {
  const e = [P(f, -w, -d, y0), P(f, w, -d, y0), P(f, w, d, y0), P(f, -w, d, y0)]
  const r0 = P(f, -w * 0.9, 0, y0 + h), r1 = P(f, w * 0.9, 0, y0 + h)
  b.quad(e[0], e[1], r1, r0, 'canvas')
  b.quad(e[3], e[2], r1, r0, 'canvas')
  b.tri(e[0], e[3], r0, 'canvas')
  b.tri(e[1], e[2], r1, 'canvas')
  b.edge(r0, r1)
  b.edge(e[0], r0)
  b.edge(e[3], r0)
  b.edge(e[1], r1)
}

/** a thin pole with a small flag */
export function pole(b: Builder, x: number, z: number, y0: number, h: number, flag: Tone = 'roof') {
  b.edge([x, y0, z], [x, y0 + h, z])
  b.tri([x, y0 + h, z], [x + 0.55, y0 + h - 0.16, z], [x, y0 + h - 0.32, z], flag)
}

/** a sawtooth roof of n teeth over a box top */
function sawtooth(b: Builder, f: Frame, y: number, w: number, d: number, h: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const u0 = -w + (i / n) * 2 * w, u1 = -w + ((i + 1) / n) * 2 * w
    const a = P(f, u0, -d, y), bb = P(f, u1, -d, y), c = P(f, u1, d, y), dd = P(f, u0, d, y)
    const ta = P(f, u0, -d, y + h), td = P(f, u0, d, y + h)
    b.quad(ta, td, c, bb, 'wall') // the long slope
    b.quad(a, dd, td, ta, 'accent') // the glazed face
    b.tri(a, bb, ta, 'wall')
    b.tri(dd, c, td, 'wall')
    b.edge(ta, td)
  }
}

// ── the vocabularies ──

export interface Site {
  x: number
  z: number
  rot: number
  /** the footprint's half-size */
  s: number
}

/** a world's signature building: what its apps look like */
export function signature(t: Template, b: Builder, g: Ground, site: Site, big: boolean, r: () => number, roof: Tone) {
  const f = { x: site.x, z: site.z, rot: site.rot }
  const k = big ? 1.35 : 1
  switch (t) {
    case 'defi': {
      if (r() < 0.5) {
        // a market hall: long and low, with a pitched roof
        const w = 1.1 * k, d = 0.55 * k
        const y = footing(g, f, w, d)
        b.at(y)
        const top = box(b, f, y, w, d, 0.85 * k)
        gable(b, f, top, w, d, 0.45 * k, roof)
        return top + 0.45 * k
      }
      // a vault tower that steps in as it rises
      const w = 0.45 * k
      const y = footing(g, f, w, w)
      b.at(y)
      let top = box(b, f, y, w, w, 1.6 * k)
      top = box(b, f, top, w * 0.72, w * 0.72, 0.6 * k, { windows: false })
      return box(b, f, top, w * 0.42, w * 0.42, 0.4 * k, { roof, windows: false })
    }
    case 'agents': {
      if (r() < 0.55) {
        // a relay tower with an antenna
        const y = footing(g, f, 0.35 * k, 0.35 * k)
        b.at(y)
        const top = cylinder(b, f, y, 0.32 * k, 2.4 * k, 8, roof, true)
        b.edge([f.x, top, f.z], [f.x, top + 1.1 * k, f.z])
        return top + 1.1 * k
      }
      // a dock crane: a post and a long arm
      const y = footing(g, f, 0.5 * k, 0.5 * k)
      b.at(y)
      const base = box(b, f, y, 0.5 * k, 0.5 * k, 0.5 * k, { roof, windows: false })
      const post = box(b, { ...f, x: f.x }, base, 0.1 * k, 0.1 * k, 1.8 * k, { windows: false })
      box(b, { x: f.x + Math.cos(f.rot) * 0.7 * k, z: f.z + Math.sin(f.rot) * 0.7 * k, rot: f.rot }, post - 0.16 * k, 1.1 * k, 0.07 * k, 0.12 * k, { windows: false })
      return post
    }
    case 'game': {
      if (r() < 0.5) {
        // a ring arena: a low wall of segments around an open floor
        const R = 1.05 * k
        const y = footing(g, f, R, R)
        b.at(y)
        const n = 14
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          box(b, { x: f.x + Math.cos(a) * R, z: f.z + Math.sin(a) * R, rot: a + Math.PI / 2 }, y, 0.25 * k, 0.12 * k, 0.55 * k, { windows: false, edges: i % 2 === 0 })
        }
        return y + 0.55 * k
      }
      // a workshop with a chimney
      const w = 0.6 * k, d = 0.45 * k
      const y = footing(g, f, w, d)
      b.at(y)
      const top = box(b, f, y, w, d, 0.75 * k)
      gable(b, f, top, w, d, 0.35 * k, roof)
      box(b, { x: P(f, w * 0.55, d * 0.4, 0)[0], z: P(f, w * 0.55, d * 0.4, 0)[2], rot: f.rot }, top, 0.09 * k, 0.09 * k, 0.75 * k, { windows: false })
      return top + 0.75 * k
    }
    case 'creator': {
      if (r() < 0.5) {
        // a studio: sawtooth roof lights for even north light
        const w = 0.85 * k, d = 0.55 * k
        const y = footing(g, f, w, d)
        b.at(y)
        const top = box(b, f, y, w, d, 0.7 * k)
        sawtooth(b, f, top, w, d, 0.32 * k, 3)
        return top + 0.32 * k
      }
      // a row of storefronts, stepping in height
      const y = footing(g, f, 1.05 * k, 0.4 * k)
      b.at(y)
      let top = y
      for (let i = -1; i <= 1; i++) {
        const h = (0.7 + ((i + 2) % 3) * 0.25) * k
        const c = P(f, i * 0.7 * k, 0, 0)
        top = Math.max(top, box(b, { x: c[0], z: c[2], rot: f.rot }, y, 0.33 * k, 0.38 * k, h, { roof: i === 0 ? roof : 'wall' }))
      }
      return top
    }
    case 'prediction': {
      if (r() < 0.6) {
        // an observatory: a drum and a dome
        const y = footing(g, f, 0.6 * k, 0.6 * k)
        b.at(y)
        const top = cylinder(b, f, y, 0.55 * k, 0.9 * k, 12, 'wall', true)
        dome(b, f, top, 0.55 * k, roof)
        return top + 0.55 * k
      }
      // a tall mast
      const y = footing(g, f, 0.22 * k, 0.22 * k)
      b.at(y)
      const top = box(b, f, y, 0.2 * k, 0.2 * k, 3 * k, { windows: false })
      box(b, f, top, 0.32 * k, 0.32 * k, 0.12 * k, { roof, windows: false })
      return top + 0.12 * k
    }
    case 'frontier':
    default: {
      // a survey camp: a tent and a flagged pole
      const w = 0.7 * k, d = 0.5 * k
      const y = footing(g, f, w, d)
      b.at(y)
      tent(b, f, y, w, d, 0.75 * k)
      const p = P(f, w + 0.4, 0, 0)
      pole(b, p[0], p[2], y, 1.6 * k, roof)
      return y + 1.6 * k
    }
  }
}

/** an ordinary house: a box with a pitched roof (or a small tent, on the frontier) */
export function house(t: Template, b: Builder, g: Ground, site: Site, r: () => number) {
  const f = { x: site.x, z: site.z, rot: site.rot }
  const w = site.s, d = site.s * (0.65 + r() * 0.3)
  const y = footing(g, f, w, d)
  b.at(y)
  if (t === 'frontier') {
    tent(b, f, y, w, d, 0.5 + r() * 0.25)
    return
  }
  const top = box(b, f, y, w, d, 0.45 + r() * 0.6)
  if (t === 'creator' || r() < 0.55) gable(b, f, top, w, d, 0.28 + r() * 0.12)
}
