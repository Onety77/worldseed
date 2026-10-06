import * as THREE from 'three'
import { MAX_HILLS, heightAt, type Hill } from './height'
import { Heightfield, makeGroundUniforms, makeOcean, makeTerrain, type GroundUniforms } from './ground'
import { Sky } from './sky'
import { CLEARING, WIND } from './nature'
import { GroundPaint } from './paint'
import { buildIsland, revealBridge, type IslandParts } from './islands'
import { Atmos } from './atmos'
import { buildSettlement, disposeGroup, type SettlementInput } from './settlement'
import { setLook, type Shared } from './kit'
import { Life } from './life'
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
  /** what stands on its hill */
  town: Omit<SettlementInput, 'id'>
  /** 0 fine … 1 a missed milestone: its terraces dim and its contours redden */
  trouble: number
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
  private terrain: THREE.Mesh
  private ocean: THREE.Mesh
  private gu: GroundUniforms
  private hf: Heightfield
  private hfDirty = true
  private sky: Sky
  private paint = new GroundPaint()
  private atmos: Atmos
  private towns = new THREE.Group()
  private lostListeners = new Set<() => void>()
  private settlements = new Map<string, { key: string; group: THREE.Group; rise: number }>()
  /** sovereign worlds' bridges, lighthouses and piers */
  private islands = new Map<string, { key: string; parts: IslandParts }>()
  /** a world being replayed: its hill follows the scrubber instead of its live shape */
  private replay: { id: string; height: number; radius: number; tiers: number; moat: number; build: number } | null = null
  /** uniforms every building shares: the night, the haze, the fog */
  private shared!: Shared
  private night = { k: 0, goal: 0 }
  private life!: Life
  private routesShown = 1
  private worlds: FieldWorld[] = []
  /** what each hill currently looks like, easing toward its target */
  private shown = new Map<string, Hill & { green: number; muted: number; trouble: number }>()
  /** worlds earning their chain right now: id → when it began */
  private ceremonies = new Map<string, number>()
  private lastMoat = new Map<string, number>()
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
  /** a timed flight from one view to the next: lift, travel, settle. Any touch cancels it */
  private flight: { from: Cam; t0: number; dur: number; lift: number } | null = null
  private lastRender = 0
  /**
   * The quality governor: if frames run long it lowers the render resolution a step at a
   * time and, as a last resort, turns shadows off; with plenty of headroom it steps back up.
   */
  private perf = { ema: 16, slow: 0, fast: 0, ratio: 1, max: 1, shadows: true }
  private district: { input: DistrictInput; d: District; shown: number } | null = null

  constructor(container: HTMLElement, quality: 'high' | 'low') {
    this.quality = quality
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: quality === 'high' ? 'high-performance' : 'default' })
    // phones have dense screens; 1.5x is sharp enough for ink lines and halves the pixel work of 3x
    this.perf.max = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.5)
    this.perf.ratio = this.perf.max
    this.renderer.setPixelRatio(this.perf.ratio)
    this.canvas = this.renderer.domElement
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none'
    container.appendChild(this.canvas)
    // if the GPU drops the context (a driver reset, too many tabs), stop and say so
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      cancelAnimationFrame(this.raf)
      this.raf = 0
      this.paused = true
      this.lostListeners.forEach((f) => f())
    })

    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.sky = new Sky(this.scene, quality === 'high' ? 2048 : 1024)
    this.shared = { uNight: { value: 0 }, uHaze: { value: this.sky.fogColor }, uFog: { value: new THREE.Vector2(170, 560) } }
    const base = makeGroundUniforms()
    this.hf = new Heightfield(this.renderer, quality === 'high' ? 1024 : 512, base)
    this.gu = { ...base, uHF: { value: this.hf.texture }, uTexel: { value: 1 / this.hf.size }, uPaint: { value: this.paint.texture } }
    this.gu.uNight = this.shared.uNight
    this.gu.uSunDir.value.copy(this.sky.dir)
    this.terrain = makeTerrain(this.gu, quality === 'high' ? 360 : 200)
    // hills cast their own shadows across the land (on capable screens)
    this.terrain.castShadow = quality === 'high'
    this.ocean = makeOcean(this.gu)
    this.life = new Life(this.shared)
    this.life.budget = quality === 'high' ? 1500 : 650
    this.atmos = new Atmos(quality)
    this.scene.add(this.ocean, this.terrain, this.towns, this.life.group, this.atmos.group)
    this.scene.fog = new THREE.Fog(this.sky.fogColor, 170, 560)
    this.bindInput()
    this.resize()
  }

  // ── what to show ──

  /** day or night on the Field; it crossfades over a couple of seconds */
  setNight(on: boolean, instant = false) {
    this.night.goal = on ? 1 : 0
    if (instant || this.reduced) {
      this.night.k = this.night.goal
      this.applyNight()
    }
    this.wake()
  }

  private applyNight() {
    const k = this.night.k
    this.sky.setNight(k)
    ;(this.scene.fog as THREE.Fog).color.copy(this.sky.fogColor)
    this.shared.uNight.value = k
    this.district?.d.setNight(k)
  }

  /** honour reduced motion: no drift, cuts instead of camera moves */
  setReduced(on: boolean) {
    this.reduced = on
    this.wake()
  }

  setWorlds(list: FieldWorld[]) {
    this.worlds = list.slice(0, MAX_HILLS)
    for (const w of this.worlds) {
      if (!this.shown.has(w.id)) this.shown.set(w.id, { ...w.hill, height: 0, moat: w.hill.moat > 0.5 && !this.reduced ? 0 : w.hill.moat, green: 0, muted: 0, trouble: w.trouble })
      // a world that just earned its chain: begin its ceremony
      const was = this.lastMoat.get(w.id)
      if (was !== undefined && was < 0.5 && w.hill.moat >= 0.5) {
        this.ceremonies.set(w.id, performance.now())
        this.ping(w.id, 'big')
      }
      this.lastMoat.set(w.id, w.hill.moat)
    }
    this.syncSettlements()
    this.atmos.setStorms(this.worlds.map((w) => ({ id: w.id, x: w.hill.x, z: w.hill.z, r: w.hill.radius, k: w.trouble })))
    const real = this.worlds.filter((w) => w.id !== 'draft')
    // a plot being planted is cleared of trees
    const draft = this.worlds.find((w) => w.id === 'draft')
    CLEARING.uClear.value.set(draft?.hill.x ?? 0, draft?.hill.z ?? 0, (draft?.hill.radius ?? 0) + 1.6, draft ? 1 : 0)
    const lw = real.map((w) => ({ id: w.id, hill: w.hill, stage: (w.town.seed ? 'seed' : w.hill.moat > 0.5 ? 'sovereign' : 'realm') as 'seed' | 'realm' | 'sovereign' }))
    this.life.build(lw)
    this.paint.update(lw, this.life.roads(), real.map((w) => w.hill))
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
    if (changed) {
      this.vel = { tx: 0, tz: 0, az: 0 }
      // going somewhere new: fly there on a timed path instead of chasing the goal, so the
      // camera eases out of where it is as well as into where it lands. Long trips across
      // the map lift a little at the middle, the way a survey drone would.
      const c = this.cam
      const across = Math.hypot(this.goal.tx - c.tx, this.goal.tz - c.tz)
      const reach = across + Math.abs(this.goal.dist - c.dist) * 0.5
      if (!this.reduced && !this.dragging && reach > 1) {
        this.flight = {
          from: { ...c },
          t0: performance.now(),
          dur: Math.min(1700, 750 + reach * 9),
          lift: across > 18 ? Math.min(34, across * 0.32) : 0,
        }
      }
    }
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
      const d = new District(input, w.hill, this.worlds.map((x) => x.hill), this.shared)
      d.setNight(this.night.k)
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

  /** move the view across the ground by a screen distance, for arrow keys */
  nudge(dx: number, dy: number) {
    this.interacted = performance.now()
    this.vel = { tx: 0, tz: 0, az: 0 }
    this.panBy(dx, dy)
    this.wake()
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

  /** show a world as it stood at some point in its past; null hands it back to the present */
  setReplay(r: { id: string; height: number; radius: number; tiers: number; moat: number; build: number } | null) {
    this.replay = r
    this.wake()
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

  /** the GPU took the drawing context away */
  onLost(cb: () => void) {
    this.lostListeners.add(cb)
    return () => {
      this.lostListeners.delete(cb)
    }
  }

  /** a world clicked or tapped on the Field */
  onSelect(cb: (id: string) => void) {
    this.selectListeners.add(cb)
    return () => {
      this.selectListeners.delete(cb)
    }
  }

  /** a trade or a job at this world: packets run down its roads */
  pulse(id: string) {
    this.life.pulse(id)
    this.wake()
  }

  /** a ring runs out from a world: a proof (green), a big moment (wide), or bad news (red) */
  ping(id: string, kind: 'proof' | 'big' | 'bad' = 'proof') {
    const w = this.worlds.find((x) => x.id === id)
    if (!w) return
    const inside = this.district && this.view.kind === 'district' && this.view.id === id && kind === 'proof'
    const at = inside ? this.district!.d.pingSpot() : { x: w.hill.x, z: w.hill.z }
    if (!this.reduced) this.atmos.burst(at.x, heightAt(at.x, at.z, this.hills()) + 1.5, at.z, kind)
    const scale = inside ? 0.32 : kind === 'big' ? 2.4 : kind === 'bad' ? -1.4 : 1
    this.pings = [...this.pings.slice(-7), { ...at, at: performance.now(), scale }]
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
    for (const m of [this.terrain, this.ocean]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.hf.dispose()
    this.paint.dispose()
    this.settlements.forEach((st) => disposeGroup(st.group))
    this.islands.forEach((isl) => {
      disposeGroup(isl.parts.bridge)
      disposeGroup(isl.parts.extras)
    })
    this.district?.d.dispose()
    this.life.dispose()
    this.atmos.dispose()
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
      const t = w.town
      const key = [r(w.hill.radius), r(w.hill.height), w.hill.tiers, w.hill.moat, t.template, t.apps, t.houses, t.seed, r(t.lit)].join()
      const prev = this.settlements.get(w.id)
      if (prev?.key === key) continue
      if (prev) {
        this.towns.remove(prev.group)
        disposeGroup(prev.group)
      }
      const group = buildSettlement({ id: w.id, ...t }, w.hill, targets, this.shared)
      // a world that already stood keeps standing; new building rises from the ground
      const rise = prev ? prev.rise : 0
      setLook(group, rise, 0)
      this.towns.add(group)
      this.settlements.set(w.id, { key, group, rise: prev && prev.key.split(',').slice(4).join() === key.split(',').slice(4).join() ? prev.rise : prev ? 0.35 : 0 })
    }
    this.atmos?.setChimneys([...this.settlements.values()].flatMap((st) => (st.group.userData.chimneys as { x: number; y: number; z: number }[]) ?? []))
    // islands: built for every world that has (or is earning) its own chain
    for (const [id, isl] of this.islands) {
      const w = this.worlds.find((x) => x.id === id)
      if (w && w.hill.moat >= 0.5) continue
      this.towns.remove(isl.parts.bridge, isl.parts.extras)
      disposeGroup(isl.parts.bridge)
      disposeGroup(isl.parts.extras)
      this.islands.delete(id)
    }
    for (const w of this.worlds) {
      if (w.hill.moat < 0.5) continue
      const key = [r(w.hill.radius), r(w.hill.height), w.hill.tiers, w.town.template].join()
      const prev = this.islands.get(w.id)
      if (prev?.key === key) continue
      if (prev) {
        this.towns.remove(prev.parts.bridge, prev.parts.extras)
        disposeGroup(prev.parts.bridge)
        disposeGroup(prev.parts.extras)
      }
      const parts = buildIsland(w.id, w.town.template, w.hill, targets, this.shared)
      this.towns.add(parts.bridge, parts.extras)
      revealBridge(parts, 0)
      this.islands.set(w.id, { key, parts })
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

    // when idle, the camera drifts slowly round; the drift fades in rather than starting at speed
    const still = now - this.interacted - 2500
    const idle = !this.dragging && still > 0 && !this.flight
    if (this.drift && !this.reduced && idle) {
      const ramp = Math.min(1, still / 3000)
      this.goal.az += dt * ramp * ramp * (this.view.kind === 'world' ? 0.04 : this.view.kind === 'district' ? 0.022 : 0.016)
    }
    let easing = false
    const f = this.flight
    // a touch, a key or the wheel takes over from a flight wherever it has got to
    if (f && this.interacted > f.t0) this.flight = null
    if (this.flight && f) {
      const p = Math.min(1, (now - f.t0) / f.dur)
      // ease in and out (cubic), matching the interface's travel curve
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      for (const key of ['tx', 'tz', 'dist', 'tilt', 'az'] as const) this.cam[key] = lerp(f.from[key], this.goal[key], e)
      this.cam.dist += f.lift * Math.sin(Math.PI * p)
      easing = p < 1
      if (p >= 1) this.flight = null
    } else {
      // follow fingers closely; settle gently after a gesture or a zoom
      const k = 1 - Math.pow(this.dragging ? 0.000002 : 0.0015, dt)
      for (const key of ['tx', 'tz', 'dist', 'tilt', 'az'] as const) {
        const next = this.reduced ? this.goal[key] : lerp(this.cam[key], this.goal[key], k)
        if (Math.abs(next - this.goal[key]) > 0.002) easing = true
        this.cam[key] = next
      }
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
      const rp = this.replay?.id === w.id ? this.replay : null
      const target = { height: rp ? rp.height : w.hill.height, radius: rp ? rp.radius : w.hill.radius, tiers: rp ? rp.tiers : w.hill.tiers, moat: rp ? rp.moat : w.hill.moat, green, muted: w.muted ? 1 : 0, trouble: rp ? 0 : w.trouble }
      const ceremony = this.ceremonies.has(w.id)
      for (const key of Object.keys(target) as (keyof typeof target)[]) {
        // growth is unhurried; the moat opens slower still, slowest of all during a ceremony.
        // a replay follows the scrubber closely
        const speed = rp ? 1 - Math.pow(0.004, dt) : key === 'moat' ? 1 - Math.pow(ceremony ? 0.74 : 0.5, dt) : key === 'trouble' ? 1 - Math.pow(0.6, dt) : key === 'height' ? 1 - Math.pow(0.25 + (i % 5) * 0.05, dt) : g
        const next = this.reduced ? target[key] : lerp(s[key], target[key], speed)
        // settle exactly on the target, so what waits on "fully grown" gets there
        if (Math.abs(next - target[key]) > 0.002) {
          moving = true
          if (s[key] !== next && key !== 'green' && key !== 'muted' && key !== 'trouble') this.hfDirty = true
          s[key] = next
        } else {
          if (s[key] !== target[key] && key !== 'green' && key !== 'muted' && key !== 'trouble') this.hfDirty = true
          s[key] = target[key]
        }
      }
    })

    // day and night crossfade
    if (this.night.k !== this.night.goal) {
      const n = this.reduced ? this.night.goal : lerp(this.night.k, this.night.goal, 1 - Math.pow(0.08, dt))
      this.night.k = Math.abs(n - this.night.goal) < 0.003 ? this.night.goal : n
      this.applyNight()
      moving = true
    }

    // uniforms
    const u = this.gu
    if (u.uCount.value !== this.worlds.length) this.hfDirty = true
    u.uCount.value = this.worlds.length
    this.worlds.forEach((w, i) => {
      const s = this.shown.get(w.id)!
      u.uHill.value[i].set(w.hill.x, w.hill.z, s.radius, s.height)
      u.uMeta.value[i].set(s.tiers, s.moat, s.green, s.muted)
      u.uGlow.value[i] = w.town.seed ? 0.15 : 0.3 + w.town.lit * 0.7
      u.uTrouble.value[i] = s.trouble
      const c = this.ceremonies.get(w.id)
      if (c !== undefined && now - c > 12_000) this.ceremonies.delete(w.id)
      else if (c !== undefined && !this.reduced && Math.random() < dt * 1.4) this.atmos.burst(w.hill.x + (Math.random() - 0.5) * w.hill.radius, s.height, w.hill.z + (Math.random() - 0.5) * w.hill.radius, 'big')
    })
    // settlements appear once their hill has grown into place
    for (const w of this.worlds) {
      const st = this.settlements.get(w.id)
      const s = this.shown.get(w.id)!
      if (!st) continue
      const grown = Math.min(1, Math.max(0, (s.height / Math.max(w.hill.height, 0.01) - 0.9) / 0.1))
      const replaced = this.district?.input.id === w.id ? this.district.shown : 0
      // in a replay, buildings stand as far as the world had built by then
      if (this.replay?.id === w.id) {
        const e = this.replay.build
        // the town shrinks with the hill, so it sits on the slopes it had then
        const rx = s.radius / Math.max(w.hill.radius, 0.01)
        const ry = s.height / Math.max(w.hill.height, 0.01)
        st.group.scale.set(rx, ry, rx)
        st.group.position.set(w.hill.x * (1 - rx), 0, w.hill.z * (1 - rx))
        setLook(st.group, e, (1 - s.muted * 0.75) * (1 - replaced) * Math.min(1, e * 4))
        continue
      }
      if (st.group.scale.y !== 1) {
        st.group.scale.set(1, 1, 1)
        st.group.position.set(0, 0, 0)
      }
      // buildings rise out of the ground once the hill is up, then stay
      if (grown >= 0.97 && st.rise < 1) {
        st.rise = this.reduced ? 1 : Math.min(1, st.rise + dt * 0.7)
        moving = true
      }
      const e = 1 - Math.pow(1 - st.rise, 3)
      setLook(st.group, e, (1 - s.muted * 0.75) * (1 - replaced) * Math.min(1, st.rise * 3))
    }
    // islands: the bridge is laid as the water opens; the lighthouse and pier come with it
    for (const [id, isl] of this.islands) {
      const s = this.shown.get(id)
      if (!s) continue
      const k = Math.min(1, Math.max(0, (s.moat - 0.3) / 0.6))
      revealBridge(isl.parts, k)
      setLook(isl.parts.extras, 1, Math.min(1, k * 1.5) * (1 - s.muted * 0.75))
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

    // woods, boats and roads
    const roadsWanted = this.view.kind === 'atlas' || this.view.kind === 'coast' ? 1 : this.view.kind === 'world' ? 0.3 : 0
    this.routesShown = this.reduced ? roadsWanted : lerp(this.routesShown, roadsWanted, 1 - Math.pow(0.05, dt))
    this.life.setLook(1, this.routesShown)
    if (!this.reduced && this.life.step(dt)) moving = true
    // with reduced motion the air holds still, but is still drawn where it is
    if (this.atmos.step(this.reduced ? 0 : dt, this.reduced ? 0 : (now - this.t0) / 1000, this.camera.position, this.night.k) && !this.reduced) moving = true
    if (this.atmos.busy()) moving = true

    this.pings = this.pings.filter((p) => now - p.at < (Math.abs(p.scale) > 1.2 ? 3600 : 2400))
    for (let i = 0; i < 8; i++) {
      const p = this.pings[i]
      if (p) u.uPing.value[i].set(p.x, p.z, (now - p.at) / 1000, p.scale)
      else u.uPing.value[i].set(0, 0, 0, 0)
    }
    if (this.pings.length) moving = true
    u.uT.value = (now - this.t0) / 1000
    WIND.uT.value = u.uT.value

    if (driftOnly && this.quality === 'low' && !this.pings.length && now - this.lastRender < 30) {
      if (!document.hidden) this.wake()
      return
    }
    // frame time while drawing continuously, for the governor
    if (now - this.lastRender < 250) this.govern(now - this.lastRender)
    this.lastRender = now

    // camera
    const c = this.cam
    const ground = Math.max(0, heightAt(c.tx, c.tz, this.hills()) * 0.6)
    const target = new THREE.Vector3(c.tx, ground, c.tz)
    this.camera.position.set(c.tx + Math.sin(c.az) * Math.sin(c.tilt) * c.dist, ground + Math.cos(c.tilt) * c.dist, c.tz + Math.cos(c.az) * Math.sin(c.tilt) * c.dist)
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld()

    if (this.hfDirty) {
      this.hf.update(this.renderer, this.hills())
      this.hfDirty = false
    }
    this.sky.follow(c.tx, c.tz, c.dist, this.camera.position)
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
    // grab the ground: it follows the finger both ways (far ground tilts away, so vertical moves cover more)
    const mx = (-dx * ca - dy * sa * 1.4) * s
    const mz = (dx * sa - dy * ca * 1.4) * s
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

  private govern(ms: number) {
    const p = this.perf
    p.ema += (ms - p.ema) * 0.05
    if (p.ema > 26) {
      p.slow++
      p.fast = 0
    } else if (p.ema < 13) {
      p.fast++
      p.slow = 0
    } else {
      p.slow = Math.max(0, p.slow - 1)
      p.fast = Math.max(0, p.fast - 1)
    }
    // about two seconds of slow frames: give something up
    if (p.slow > 90) {
      p.slow = 0
      if (p.ratio > 1) p.ratio = Math.max(1, p.ratio - 0.25)
      else if (p.shadows) {
        p.shadows = false
        this.sky.sun.castShadow = false
      } else return
      this.renderer.setPixelRatio(p.ratio)
      this.resize()
    }
    // about eight seconds of easy frames: take some back
    if (p.fast > 480) {
      p.fast = 0
      if (!p.shadows) {
        p.shadows = true
        this.sky.sun.castShadow = true
      } else if (p.ratio < p.max) p.ratio = Math.min(p.max, p.ratio + 0.25)
      else return
      this.renderer.setPixelRatio(p.ratio)
      this.resize()
    }
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
