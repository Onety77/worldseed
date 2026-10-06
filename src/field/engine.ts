import * as THREE from 'three'
import { CONTOUR, GLSL, INDEX_EVERY, MAX_HILLS, heightAt, type Hill } from './height'
import { buildSettlement, disposeGroup, setOpacity } from './settlement'
import { District, type Anchor, type DistrictInput } from './district'

/*
  The Field: one WebGL scene that lives behind every page. A topographic landscape in ink
  on survey paper. Pages tell it what to look at (a view) and which worlds to show; it
  animates the camera and the terrain toward that, and renders only while something moves.
*/

export interface FieldWorld {
  id: string
  hill: Hill
  /** dimmed by a filter */
  muted: boolean
  /** apps it has deployed: one small block each on its hill */
  built: number
}

export type View =
  | { kind: 'atlas' }
  | { kind: 'world'; id: string }
  | { kind: 'district'; id: string }
  | { kind: 'plot'; x: number; z: number }
  | { kind: 'coast' }
  | { kind: 'backdrop' }

export interface Projected {
  id: string
  x: number
  y: number
  /** 0 near … 1 far */
  depth: number
  visible: boolean
}

const PAPER = new THREE.Color('#eceee8')
const HAZE = new THREE.Color('#e4e8e3')
const VALLEY = new THREE.Color('#d2d8cf')
const PEAK = new THREE.Color('#f7f8f3')
const INK = new THREE.Color('#141813')
const SPROUT = new THREE.Color('#c4ef3a')
const GREEN = new THREE.Color('#3f6b00')
const WATER = new THREE.Color('#cddadb')

const terrainVS = (hq: boolean) => /* glsl */ `
${GLSL}
uniform vec4 uHill[${MAX_HILLS}];
uniform vec4 uMeta[${MAX_HILLS}];
uniform int uCount;
varying float vH;
varying vec3 vN;
varying vec2 vP;
varying float vDist;
float H(vec2 p) {
  float y = continent(p);
  for (int i = 0; i < ${MAX_HILLS}; i++) {
    if (i >= uCount) break;
    y += hill(p, uHill[i], uMeta[i]);
  }
  return y;
}
void main() {
  vec2 p = position.xz;
  float h = H(p);
  float e = .35;
  ${hq ? 'vec3 n = normalize(vec3(H(p - vec2(e, 0.)) - H(p + vec2(e, 0.)), 2. * e, H(p - vec2(0., e)) - H(p + vec2(0., e))));' : 'vec3 n = normalize(vec3(h - H(p + vec2(e, 0.)), e, h - H(p + vec2(0., e))));'}
  vH = h;
  vN = n;
  vP = p;
  vec4 mv = modelViewMatrix * vec4(p.x, max(h, 0.), p.y, 1.);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`

