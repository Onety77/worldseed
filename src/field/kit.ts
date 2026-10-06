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

// each kind of world builds in its own materials: wall, roof, trim and canvas
export const PALETTES: Record<Template, { walls: string[]; roof: string; trim: string; canvas: string }> = {
  defi: { walls: ['#f3e9d6', '#efe2c9', '#f6efe1'], roof: '#c8633f', trim: '#c9b089', canvas: '#efe4cc' },
  agents: { walls: ['#eef1f2', '#e4e9ec', '#f4f5f3'], roof: '#4f7193', trim: '#98a5ad', canvas: '#e6ebee' },
  game: { walls: ['#efe1c6', '#e8d6b6', '#f3e8d2'], roof: '#b3483b', trim: '#8a6542', canvas: '#ecdcbc' },
  creator: { walls: ['#f5ebd9', '#f1e2ce', '#f8f1e4'], roof: '#3b9387', trim: '#c79c6d', canvas: '#f0e3cb' },
  prediction: { walls: ['#eef0f4', '#e5e8ef', '#f4f4f6'], roof: '#4b5e97', trim: '#9aa3b9', canvas: '#e8eaf0' },
  frontier: { walls: ['#e9dfc8', '#e3d6bb', '#efe6d2'], roof: '#cdb98f', trim: '#8b6b45', canvas: '#ede1c3' },
}
const GLASS = new THREE.Color('#3d5360')
const BRAND = new THREE.Color('#b9e536')
export const LAMP = new THREE.Color('#ffc66e')
const LAMP_DAY = new THREE.Color('#f1e3b8')
const WOOD = new THREE.Color('#8c6a47')

export type Tone = 'wall' | 'roof' | 'accent' | 'canvas' | 'brand' | 'trim' | 'lamp' | 'wood'

export interface Shared {
  uNight: { value: number }
  uHaze: { value: THREE.Color }
  uFog: { value: THREE.Vector2 }
}

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
  vec3 ink = mix(vec3(.12, .11, .09), vec3(.05, .07, .1), uNight);
  // ink edges are for close looks: they fade out as the camera pulls away
  float near = 1. - smoothstep(40., 140., vDist);
  gl_FragColor = vec4(mix(ink, uHaze, smoothstep(uFog.x, uFog.y, vDist)), uOpacity * mix(.42, .5, uNight) * near);
}`

/** buildings rise out of the ground: every vertex scales up from the ground it stands on */
const riseVertex = (glow: boolean) => /* glsl */ `
vec3 transformed = vec3(position);
transformed.y = base + (transformed.y - base) * uRise;
${glow ? 'vGlowK = glow;' : ''}`

export class Builder {
  private pos: number[] = []
  private col: number[] = []
  private glowA: number[] = []
  private base: number[] = []
  private edges: number[] = []
  private edgeBase: number[] = []
  private dashes: number[] = []
  private dashBase: number[] = []
  private dashLd: number[] = []
  private ground = 0
  /** chance a window is lit at night: busier worlds glow brighter */
  lit = 0.5
  /** chimney tops, for smoke */
  chimneys: { x: number; y: number; z: number }[] = []
  private r: () => number
  private pal: (typeof PALETTES)[Template]
  // this building's own wall tint and roof shade, so a town is not all one colour
  private wall = new THREE.Color()
  private roof = new THREE.Color()

  constructor(r: () => number, template: Template = 'frontier') {
    this.r = r
    this.pal = PALETTES[template]
    this.vary()
  }

  private vary() {
    this.wall.set(this.pal.walls[Math.floor(this.r() * this.pal.walls.length)])
    this.roof.set(this.pal.roof).multiplyScalar(0.88 + this.r() * 0.22)
  }

  /** set the ground height for the next building (it rises from here), and give it its own tints */
  at(ground: number) {
    this.ground = ground
    this.vary()
    return this
  }

  private colorOf(tone: Tone) {
    switch (tone) {
      case 'roof':
        return this.roof
      case 'brand':
        return BRAND
      case 'accent':
        return GLASS
      case 'canvas':
        return new THREE.Color(this.pal.canvas)
      case 'trim':
        return new THREE.Color(this.pal.trim)
      case 'lamp':
        return LAMP_DAY
      case 'wood':
        return WOOD
      default:
        return this.wall
    }
  }

  tri(a: number[], b: number[], c: number[], tone: Tone, glow = 0) {
    const k = this.colorOf(tone)
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2])
      this.col.push(k.r, k.g, k.b)
      this.glowA.push(glow)
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

  /** a window on a wall, centred at p, facing along n: dark glass by day, often lit at night */
  window(p: number[], along: number[], w: number, h: number) {
    const on = this.r() < this.lit ? 1 : 0
    const a = [p[0] - along[0] * w, p[1] - h, p[2] - along[2] * w]
    const b = [p[0] + along[0] * w, p[1] - h, p[2] + along[2] * w]
    const c = [p[0] + along[0] * w, p[1] + h, p[2] + along[2] * w]
    const d = [p[0] - along[0] * w, p[1] + h, p[2] - along[2] * w]
    this.tri(a, b, c, 'accent', on)
    this.tri(a, c, d, 'accent', on)
  }

  build(shared: Shared) {
    const group = new THREE.Group()
    const solid = new THREE.BufferGeometry()
    solid.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    solid.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    solid.setAttribute('glow', new THREE.Float32BufferAttribute(this.glowA, 1))
    solid.setAttribute('base', new THREE.Float32BufferAttribute(this.base, 1))
    solid.computeVertexNormals()
    const own = { uRise: { value: 1 }, uOpacity: { value: 1 } }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uRise: own.uRise, uNight: shared.uNight, uLamp: { value: LAMP } })
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float base;\nattribute float glow;\nuniform float uRise;\nvarying float vGlowK;')
        .replace('#include <begin_vertex>', riseVertex(true))
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uLamp;\nvarying float vGlowK;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLamp * vGlowK * uNight * 1.7;')
    }
    mat.customProgramCacheKey = () => 'kit-solid'
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide })
    depth.onBeforeCompile = (sh) => {
      sh.uniforms.uRise = own.uRise
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float base;\nuniform float uRise;').replace('#include <begin_vertex>', riseVertex(false))
    }
    depth.customProgramCacheKey = () => 'kit-depth'
    const mesh = new THREE.Mesh(solid, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.customDepthMaterial = depth
    group.add(mesh)
    const lines = (pts: number[], base: number[], ld: number[] | null, dash: number) => {
      if (!pts.length) return
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      g.setAttribute('base', new THREE.Float32BufferAttribute(base, 1))
      g.setAttribute('ld', new THREE.Float32BufferAttribute(ld ?? new Array(base.length).fill(0), 1))
      group.add(new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: lineVS, fragmentShader: lineFS, uniforms: { ...shared, ...own, uDash: { value: dash } }, transparent: true, depthWrite: false })))
    }
    lines(this.edges, this.edgeBase, null, 0)
    lines(this.dashes, this.dashBase, this.dashLd, 0.36)
    group.userData.own = own
    group.userData.solid = mat
    group.userData.chimneys = this.chimneys
    return group
  }
}

/** rise (0 under the ground … 1 standing) and fade, for a group the Builder made */
export function setLook(group: THREE.Group, rise: number, opacity: number) {
  const own = group.userData.own as { uRise: { value: number }; uOpacity: { value: number } } | undefined
  if (!own) return
  own.uRise.value = rise
  own.uOpacity.value = opacity
  const solid = group.userData.solid as THREE.MeshLambertMaterial | undefined
  if (solid && solid.opacity !== opacity) {
    solid.opacity = opacity
    solid.transparent = opacity < 0.999
  }
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
export function box(b: Builder, f: Frame, y0: number, w: number, d: number, h: number, opts: { roof?: Tone; windows?: boolean; edges?: boolean } = {}) {
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
  if (opts.windows !== false && h > 0.5) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot)
    const floors = Math.max(1, Math.floor(h / 0.72))
    // windows on the two long faces, set just proud of the wall
    for (const side of [-1, 1]) {
      const cols = Math.max(1, Math.floor(w / 0.42))
      for (let fl = 0; fl < floors; fl++)
        for (let ci = 0; ci < cols; ci++) {
          const u = -w + ((ci + 0.5) / cols) * 2 * w
          const p = P(f, u, side * (d + 0.012), y0 + Math.min(0.42, h * 0.55) + fl * 0.72)
          b.window(p, [c, 0, s], 0.09, 0.13)
        }
    }
  }
  return y0 + h
}

/** a pitched roof over a w×d footprint, ridge along w */
function gable(b: Builder, f: Frame, y: number, w: number, d: number, h: number, tone: Tone = 'roof') {
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
export function cylinder(b: Builder, f: Frame, y0: number, r: number, h: number, n = 10, top: Tone = 'wall', windows = false) {
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
export function dome(b: Builder, f: Frame, y0: number, r: number, tone: Tone = 'wall') {
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

/** a hipped roof rising to a point over a w×d footprint */
export function pyramid(b: Builder, f: Frame, y: number, w: number, d: number, h: number, tone: Tone = 'roof') {
  const e = [P(f, -w, -d, y), P(f, w, -d, y), P(f, w, d, y), P(f, -w, d, y)]
  const top = P(f, 0, 0, y + h)
  for (let i = 0; i < 4; i++) {
    b.tri(e[i], e[(i + 1) % 4], top, tone)
    b.edge(e[i], top)
  }
}

/** a pennant on a pole, in the world's roof colour */
export function flagpole(b: Builder, x: number, z: number, y0: number, h: number) {
  b.edge([x, y0, z], [x, y0 + h, z])
  box(b, { x, z, rot: 0 }, y0, 0.02, 0.02, h, { roof: 'trim', windows: false, edges: false })
  b.tri([x, y0 + h, z], [x + 0.5, y0 + h - 0.13, z + 0.05], [x, y0 + h - 0.28, z], 'roof')
}

/** each world's landmark: its main app, standing on the summit square */
function landmark(t: Template, b: Builder, g: Ground, f: Frame) {
  const at = (i: number, k: number) => {
    const p = P(f, i, k, 0)
    return { x: p[0], z: p[2], rot: f.rot }
  }
  switch (t) {
    case 'defi': {
      // the Exchange: a long hall behind a colonnade, and a clock tower at one end
      const w = 1.35, d = 0.75
      const y = footing(g, f, w, d)
      b.at(y)
      const base = box(b, f, y, w * 1.06, d * 1.1, 0.16, { roof: 'trim', windows: false })
      const top = box(b, f, base, w, d, 1.05)
      gable(b, f, top, w * 1.06, d * 1.1, 0.5)
      for (let i = 0; i < 6; i++) box(b, at(-w + 0.18 + (i * (2 * w - 0.36)) / 5, d + 0.2), base, 0.05, 0.05, 1.0, { roof: 'trim', windows: false, edges: false })
      box(b, at(0, d + 0.2), base + 1.0, w, 0.1, 0.08, { roof: 'trim', windows: false })
      const tw = at(w - 0.25, -d + 0.1)
      const tt = box(b, tw, base, 0.32, 0.32, 2.3)
      pyramid(b, tw, tt, 0.38, 0.38, 0.65)
      return tt + 0.65
    }
    case 'agents': {
      // the relay spire: a plinth, a tall shaft with two balconies, and a dish at the top
      const y = footing(g, f, 0.8, 0.8)
      b.at(y)
      const base = cylinder(b, f, y, 0.8, 0.55, 12, 'trim')
      let top = cylinder(b, f, base, 0.4, 1.2, 10, 'wall', true)
      top = cylinder(b, f, top, 0.58, 0.08, 12, 'roof')
      top = cylinder(b, f, top, 0.34, 1.0, 10, 'wall', true)
      top = cylinder(b, f, top, 0.5, 0.08, 12, 'roof')
      top = cylinder(b, f, top, 0.22, 0.6, 8, 'wall')
      dome(b, f, top, 0.3, 'roof')
      b.edge([f.x, top + 0.3, f.z], [f.x, top + 1.3, f.z])
      return top + 1.3
    }
    case 'game': {
      // the arena: a ring of stands round an open floor, with banners
      const R = 1.45
      const y = footing(g, f, R, R)
      b.at(y)
      b.quad(P(f, -R, -R, y + 0.05), P(f, R, -R, y + 0.05), P(f, R, R, y + 0.05), P(f, -R, R, y + 0.05), 'canvas')
      const n = 18
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        box(b, { x: f.x + Math.cos(a) * R, z: f.z + Math.sin(a) * R, rot: a + Math.PI / 2 }, y, 0.27, 0.16, 0.7, { roof: 'roof', windows: false, edges: i % 3 === 0 })
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4
        flagpole(b, f.x + Math.cos(a) * (R + 0.2), f.z + Math.sin(a) * (R + 0.2), y, 1.5)
      }
      return y + 1.5
    }
    case 'creator': {
      // the studio hall: sawtooth roof lights, a tall chimney and a banner
      const w = 1.3, d = 0.8
      const y = footing(g, f, w, d)
      b.at(y)
      const base = box(b, f, y, w * 1.04, d * 1.06, 0.14, { roof: 'trim', windows: false })
      const top = box(b, f, base, w, d, 1.0)
      sawtooth(b, f, top, w, d, 0.42, 4)
      const c = at(-w + 0.2, -d + 0.2)
      box(b, c, top, 0.12, 0.12, 1.1, { roof: 'trim', windows: false })
      flagpole(b, at(w - 0.1, d).x, at(w - 0.1, d).z, top, 1.0)
      return top + 1.1
    }
    case 'prediction': {
      // the observatory: a drum, a great dome, and a little side tower
      const y = footing(g, f, 0.9, 0.9)
      b.at(y)
      const base = cylinder(b, f, y, 0.95, 0.2, 14, 'trim')
      const top = cylinder(b, f, base, 0.82, 1.05, 14, 'wall', true)
      dome(b, f, top, 0.82, 'roof')
      const side = at(1.0, 0.4)
      const st = box(b, side, base, 0.24, 0.24, 1.5)
      pyramid(b, side, st, 0.28, 0.28, 0.4)
      return top + 0.82
    }
    case 'frontier':
    default: {
      // the expedition tent, with flags
      const w = 1.0, d = 0.75
      const y = footing(g, f, w, d)
      b.at(y)
      tent(b, f, y, w, d, 1.05)
      flagpole(b, at(w + 0.4, 0).x, at(w + 0.4, 0).z, y, 1.8)
      flagpole(b, at(-w - 0.4, 0.2).x, at(-w - 0.4, 0.2).z, y, 1.4)
      return y + 1.8
    }
  }
}

/** a world's signature building: what its apps look like (big: the landmark on the summit) */
export function signature(t: Template, b: Builder, g: Ground, site: Site, big: boolean, r: () => number, roof: Tone) {
  const f = { x: site.x, z: site.z, rot: site.rot }
  if (big && roof === 'roof') return landmark(t, b, g, f)
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
      const top = box(b, f, y, 0.2 * k, 0.2 * k, 2.1 * k, { windows: false })
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

/** an ordinary house: walls on a stone footing, a pitched roof with a little overhang, a door, often a chimney */
export function house(t: Template, b: Builder, g: Ground, site: Site, r: () => number) {
  const f = { x: site.x, z: site.z, rot: site.rot }
  const w = site.s, d = site.s * (0.62 + r() * 0.28)
  const y = footing(g, f, w, d)
  b.at(y)
  if (t === 'frontier') {
    tent(b, f, y, w, d, 0.55 + r() * 0.25)
    return
  }
  // a stone footing where the ground falls away
  const plinth = box(b, f, y, w * 1.04, d * 1.04, 0.14, { roof: 'trim', windows: false, edges: false })
  const tall = r() < 0.22
  const h = tall ? 1.05 + r() * 0.35 : 0.55 + r() * 0.3
  const top = box(b, f, plinth, w, d, h)
  // a door on the front, facing downhill
  const door = P(f, (r() - 0.5) * w * 0.8, d + 0.014, plinth + 0.19)
  const c = Math.cos(f.rot), sn = Math.sin(f.rot)
  b.quad([door[0] - c * 0.09, plinth + 0.01, door[2] - sn * 0.09], [door[0] + c * 0.09, plinth + 0.01, door[2] + sn * 0.09], [door[0] + c * 0.09, plinth + 0.36, door[2] + sn * 0.09], [door[0] - c * 0.09, plinth + 0.36, door[2] - sn * 0.09], 'wood')
  if (t === 'creator' || r() < 0.8) gable(b, f, top, w * 1.1, d * 1.12, 0.3 + r() * 0.16)
  else box(b, f, top, w * 1.02, d * 1.02, 0.06, { roof: 'roof', windows: false })
  if (r() < 0.45) {
    const c = P(f, w * 0.5, -d * 0.3, 0)
    box(b, { x: c[0], z: c[2], rot: f.rot }, top, 0.07, 0.07, 0.42, { roof: 'trim', windows: false })
    b.chimneys.push({ x: c[0], y: top + 0.45, z: c[2] })
  }
}

/** a lantern on a post: a small warm light after dark */
export function lantern(b: Builder, g: Ground, x: number, z: number) {
  const y = g(x, z) - 0.03
  b.at(y)
  const f = { x, z, rot: 0 }
  box(b, f, y, 0.025, 0.025, 0.55, { roof: 'wood', windows: false, edges: false })
  const k = 0.06
  const lo = [P(f, -k, -k, y + 0.55), P(f, k, -k, y + 0.55), P(f, k, k, y + 0.55), P(f, -k, k, y + 0.55)]
  const hi = lo.map((p) => [p[0], p[1] + 0.12, p[2]])
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    b.tri(lo[i], lo[j], hi[j], 'lamp', 1)
    b.tri(lo[i], hi[j], hi[i], 'lamp', 1)
  }
  b.tri(hi[0], hi[1], hi[2], 'trim')
  b.tri(hi[0], hi[2], hi[3], 'trim')
}

/** a crate or two of supplies */
export function crates(b: Builder, g: Ground, x: number, z: number, r: () => number) {
  const n = 1 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const f = { x: x + (r() - 0.5) * 0.7, z: z + (r() - 0.5) * 0.7, rot: r() * Math.PI }
    const s = 0.12 + r() * 0.08
    const y = footing(g, f, s, s)
    b.at(y)
    box(b, f, y, s, s, s * 1.6, { roof: 'wood', windows: false })
  }
}

/** a campfire: a ring of stones and a glow */
export function campfire(b: Builder, g: Ground, x: number, z: number) {
  const y = g(x, z) - 0.02
  b.at(y)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    box(b, { x: x + Math.cos(a) * 0.28, z: z + Math.sin(a) * 0.28, rot: a }, y, 0.06, 0.05, 0.07, { roof: 'trim', windows: false, edges: false })
  }
  const f = { x, z, rot: 0.6 }
  const k = 0.11
  b.tri(P(f, -k, 0, y + 0.02), P(f, k, 0, y + 0.02), [x, y + 0.32, z], 'lamp', 1)
  b.tri(P(f, 0, -k, y + 0.02), P(f, 0, k, y + 0.02), [x, y + 0.26, z], 'lamp', 1)
}