const terrainFS = (hq: boolean) => /* glsl */ `
${hq ? GLSL : ''}
uniform vec3 uPaper, uValley, uPeak, uInk, uSprout, uGreen, uWater, uHaze;
uniform float uT;
uniform vec4 uHill[${MAX_HILLS}];
uniform vec4 uMeta[${MAX_HILLS}];
uniform int uCount;
uniform vec4 uPing[8];
uniform vec2 uFog;
varying float vH;
varying vec3 vN;
varying vec2 vP;
varying float vDist;
float lineAt(float v, float width) {
  float w = max(fwidth(v), 1e-4);
  return 1. - smoothstep(0., w * width, abs(fract(v - .5) - .5));
}
void main() {
  // on capable screens the height is recomputed per pixel so contours stay smooth curves
  float hgt = vH;
  ${hq ? `hgt = continent(vP);
  for (int i = 0; i < ${MAX_HILLS}; i++) { if (i >= uCount) break; hgt += hill(vP, uHill[i], uMeta[i]); }` : ''}
  vec3 l = normalize(vec3(-.45, .85, .35));
  float lit = clamp(dot(normalize(vN), l), 0., 1.);
  vec3 col = mix(uValley, uPaper, smoothstep(.35, .95, lit));
  col = mix(col, uPeak, smoothstep(2., 9., hgt) * .6);

  float c = lineAt(hgt / ${CONTOUR.toFixed(2)}, 1.);
  float idx = lineAt(hgt / ${(CONTOUR * INDEX_EVERY).toFixed(2)}, 1.5);
  float coast = 1. - smoothstep(0., max(fwidth(hgt), 1e-4) * 2., abs(hgt));
  float land = step(0., hgt);
  float ink = (.17 * c + .3 * idx) * land + .62 * coast;

  // below sea level: water, with cartographic waterlines that echo the coast and fade offshore
  float depth = max(-hgt, 0.);
  float wl = lineAt(depth / .42, .9) * (1. - smoothstep(.2, 2.4, depth)) * step(.08, depth);
  float hv = (vP.y + sin(vP.x * .08 + uT * .15) * .35) / 1.1;
  float hatch = lineAt(hv, .7) * .07 * (1. - smoothstep(.25, .6, fwidth(hv)));
  vec3 sea = mix(uWater, uWater * .96, smoothstep(0., 3., depth));
  sea = mix(sea, uInk, wl * .26 + hatch);
  col = mix(sea, col, land);

  // worlds: a focused one fills with sprout and its contours turn green; muted ones fade
  float green = 0.;
  float muted = 0.;
  for (int i = 0; i < ${MAX_HILLS}; i++) {
    if (i >= uCount) break;
    vec4 h = uHill[i];
    vec4 m = uMeta[i];
    float t = length(vP - h.xy) / max(h.z, .001);
    float inside = 1. - smoothstep(.92, 1.08, t);
    green = max(green, inside * m.z);
    muted = max(muted, inside * m.w);
  }
  col = mix(col, uSprout, green * .24);
  ink *= 1. - muted * .55;

  // evidence pings: a ring of green runs out from the world that published it
  float ring = 0.;
  for (int i = 0; i < 8; i++) {
    vec4 pg = uPing[i];
    if (pg.w <= 0.) continue;
    float d = length(vP - pg.xy);
    float r = pg.z * 7. * pg.w;
    ring = max(ring, exp(-pow((d - r) / (.4 * pg.w), 2.)) * smoothstep(.08, .3, pg.z) * (1. - smoothstep(.4, 1.7, pg.z)));
  }

  vec3 lineCol = mix(uInk, uGreen, max(green, ring));
  col = mix(col, uSprout, ring * .5);
  col = mix(col, lineCol, clamp(ink + ring * .35, 0., 1.));
  float fog = smoothstep(uFog.x, uFog.y, vDist);
  gl_FragColor = vec4(mix(col, uHaze, fog), 1.);
}`

const waterVS = /* glsl */ `
varying vec2 vP;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vP = world.xz;
  vec4 mv = viewMatrix * world;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

const waterFS = /* glsl */ `
uniform vec3 uWater, uInk, uHaze;
uniform vec2 uFog;
uniform float uT;
varying vec2 vP;
varying vec3 vView;
void main() {
  float vDist = length(vView);
  // cartographic water: fine horizontal hatching that drifts very slowly
  float v = (vP.y + sin(vP.x * .08 + uT * .15) * .35) / 1.1;
  float fw = max(fwidth(v), 1e-4);
  float line = (1. - smoothstep(0., fw * .7, abs(fract(v - .5) - .5))) * (1. - smoothstep(.25, .6, fw));
  vec3 col = mix(uWater * .96, uInk, line * .07);
  float fog = smoothstep(uFog.x, uFog.y, vDist);
  gl_FragColor = vec4(mix(col, uHaze, fog), 1.);
}`

interface Cam {
  tx: number
  tz: number
  dist: number
  tilt: number
  az: number
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export class FieldEngine {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 1, 900)
  private terrain: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private bridges = new THREE.Group()
  private towns = new THREE.Group()
  private settlements = new Map<string, { key: string; group: THREE.Group }>()
  private worlds: FieldWorld[] = []
  /** what each hill currently looks like, easing toward its target */
  private shown = new Map<string, Hill & { green: number; muted: number }>()
  private focus: string | null = null
  private hover: string | null = null
  private pings: { x: number; z: number; at: number; scale: number }[] = []
  private view: View = { kind: 'atlas' }
  private cam: Cam = { tx: 0, tz: 6, dist: 190, tilt: 0.95, az: 0.5 }
  private goal: Cam = { tx: 0, tz: 0, dist: 128, tilt: 0.86, az: 0.5 }
  private drift = true
  private raf = 0
  private last = 0
  private t0 = performance.now()
  private size = { w: 1, h: 1 }
  private listeners = new Set<(p: Projected[]) => void>()
  private hoverListeners = new Set<(id: string | null) => void>()
  private selectListeners = new Set<(id: string) => void>()
  /** screen space covered by panels, so the subject sits in the open part of the Field */
  private inset = { left: 0, right: 0, top: 0, bottom: 0 }
  private dragging = false
  private interacted = 0
  private reduced = false
  private paused = false
  private quality: 'high' | 'low'
  /** the distance the current view frames at; zooming moves within a range of it */
  private base = 128
  /** momentum left over from a flick: ground units (or radians) per second */
  private vel = { tx: 0, tz: 0, az: 0 }
  private lastRender = 0
  private district: { input: DistrictInput; d: District; shown: number } | null = null

  constructor(container: HTMLElement, quality: 'high' | 'low') {
    this.quality = quality
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: quality === 'high' ? 'high-performance' : 'default' })
    // phones have dense screens; 1.5x is sharp enough for ink lines and halves the pixel work of 3x
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.5))
    this.renderer.setClearColor(HAZE)
    this.canvas = this.renderer.domElement
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none'
    container.appendChild(this.canvas)

    const common = {
      uPaper: { value: PAPER },
      uInk: { value: INK },
      uFog: { value: new THREE.Vector2(130, 330) },
      uHaze: { value: HAZE },
      uWater: { value: WATER },
      uT: { value: 0 },
    }
    const seg = quality === 'high' ? 360 : 180
    const geo = new THREE.PlaneGeometry(200, 200, seg, seg)
    geo.rotateX(-Math.PI / 2)
    this.terrain = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: terrainVS(quality === 'high'),
        fragmentShader: terrainFS(quality === 'high'),
        uniforms: {
          ...common,
          uValley: { value: VALLEY },
          uPeak: { value: PEAK },
          uSprout: { value: SPROUT },
          uGreen: { value: GREEN },
          uHill: { value: Array.from({ length: MAX_HILLS }, () => new THREE.Vector4()) },
          uMeta: { value: Array.from({ length: MAX_HILLS }, () => new THREE.Vector4()) },
          uCount: { value: 0 },
          uPing: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
        },
      }),
    )
    const wgeo = new THREE.PlaneGeometry(900, 900, 1, 1)
    wgeo.rotateX(-Math.PI / 2)
    this.water = new THREE.Mesh(
      wgeo,
      new THREE.ShaderMaterial({ vertexShader: waterVS, fragmentShader: waterFS, uniforms: common }),
    )
    this.water.position.y = -0.05
    this.scene.add(this.water, this.terrain, this.bridges, this.towns)
    this.scene.fog = new THREE.Fog(HAZE, 130, 330)
    this.bindInput()
    this.resize()
  }

  // ── what to show ──

  /** honour reduced motion: no drift, cuts instead of camera moves */
  setReduced(on: boolean) {
    this.reduced = on
    this.wake()
  }

  setWorlds(list: FieldWorld[]) {
    this.worlds = list.slice(0, MAX_HILLS)
    for (const w of this.worlds) {
      if (!this.shown.has(w.id)) this.shown.set(w.id, { ...w.hill, height: 0, moat: w.hill.moat > 0.5 && !this.reduced ? 0 : w.hill.moat, green: 0, muted: 0 })
    }
    this.syncSettlements()
    this.wake()
  }

  setInset(i: { left: number; right: number; top: number; bottom: number }) {
    const k = this.inset
    if (k.left === i.left && k.right === i.right && k.top === i.top && k.bottom === i.bottom) return
    this.inset = i
    this.applyOffset()
    this.setView(this.view)
  }

  /** shift the picture so the camera's target lands in the middle of the uncovered area */
  private applyOffset() {
    const { w, h } = this.size
    const i = this.inset
    const cx = i.left + (w - i.left - i.right) / 2
    const cy = i.top + (h - i.top - i.bottom) / 2
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h)
  }

  /** how much to pull back so a subject framed for the full screen fits the open area */
  private room() {
    const { w, h } = this.size
    const fw = Math.max(240, w - this.inset.left - this.inset.right) / w
    const fh = Math.max(200, h - this.inset.top - this.inset.bottom) / h
    return 1 / Math.min(1, Math.max(0.45, Math.min(fw * 1.15, fh * 1.05)))
  }

  /** carry a hill's current shape over to a new id (a draft plot becoming a real world) */
  adopt(from: string, to: string) {
    const s = this.shown.get(from)
    if (s) this.shown.set(to, { ...s })
    const st = this.settlements.get(from)
    if (st) {
      this.settlements.delete(from)
      this.settlements.set(to, st)
    }
  }

  setView(v: View) {
    const changed = JSON.stringify(v) !== JSON.stringify(this.view)
    this.view = v
    const room = this.room()
    this.drift = v.kind !== 'plot'
    const w = v.kind === 'world' || v.kind === 'district' ? this.worlds.find((x) => x.id === v.id) : null
    const narrow = this.size.w < 700
    if (v.kind === 'atlas') this.goal = { ...this.goal, tx: 0, tz: 2, dist: narrow ? 112 * Math.min(room, 1.45) : 118 * room, tilt: 0.86 }
    else if (v.kind === 'coast') this.goal = { ...this.goal, tx: 0, tz: 0, dist: narrow ? 120 * Math.min(room, 1.3) : 128 * room, tilt: 1.02 }
    else if (v.kind === 'backdrop') this.goal = { ...this.goal, tx: 0, tz: 0, dist: 150, tilt: 0.7 }
    else if (v.kind === 'plot') this.goal = { ...this.goal, tx: v.x, tz: v.z, dist: (narrow ? 56 : 44) * room, tilt: 0.8 }
    else if (w && v.kind === 'district') this.goal = { ...this.goal, tx: w.hill.x, tz: w.hill.z, dist: (narrow ? 30 + w.hill.radius * 2.5 : (14 + w.hill.radius * 1.9) * Math.sqrt(room)), tilt: 1.02 }
    else if (w) this.goal = { ...this.goal, tx: w.hill.x, tz: w.hill.z, dist: ((narrow ? 40 : 28) + w.hill.radius * 2.6) * Math.sqrt(room), tilt: 0.92 }
    this.base = this.goal.dist
    if (changed) this.vel = { tx: 0, tz: 0, az: 0 }
    this.wake()
  }

  /** what stands inside a world, for when you step into it; null clears it */
  setDistrict(input: DistrictInput | null) {
    const same = this.district && input && JSON.stringify(this.district.input) === JSON.stringify(input)
    if (same) return
    if (this.district) {
      this.towns.remove(this.district.d.group)
      this.district.d.dispose()
      this.district = null
    }
    const w = input && this.worlds.find((x) => x.id === input.id)
    if (input && w) {
      const d = new District(input, w.hill, this.worlds.map((x) => x.hill))
      d.setOpacity(0)
      this.towns.add(d.group)
      this.district = { input, d, shown: 0 }
    }
    this.wake()
  }

  /** where the buildings and sites of the open district are, for labels */
  districtAnchors(): Anchor[] {
    return this.district?.d.anchors ?? []
  }

  // ── controls, for buttons and keys ──

  zoomBy(f: number) {
    this.interacted = performance.now()
    this.zoom(f)
  }

  /** turn the Field by an angle (radians) */
  turn(a: number) {
    this.interacted = performance.now()
    this.goal.az += a
    this.wake()
  }

  /** back to how the current view frames things, facing the usual way */
  recenter() {
    this.vel = { tx: 0, tz: 0, az: 0 }
    this.goal.az = Math.round((this.goal.az - 0.5) / (Math.PI * 2)) * Math.PI * 2 + 0.5
    this.setView(this.view)
  }

  /** stop drawing while the Field is fully covered (a sheet pulled all the way up) */
  setPaused(on: boolean) {
    if (this.paused === on) return
    this.paused = on
    if (!on) this.wake()
  }

  /** which way the camera faces, in radians; 0.5 is the usual heading */
  heading() {
    return this.cam.az
  }

  /** a point on screen for any spot in the Field */
  projectPoint(x: number, y: number, z: number) {
    return this.project(x, y, z)
  }

  setFocus(id: string | null) {
    this.focus = id
    this.wake()
  }

  setHover(id: string | null) {
    if (this.hover === id) return
    this.hover = id
    this.canvas.style.cursor = id ? 'pointer' : ''
    this.hoverListeners.forEach((f) => f(id))
    this.wake()
  }

  onHover(cb: (id: string | null) => void) {
    this.hoverListeners.add(cb)
    return () => {
      this.hoverListeners.delete(cb)
    }
  }

  /** a world clicked or tapped on the Field */
  onSelect(cb: (id: string) => void) {
    this.selectListeners.add(cb)
    return () => {
      this.selectListeners.delete(cb)
    }
  }

  ping(id: string) {
    const w = this.worlds.find((x) => x.id === id)
    if (!w) return
    const inside = this.district && this.view.kind === 'district' && this.view.id === id
    const at = inside ? this.district!.d.pingSpot() : { x: w.hill.x, z: w.hill.z }
    this.pings = [...this.pings.slice(-7), { ...at, at: performance.now(), scale: inside ? 0.32 : 1 }]
    this.wake()
  }

  /** screen positions of every world's summit, for the label layer */
  onFrame(cb: (p: Projected[]) => void) {
    this.listeners.add(cb)
    this.wake()
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** the world under a point on screen, by its projected summit and footprint */
  pick(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    let best: { id: string; d: number } | null = null
    for (const w of this.worlds) {
      if (w.muted || (this.view.kind === 'district' && this.view.id === w.id)) continue
      const s = this.shown.get(w.id)!
      const top = this.project(w.hill.x, s.height * 0.6 + 0.5, w.hill.z)
      const edge = this.project(w.hill.x + w.hill.radius * 0.8, 0.5, w.hill.z)
      const r = Math.max(18, Math.hypot(edge.x - top.x, edge.y - top.y))
      const d = Math.hypot(px - top.x, py - top.y)
      if (d < r && (!best || d < best.d)) best = { id: w.id, d }
    }
    return best?.id ?? null
  }

  // ── lifecycle ──

  resize() {
    const p = this.canvas.parentElement
    if (!p) return
    this.size = { w: p.clientWidth, h: p.clientHeight }
    this.renderer.setSize(this.size.w, this.size.h, false)
    this.camera.aspect = this.size.w / this.size.h
    this.applyOffset()
    this.camera.updateProjectionMatrix()
    this.setView(this.view)
  }

  wake() {
    if (!this.raf && !this.paused) this.raf = requestAnimationFrame(this.frame)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.terrain.geometry.dispose()
    this.terrain.material.dispose()
    this.water.geometry.dispose()
    this.water.material.dispose()
    this.settlements.forEach((st) => disposeGroup(st.group))
    this.district?.d.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  // ── internals ──

  private syncSettlements() {
    const targets = this.worlds.map((w) => w.hill)
    const live = new Set(this.worlds.map((w) => w.id))
    for (const [id, st] of this.settlements) {
      if (live.has(id)) continue
      this.towns.remove(st.group)
      disposeGroup(st.group)
      this.settlements.delete(id)
    }
    const r = (n: number) => n.toFixed(1)
    for (const w of this.worlds) {
      const key = [r(w.hill.radius), r(w.hill.height), w.hill.tiers, w.hill.moat, w.built].join()
      const prev = this.settlements.get(w.id)
      if (prev?.key === key) continue
      if (prev) {
        this.towns.remove(prev.group)
        disposeGroup(prev.group)
      }
      const group = buildSettlement(w.id, w.hill, targets, w.built)
      setOpacity(group, 0)
      this.towns.add(group)
      this.settlements.set(w.id, { key, group })
    }
  }

  private hills(): Hill[] {
    return this.worlds.map((w) => this.shown.get(w.id)!)
  }

  private project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h, z: v.z }
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000)
    this.last = now
    let moving = false

    // a flick keeps going for a moment, then settles
    const v = this.vel
    if (!this.dragging && (Math.abs(v.tx) + Math.abs(v.tz) > 0.05 || Math.abs(v.az) > 0.002)) {
      this.goal.tx = Math.max(-60, Math.min(60, this.goal.tx + v.tx * dt))
      this.goal.tz = Math.max(-60, Math.min(60, this.goal.tz + v.tz * dt))
      this.goal.az += v.az * dt
      const decay = Math.pow(0.02, dt)
      v.tx *= decay
      v.tz *= decay
      v.az *= decay
      this.interacted = now
      moving = true
    }

    // camera eases toward its goal; when idle it drifts slowly round
    const idle = !this.dragging && now - this.interacted > 2500
    if (this.drift && !this.reduced && idle) this.goal.az += dt * (this.view.kind === 'world' ? 0.05 : this.view.kind === 'district' ? 0.025 : 0.018)
    // follow fingers closely; travel between views more gently
    const k = 1 - Math.pow(this.dragging ? 0.000002 : 0.0015, dt)
    let easing = false
    for (const key of ['tx', 'tz', 'dist', 'tilt', 'az'] as const) {
      const next = this.reduced ? this.goal[key] : lerp(this.cam[key], this.goal[key], k)
      if (Math.abs(next - this.goal[key]) > 0.002) easing = true
      this.cam[key] = next
    }
    if (easing) moving = true
    // only the slow idle drift is moving: on modest devices, draw it at half rate
    const driftOnly = this.drift && !this.reduced && !easing && idle
    if (driftOnly) moving = true

    // hills ease toward their targets: growth, terraces, the moat, focus and filters
    const g = 1 - Math.pow(0.12, dt)
    this.worlds.forEach((w, i) => {
      const s = this.shown.get(w.id)!
      const green = w.id === this.focus ? 1 : w.id === this.hover ? 0.55 : 0
      const target = { height: w.hill.height, radius: w.hill.radius, tiers: w.hill.tiers, moat: w.hill.moat, green, muted: w.muted ? 1 : 0 }
      for (const key of Object.keys(target) as (keyof typeof target)[]) {
        // growth is unhurried; the moat opens slower still
        const speed = key === 'moat' ? 1 - Math.pow(0.5, dt) : key === 'height' ? 1 - Math.pow(0.25 + (i % 5) * 0.05, dt) : g
        const next = this.reduced ? target[key] : lerp(s[key], target[key], speed)
        if (Math.abs(next - target[key]) > 0.002) moving = true
        s[key] = next
      }
    })

    // uniforms
    const u = this.terrain.material.uniforms
    u.uCount.value = this.worlds.length
    this.worlds.forEach((w, i) => {
      const s = this.shown.get(w.id)!
      u.uHill.value[i].set(w.hill.x, w.hill.z, s.radius, s.height)
      u.uMeta.value[i].set(s.tiers, s.moat, s.green, s.muted)
    })
    // settlements appear once their hill has grown into place
    for (const w of this.worlds) {
      const st = this.settlements.get(w.id)
      const s = this.shown.get(w.id)!
      if (!st) continue
      const grown = Math.min(1, Math.max(0, (s.height / Math.max(w.hill.height, 0.01) - 0.9) / 0.1))
      const replaced = this.district?.input.id === w.id ? this.district.shown : 0
      setOpacity(st.group, grown * (1 - s.muted * 0.75) * (1 - replaced))
    }
    // inside a world: its district fades in over the plain settlement, and its agents walk
    if (this.district) {
      const want = this.view.kind === 'district' && this.view.id === this.district.input.id ? 1 : 0
      const dd = this.district
      const next = this.reduced ? want : lerp(dd.shown, want, 1 - Math.pow(0.02, dt))
      if (Math.abs(next - want) > 0.004) moving = true
      dd.shown = Math.abs(next - want) < 0.004 ? want : next
      dd.d.setOpacity(dd.shown)
      if (dd.shown > 0 && !this.reduced && dd.d.step(dt)) moving = true
    }

    this.pings = this.pings.filter((p) => now - p.at < 2400)
    for (let i = 0; i < 8; i++) {
      const p = this.pings[i]
      if (p) u.uPing.value[i].set(p.x, p.z, (now - p.at) / 1000, p.scale)
      else u.uPing.value[i].set(0, 0, 0, 0)
    }
    if (this.pings.length) moving = true
    this.water.material.uniforms.uT.value = (now - this.t0) / 1000
    u.uT.value = this.water.material.uniforms.uT.value

    if (driftOnly && this.quality === 'low' && !this.pings.length && now - this.lastRender < 30) {
      if (!document.hidden) this.wake()
      return
    }
    this.lastRender = now

    // camera
    const c = this.cam
    const ground = Math.max(0, heightAt(c.tx, c.tz, this.hills()) * 0.6)
    const target = new THREE.Vector3(c.tx, ground, c.tz)
    this.camera.position.set(c.tx + Math.sin(c.az) * Math.sin(c.tilt) * c.dist, ground + Math.cos(c.tilt) * c.dist, c.tz + Math.cos(c.az) * Math.sin(c.tilt) * c.dist)
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld()

    this.drawBridges()
    this.renderer.render(this.scene, this.camera)

    if (this.listeners.size) {
      const hills = this.hills()
      const out: Projected[] = this.worlds.map((w) => {
        const s = this.shown.get(w.id)!
        const y = heightAt(w.hill.x, w.hill.z, hills) + 0.2
        const p = this.project(w.hill.x, y, w.hill.z)
        const dist = this.camera.position.distanceTo(new THREE.Vector3(w.hill.x, y, w.hill.z))
        return { id: w.id, x: p.x, y: p.y, depth: Math.min(1, dist / 260), visible: p.z < 1 && s.height > 0.15 && p.x > -60 && p.x < this.size.w + 60 && p.y > -40 && p.y < this.size.h + 40 }
      })
      this.listeners.forEach((f) => f(out))
    }

    if (moving && !document.hidden) this.wake()
  }

  /** dashed bridges from each island back to the mainland it settles to */
  private drawBridges() {
    const hills = this.hills()
    const islands = this.worlds.filter((w) => this.shown.get(w.id)!.moat > 0.3)
    if (islands.length === this.bridges.children.length && !this.bridgesDirty()) return
    this.bridges.clear()
    for (const w of islands) {
      const s = this.shown.get(w.id)!
      // cross the moat toward the centre of the continent
      const len = Math.hypot(w.hill.x, w.hill.z) || 1
      const dir = { x: -w.hill.x / len, z: -w.hill.z / len }
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 24; i++) {
        const t = 0.75 + (i / 24) * 0.95
        const x = w.hill.x + dir.x * s.radius * t
        const z = w.hill.z + dir.z * s.radius * t
        pts.push(new THREE.Vector3(x, Math.max(0.15, heightAt(x, z, hills) + 0.15), z))
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: INK, dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.7 * Math.min(1, (s.moat - 0.3) / 0.5) }))
      line.computeLineDistances()
      this.bridges.add(line)
    }
  }

  private bridgesDirty() {
    return this.worlds.some((w) => {
      const s = this.shown.get(w.id)!
      return s.moat > 0.3 && Math.abs(s.moat - w.hill.moat) > 0.01
    })
  }

  /** where a point on screen meets the ground, roughly (a plane just above sea level) */
  private ground(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5), hit) ? hit : null
  }

  /** ground units moved for a screen drag, in the camera's frame */
  private panBy(dx: number, dy: number) {
    // ground units per pixel at the target: the view's height there, over the screen's height
    const s = (this.cam.dist * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.size.h
    const ca = Math.cos(this.goal.az), sa = Math.sin(this.goal.az)
    const mx = -(dx * ca - dy * sa * 1.4) * s
    const mz = -(-dx * sa - dy * ca * 1.4) * s
    this.goal.tx = Math.max(-60, Math.min(60, this.goal.tx + mx))
    this.goal.tz = Math.max(-60, Math.min(60, this.goal.tz + mz))
    return { mx, mz }
  }

  private bindInput() {
    const el = this.canvas
    const pointers = new Map<number, { x: number; y: number }>()
    let two: { d: number; a: number; cx: number; cy: number } | null = null
    let travel = 0
    let downAt = { x: 0, y: 0, t: 0 }
    let lastTap = { x: 0, y: 0, t: 0 }
    // recent movement, for the flick that follows a drag
    let trail: { t: number; tx: number; tz: number; az: number }[] = []
    const free = () => this.view.kind === 'atlas' || this.view.kind === 'coast'

    const pairState = () => {
      const [a, b] = [...pointers.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
    }

    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)
      this.dragging = true
      this.interacted = performance.now()
      this.vel = { tx: 0, tz: 0, az: 0 }
      trail = []
      if (pointers.size === 1) {
        travel = 0
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
      }
      two = pointers.size === 2 ? pairState() : null
      this.wake()
    })

    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) {
        if (e.pointerType === 'mouse') this.setHover(this.pick(e.clientX, e.clientY))
        return
      }
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      travel = Math.max(travel, Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y))
      const now = performance.now()

      if (pointers.size === 2) {
        // two fingers: pinch to zoom, twist to turn, move together to pan
        const s2 = pairState()
        if (two) {
          this.zoom(two.d / Math.max(1, s2.d))
          let da = s2.a - two.a
          if (da > Math.PI) da -= Math.PI * 2
          if (da < -Math.PI) da += Math.PI * 2
          this.goal.az -= da
          if (free()) this.panBy(s2.cx - two.cx, s2.cy - two.cy)
          else this.goal.tilt = Math.min(1.2, Math.max(0.5, this.goal.tilt - (s2.cy - two.cy) * 0.004))
        }
        two = s2
        travel = 99
      } else if (pointers.size === 1) {
        if (!free() || e.shiftKey || e.buttons === 2) {
          // turn around the centre (around the world, when one is open)
          this.goal.az -= dx * 0.006
          this.goal.tilt = Math.min(1.2, Math.max(0.5, this.goal.tilt - dy * 0.003))
        } else this.panBy(dx, dy)
      }
      trail.push({ t: now, tx: this.goal.tx, tz: this.goal.tz, az: this.goal.az })
      trail = trail.filter((p) => now - p.t < 120)
      this.interacted = now
      this.wake()
    })

    const up = (e: PointerEvent) => {
      const was = pointers.has(e.pointerId)
      pointers.delete(e.pointerId)
      if (pointers.size === 2) two = pairState()
      else two = null
      if (pointers.size) return
      this.dragging = false
      if (!was || e.type !== 'pointerup') return
      const now = performance.now()

      if (travel < 8 && now - downAt.t < 450) {
        // a tap: open the world under it; a second tap on open ground zooms in there
        const id = this.pick(e.clientX, e.clientY)
        if (id) this.selectListeners.forEach((f) => f(id))
        else if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30 && free()) {
          const g = this.ground(e.clientX, e.clientY)
          if (g) {
            this.goal.tx = Math.max(-60, Math.min(60, this.goal.tx + (g.x - this.goal.tx) * 0.5))
            this.goal.tz = Math.max(-60, Math.min(60, this.goal.tz + (g.z - this.goal.tz) * 0.5))
          }
          this.zoomBy(0.6)
        }
        lastTap = { x: e.clientX, y: e.clientY, t: now }
        return
      }

      // a flick: carry on in the same direction
      if (!this.reduced && trail.length > 1) {
        const a = trail[0], b = trail[trail.length - 1]
        const span = Math.max(16, b.t - a.t) / 1000
        this.vel = { tx: ((b.tx - a.tx) / span) * 0.9, tz: ((b.tz - a.tz) / span) * 0.9, az: ((b.az - a.az) / span) * 0.9 }
        if (now - b.t > 80) this.vel = { tx: 0, tz: 0, az: 0 }
      }
      this.wake()
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && this.setHover(null))
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener(
      'wheel',
      (e) => {
        if (this.view.kind === 'backdrop') return
        e.preventDefault()
        // trackpad pinch arrives as ctrl+wheel with small deltas
        this.zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)))
        this.interacted = performance.now()
      },
      { passive: false },
    )
  }

  private zoom(f: number) {
    // the atlas zooms freely; a world's view zooms within reach of its framing
    const atlas = this.view.kind === 'atlas' || this.view.kind === 'coast'
    const lo = atlas ? 30 : this.base * 0.45
    const hi = atlas ? 240 : this.base * 1.8
    this.goal.dist = Math.min(hi, Math.max(lo, this.goal.dist * f))
    this.wake()
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
