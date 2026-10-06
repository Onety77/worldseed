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
import { ARC, CAPTURE_HALF, Cosmos, GLOBE_R, type PlanetInput } from './cosmos'
import { buildChunk, buildSite, disposeChunk, disposeSite, lookSite, siteOf, type Chunk, type Site } from './launch'

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
  /** a world with its own chain is also a planet out in space */
  planet?: Omit<PlanetInput, 'id'>
}

export type View =
  | { kind: 'atlas' }
  | { kind: 'world'; id: string }
  | { kind: 'district'; id: string }
  | { kind: 'plot'; x: number; z: number }
  | { kind: 'coast' }
  | { kind: 'backdrop' }
  /** out in space: the home planet and the worlds that orbit it */
  | { kind: 'space' }
  | { kind: 'planet'; id: string }

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

interface SCam {
  tx: number
  ty: number
  tz: number
  dist: number
  tilt: number
  az: number
}

/** a world lifting off the land to become a planet */
interface Lift {
  t0: number
  /** rumble: the ground shakes · rise: the world climbs away · (then it is gone) */
  phase: 'rumble' | 'rise'
  /** the hill as it stood */
  from: Hill
  /** a replay's lift stays on the land; a live one goes on into space */
  replay: boolean
  chunk: Chunk | null
  photo: THREE.WebGLRenderTarget | null
  /** what rides up with it: its town, its lighthouse */
  carried: THREE.Group[]
  fx: number
}
/** seconds the ground shakes before the world tears free, and the climb after */
const RUMBLE = 1.8
const CLIMB = 4.6

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** ease in and out (cubic), the interface's travel curve */
const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
/** how high the land view rises before it hands over to space */
const RISE = 250
/** how long the trip between the land and space takes, seconds */
const TRIP = 2.4

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
  /** worlds lifting off right now */
  private lifts = new Map<string, Lift>()
  /** whether each world was a planet when last seen, to catch the moment one becomes one */
  private hadPlanet = new Map<string, boolean>()
  /** what a launch site has besides its buildings: the beam and the scorched ground */
  private sites = new Map<string, Site>()
  /** where on the land the trip to space starts from, or ends */
  private tripFocus = { x: 0, z: 0 }
  private focusSet = false
  /** a camera following a lifting world: how high to look, and how hard the ground shakes */
  private follow = { y: 0, shake: 0 }
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

  // ── space ──
  private cosmos: Cosmos
  private scamera = new THREE.PerspectiveCamera(32, 1, 0.3, 5000)
  /** 0 on the land … 1 out in space; travels between on a timed path */
  private sp = { x: 0, goal: 0 }
  private scam: SCam = { tx: 0, ty: 0, tz: 0, dist: 120, tilt: 1.04, az: 0.5 }
  private sgoal: SCam = { tx: 0, ty: 0, tz: 0, dist: 120, tilt: 1.04, az: 0.5 }
  private sflight: { from: SCam; t0: number; dur: number } | null = null
  private sbase = 120
  /** the planet the space camera follows; null for the home planet */
  private spaceTarget: string | null = null
  /** the map seen from straight above, by day and by night, to wrap the home planet in */
  private cap: { day: THREE.WebGLRenderTarget; night: THREE.WebGLRenderTarget; cam: THREE.OrthographicCamera } | null = null
  private capDirty = true
  private capAt = 0
  /** for crossfading land into space: space drawn off screen, laid over the land */
  private fade: { rt: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null
  private escapeListeners = new Set<(dir: 'out' | 'in') => void>()
  /** zooming on past the limit: out of the land into space, or back down */
  private over = { k: 0, at: 0 }
  private lastCount = 0

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
    this.cosmos = new Cosmos(this.renderer, quality)
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
      // a world seen earning its chain lifts off the land (one that already had it at load is a site)
      const s = this.shown.get(w.id)
      if (this.hadPlanet.get(w.id) === false && w.planet && s && !this.reduced) this.startLift(w.id, { x: w.hill.x, z: w.hill.z, radius: s.radius, height: s.height, tiers: s.tiers, moat: s.moat }, false)
      this.hadPlanet.set(w.id, Boolean(w.planet))
      if (!s) {
        const t = this.targetHill(w)
        this.shown.set(w.id, { ...t, height: 0, green: 0, muted: 0, trouble: w.trouble })
      }
    }
    this.syncSettlements()
    this.layLand()
    const real = this.worlds.filter((w) => w.id !== 'draft')
    if (this.worlds.length !== this.lastCount) this.capDirty = true
    this.lastCount = this.worlds.length
    this.cosmos.setPlanets(real.filter((w) => w.planet).map((w) => ({ id: w.id, ...w.planet! })))
    // a world still lifting off hasn't reached space yet
    for (const [id, l] of this.lifts) if (!l.replay) this.cosmos.hold(id)
    // out in space, the framing follows the planets (a new one widens it)
    if (this.sp.goal === 1) this.setView(this.view)
    this.wake()
  }

  /** roads, woods and the painted ground, for the land as it now stands */
  private layLand() {
    const real = this.worlds.filter((w) => w.id !== 'draft')
    // a plot being planted is cleared of trees
    const draft = this.worlds.find((w) => w.id === 'draft')
    CLEARING.uClear.value.set(draft?.hill.x ?? 0, draft?.hill.z ?? 0, (draft?.hill.radius ?? 0) + 1.6, draft ? 1 : 0)
    const lw = real.map((w) => {
      const h = this.targetHill(w)
      return { id: w.id, hill: h, stage: (w.town.seed ? 'seed' : h.moat > 0.5 ? 'sovereign' : 'realm') as 'seed' | 'realm' | 'sovereign' }
    })
    this.life.build(lw)
    this.paint.update(lw, this.life.roads(), lw.map((x) => x.hill))
  }

  /** a world with its own chain has left the land: a launch site stands where it was */
  private siteMode(w: FieldWorld) {
    if (!w.planet || this.lifts.get(w.id)?.phase === 'rumble') return false
    const rp = this.replay?.id === w.id ? this.replay : null
    return rp ? rp.moat >= 0.5 : true
  }

  /** the shape the land should have for a world right now */
  private targetHill(w: FieldWorld): Hill {
    const l = this.lifts.get(w.id)
    if (l?.phase === 'rumble') return l.from
    if (this.siteMode(w)) return siteOf(w.hill)
    const rp = this.replay?.id === w.id ? this.replay : null
    return rp ? { x: w.hill.x, z: w.hill.z, radius: rp.radius, height: rp.height, tiers: rp.tiers, moat: rp.moat } : w.hill
  }

  private startLift(id: string, from: Hill, replay: boolean) {
    this.endLift(id)
    this.lifts.set(id, { t0: performance.now(), phase: 'rumble', from, replay, chunk: null, photo: null, carried: [], fx: 0 })
    this.wake()
  }

  private endLift(id: string) {
    const l = this.lifts.get(id)
    if (!l) return
    if (l.chunk) {
      this.towns.remove(l.chunk.pivot)
      disposeChunk(l.chunk)
    }
    l.carried.forEach((g) => disposeGroup(g))
    l.photo?.dispose()
    this.lifts.delete(id)
  }

  /** the moment it tears free: the hill becomes a solid piece that can climb, and the site appears beneath */
  private tearFree(id: string, l: Lift, w: FieldWorld) {
    const half = l.from.radius * 1.35
    l.photo = this.photograph(l.from.x, l.from.z, half, this.quality === 'high' ? 1024 : 512)
    const ch = buildChunk(l.from, this.hills(), l.photo.texture, half)
    // its town and lighthouse ride up with it
    const st = this.settlements.get(id)
    if (st) {
      this.towns.remove(st.group)
      ch.inner.add(st.group)
      l.carried.push(st.group)
      this.settlements.delete(id)
      this.dropSite(id)
    }
    const isl = this.islands.get(id)
    if (isl) {
      this.towns.remove(isl.parts.bridge, isl.parts.extras)
      ch.inner.add(isl.parts.extras)
      l.carried.push(isl.parts.extras)
      disposeGroup(isl.parts.bridge)
      this.islands.delete(id)
    }
    this.towns.add(ch.pivot)
    l.chunk = ch
    l.phase = 'rise'
    // the land beneath is the launch site at once, hidden under the world until it climbs
    const s = this.shown.get(id)!
    Object.assign(s, siteOf(w.hill))
    this.hfDirty = true
    this.syncSettlements()
    const ns = this.settlements.get(id)
    if (ns) ns.rise = -1.3
    this.layLand()
    this.ping(id, 'proof')
    if (!this.reduced)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const x = l.from.x + Math.cos(a) * l.from.radius, z = l.from.z + Math.sin(a) * l.from.radius
        this.atmos.burst(x, heightAt(x, z, this.hills()) + 0.2, z, 'dust')
      }
  }

  /** the land round a point photographed from straight above, without buildings */
  private photograph(cx: number, cz: number, half: number, size: number) {
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: this.quality === 'high' ? 4 : 0, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 700)
    cam.position.set(cx, 320, cz)
    cam.up.set(0, 0, -1)
    cam.lookAt(cx, 0, cz)
    cam.updateMatrixWorld()
    this.towns.visible = false
    // no highlight or rings in the picture: only the land itself (the next frame puts them back)
    for (const m of this.gu.uMeta.value) m.z = 0
    for (const pg of this.gu.uPing.value) pg.set(0, 0, 0, 0)
    this.shoot([[this.night.k, rt]], cam, cx, cz)
    this.towns.visible = true
    return rt
  }

  /** render the land from above into targets (at given night levels), with no haze in the way */
  private shoot(passes: (readonly [number, THREE.WebGLRenderTarget])[], cam: THREE.Camera, cx: number, cz: number) {
    if (this.hfDirty) {
      this.hf.update(this.renderer, this.hills())
      this.hfDirty = false
    }
    const fog = this.scene.fog as THREE.Fog
    const keep = { near: fog.near, far: fog.far, uFog: this.shared.uFog.value.clone(), night: this.night.k }
    fog.near = 1e5
    fog.far = 2e5
    this.shared.uFog.value.set(1e5, 2e5)
    this.atmos.group.visible = false
    this.sky.dome.visible = false
    this.sky.follow(cx, cz, 400, (cam as THREE.OrthographicCamera).position)
    for (const [k, rt] of passes) {
      if (this.night.k !== k) {
        this.night.k = k
        this.applyNight()
      }
      this.renderer.setRenderTarget(rt)
      this.renderer.clear()
      this.renderer.render(this.scene, cam)
    }
    this.renderer.setRenderTarget(null)
    if (this.night.k !== keep.night) {
      this.night.k = keep.night
      this.applyNight()
    }
    fog.near = keep.near
    fog.far = keep.far
    this.shared.uFog.value.copy(keep.uFog)
    this.atmos.group.visible = true
    this.sky.dome.visible = true
  }

  private dropSite(id: string) {
    const s = this.sites.get(id)
    if (!s) return
    this.towns.remove(s.beam, s.scorch)
    disposeSite(s)
    this.sites.delete(id)
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
    this.scamera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h)
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
    // a world with its own chain is seen as its planet (unless it is being replayed)
    const planet = v.kind === 'planet' ? v.id : v.kind === 'world' && this.isPlanet(v.id) ? v.id : null
    if (v.kind === 'space' || planet) {
      this.toSpace(planet, changed)
      this.wake()
      return
    }
    const fromSpace = this.sp.goal === 1
    this.sp.goal = 0
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
    if (fromSpace) {
      // coming down from space: the descent itself is the move, so the land view starts
      // where it will end, facing the way space was facing
      this.goal.az = this.scam.az
      this.cam = { ...this.goal }
      this.tripFocus = { x: this.goal.tx, z: this.goal.tz }
      this.flight = null
      this.vel = { tx: 0, tz: 0, az: 0 }
      if (this.reduced) this.sp.x = 0
      this.wake()
      return
    }
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

  private isPlanet(id: string) {
    return Boolean(this.worlds.find((w) => w.id === id)?.planet) && this.replay?.id !== id && !this.lifts.has(id) && this.cosmos.planet(id) !== null
  }

  /** look at the home planet (null) or follow one of the planets round its orbit */
  private toSpace(id: string | null, changed: boolean) {
    const enter = this.sp.goal === 0
    this.sp.goal = 1
    this.spaceTarget = id
    const fr = this.spaceFrame(id)
    this.sbase = fr.dist
    if (enter) {
      // leaving the land: space starts facing the way the land was, above where it was looking
      if (!this.focusSet) this.tripFocus = { x: this.cam.tx, z: this.cam.tz }
      this.focusSet = false
      this.sgoal = { ...fr, az: this.cam.az }
      this.scam = { ...this.sgoal }
      this.sflight = null
      this.vel = { tx: 0, tz: 0, az: 0 }
      if (this.reduced) this.sp.x = 1
      return
    }
    this.sgoal = { ...this.sgoal, ...fr }
    if (changed && !this.reduced && !this.dragging && this.sp.x >= 1) this.sflight = { from: { ...this.scam }, t0: performance.now(), dur: 1500 }
    else if (this.reduced) this.scam = { ...this.sgoal }
  }

  /** where the space camera stands to frame the home planet and its orbits, or one planet */
  private spaceFrame(id: string | null): Omit<SCam, 'az'> {
    const { w, h } = this.size
    const i = this.inset
    const ow = Math.max(240, w - i.left - i.right)
    const oh = Math.max(200, h - i.top - i.bottom)
    const tan = Math.tan((16 * Math.PI) / 180)
    const p = id ? this.cosmos.planet(id) : null
    if (p) {
      const dist = (p.reach * 1.25) / ((tan * Math.min(ow, oh)) / h)
      return { tx: p.pos.x, ty: p.pos.y, tz: p.pos.z, dist, tilt: 1.12 }
    }
    const m = this.cosmos.reach()
    // on a narrow screen the outer orbits may run off the sides; the planet stays large
    const hw = m * (ow < 560 ? 0.6 : 0.86)
    const hh = Math.max(GLOBE_R * 1.6, m * 0.6)
    return { tx: 0, ty: 0, tz: 0, dist: Math.max(hh / ((tan * oh) / h), hw / ((tan * ow) / h)), tilt: 1.04 }
  }

  /** zooming past the end of the land (out) or of space (in) */
  onEscape(cb: (dir: 'out' | 'in') => void) {
    this.escapeListeners.add(cb)
    return () => {
      this.escapeListeners.delete(cb)
    }
  }

  private overshoot(k: number, dir: 'out' | 'in') {
    const now = performance.now()
    if (now - this.over.at > 700) this.over.k = 0
    this.over.k += k
    this.over.at = now
    if (this.over.k > 0.3) {
      this.over.k = 0
      this.escapeListeners.forEach((f) => f(dir))
    }
  }

  /** whether the camera is out in space (or on its way there) */
  inSpace() {
    return this.sp.goal === 1
  }

  /** photograph the map from straight above, by day and by night, for the home planet */
  private captureField() {
    const size = this.quality === 'high' ? 2048 : 1024
    if (!this.cap) {
      const make = () => new THREE.WebGLRenderTarget(size, size, { samples: this.quality === 'high' ? 4 : 0, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
      const H = CAPTURE_HALF
      const cam = new THREE.OrthographicCamera(-H, H, H, -H, 1, 700)
      cam.position.set(0, 320, 0)
      cam.up.set(0, 0, -1)
      cam.lookAt(0, 0, 0)
      cam.updateMatrixWorld()
      this.cap = { day: make(), night: make(), cam }
    }
    this.shoot([[0, this.cap.day], [1, this.cap.night]], this.cap.cam, 0, 0)
    this.cosmos.setCapture(this.cap.day.texture, this.cap.night.texture)
    this.capDirty = false
    this.capAt = performance.now()
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
    if (this.sp.goal === 1) {
      // in space the arrow keys turn round the planet instead
      this.sgoal.az -= dx * 0.006
      this.sgoal.tilt = Math.min(1.45, Math.max(0.2, this.sgoal.tilt - dy * 0.003))
    } else this.panBy(dx, dy)
    this.wake()
  }

  /** turn the Field by an angle (radians) */
  turn(a: number) {
    this.interacted = performance.now()
    this.active().az += a
    this.wake()
  }

  /** back to how the current view frames things, facing the usual way */
  recenter() {
    this.vel = { tx: 0, tz: 0, az: 0 }
    const g = this.active()
    g.az = Math.round((g.az - 0.5) / (Math.PI * 2)) * Math.PI * 2 + 0.5
    if (this.sp.goal === 1) this.sgoal.tilt = this.spaceFrame(this.spaceTarget).tilt
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
    return this.sp.goal === 1 ? this.scam.az : this.cam.az
  }

  /** the camera goal being steered: the land's or space's */
  private active(): { az: number; tilt: number; dist: number } {
    return this.sp.goal === 1 ? this.sgoal : this.goal
  }

  /** a point on screen for any spot in the Field */
  projectPoint(x: number, y: number, z: number) {
    return this.project(x, y, z)
  }

  /** show a world as it stood at some point in its past; null hands it back to the present */
  setReplay(r: { id: string; height: number; radius: number; tiers: number; moat: number; build: number } | null) {
    const was = this.replay
    const w = this.worlds.find((x) => x.id === (r?.id ?? was?.id))
    const siteBefore = w ? this.siteMode(w) : false
    this.replay = r
    if (w?.planet) {
      const l = this.lifts.get(w.id)
      // the replay reaches the day it earned its chain: it lifts off again, on the land
      if (r && !this.reduced && (was?.id === r.id ? was.moat : 0) < 0.5 && r.moat >= 0.5 && !l) {
        const sh = this.shown.get(w.id)!
        this.startLift(w.id, { x: w.hill.x, z: w.hill.z, radius: sh.radius, height: sh.height, tiers: sh.tiers, moat: sh.moat }, true)
      }
      // scrubbed back before it, or the replay closed: no lift
      if (l?.replay && (!r || r.moat < 0.5)) this.endLift(w.id)
      if (this.siteMode(w) !== siteBefore) {
        this.syncSettlements()
        this.layLand()
      }
    }
    // a planet being replayed goes back to the land it grew on, and returns after
    if (was?.id !== r?.id) this.setView(this.view)
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
    // out in space: a planet, or 'home' for the home planet; nothing while travelling
    if (this.sp.goal === 1 || this.sp.x > 0) return this.sp.goal === 1 && this.sp.x >= 1 ? this.cosmos.pick(px, py, (v) => this.projectWith(this.scamera, v), this.scamera) : null
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
    this.scamera.aspect = this.camera.aspect
    this.applyOffset()
    this.camera.updateProjectionMatrix()
    this.scamera.updateProjectionMatrix()
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
    for (const id of [...this.lifts.keys()]) this.endLift(id)
    for (const id of [...this.sites.keys()]) this.dropSite(id)
    this.atmos.dispose()
    this.cosmos.dispose()
    this.cap?.day.dispose()
    this.cap?.night.dispose()
    this.fade?.rt.dispose()
    this.fade?.mat.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  // ── internals ──

  private syncSettlements() {
    const targets = this.worlds.map((w) => this.targetHill(w))
    const live = new Set(this.worlds.map((w) => w.id))
    for (const [id, st] of this.settlements) {
      if (live.has(id)) continue
      this.towns.remove(st.group)
      disposeGroup(st.group)
      this.dropSite(id)
      this.settlements.delete(id)
    }
    const r = (n: number) => n.toFixed(1)
    for (const w of this.worlds) {
      const t = w.town
      const site = this.siteMode(w)
      const key = site ? `site,${r(w.hill.radius)},${t.template}` : [r(w.hill.radius), r(w.hill.height), w.hill.tiers, w.hill.moat, t.template, t.apps, t.houses, t.seed, r(t.lit)].join()
      const prev = this.settlements.get(w.id)
      if (prev?.key === key) continue
      if (prev) {
        this.towns.remove(prev.group)
        disposeGroup(prev.group)
      }
      this.dropSite(w.id)
      this.capDirty = true
      let group: THREE.Group
      if (site) {
        // where a world lifted off: its launch site
        const ls = buildSite(w.id, t.template, siteOf(w.hill), targets, this.shared)
        this.sites.set(w.id, ls)
        this.towns.add(ls.beam, ls.scorch)
        group = ls.group
      } else group = buildSettlement({ id: w.id, ...t }, w.hill, targets, this.shared)
      // a world that already stood keeps standing; new building rises from the ground
      const rise = prev ? prev.rise : 0
      setLook(group, rise, 0)
      this.towns.add(group)
      this.settlements.set(w.id, { key, group, rise: prev && !site && prev.key.split(',').slice(4).join() === key.split(',').slice(4).join() ? prev.rise : prev ? 0.35 : 0 })
    }
    this.atmos?.setChimneys([...this.settlements.values()].flatMap((st) => (st.group.userData.chimneys as { x: number; y: number; z: number }[]) ?? []))
    // islands: for a world ringed by water (one earning its chain in a replay), and every launch site
    const wantIsland = (w: FieldWorld) => this.siteMode(w) || (w.hill.moat >= 0.5 && !w.planet) || (Boolean(w.planet) && this.replay?.id === w.id)
    for (const [id, isl] of this.islands) {
      const w = this.worlds.find((x) => x.id === id)
      if (w && wantIsland(w)) continue
      this.towns.remove(isl.parts.bridge, isl.parts.extras)
      disposeGroup(isl.parts.bridge)
      disposeGroup(isl.parts.extras)
      this.islands.delete(id)
    }
    for (const w of this.worlds) {
      if (!wantIsland(w)) continue
      const site = this.siteMode(w)
      const hill = site ? siteOf(w.hill) : w.hill
      const key = [site ? 'site' : '', r(hill.radius), r(hill.height), hill.tiers, w.town.template].join()
      const prev = this.islands.get(w.id)
      if (prev?.key === key) continue
      if (prev) {
        this.towns.remove(prev.parts.bridge, prev.parts.extras)
        disposeGroup(prev.parts.bridge)
        disposeGroup(prev.parts.extras)
      }
      this.capDirty = true
      const parts = buildIsland(w.id, w.town.template, hill, targets, this.shared, { lighthouse: !site })
      this.towns.add(parts.bridge, parts.extras)
      revealBridge(parts, 0)
      this.islands.set(w.id, { key, parts })
    }
  }

  private hills(): Hill[] {
    return this.worlds.map((w) => this.shown.get(w.id)!)
  }

  private project(x: number, y: number, z: number) {
    return this.projectWith(this.camera, new THREE.Vector3(x, y, z))
  }

  private projectWith(cam: THREE.Camera, p: THREE.Vector3) {
    const v = p.clone().project(cam)
    return { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h, z: v.z }
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000)
    this.last = now
    let moving = false

    // a flick keeps going for a moment, then settles
    const v = this.vel
    const space = this.sp.goal === 1
    if (!this.dragging && (Math.abs(v.tx) + Math.abs(v.tz) > 0.05 || Math.abs(v.az) > 0.002)) {
      if (!space) {
        this.goal.tx = Math.max(-60, Math.min(60, this.goal.tx + v.tx * dt))
        this.goal.tz = Math.max(-60, Math.min(60, this.goal.tz + v.tz * dt))
      }
      this.active().az += v.az * dt
      const decay = Math.pow(0.02, dt)
      v.tx *= decay
      v.tz *= decay
      v.az *= decay
      this.interacted = now
      moving = true
    }

    // when idle, the camera drifts slowly round; the drift fades in rather than starting at speed
    const still = now - this.interacted - 2500
    const idle = !this.dragging && still > 0 && !this.flight && !this.sflight
    if (this.drift && !this.reduced && idle) {
      const ramp = Math.min(1, still / 3000)
      this.active().az += dt * ramp * ramp * (space ? (this.spaceTarget ? 0.035 : 0.018) : this.view.kind === 'world' ? 0.04 : this.view.kind === 'district' ? 0.022 : 0.016)
    }

    // the trip between the land and space runs on its own clock
    const sp = this.sp
    if (sp.x !== sp.goal) {
      // photograph the map on the way up (always before the home planet first shows)
      if (sp.goal === 1 && (!this.cap || (sp.x === 0 && this.capDirty))) this.captureField()
      sp.x = this.reduced ? sp.goal : sp.goal > sp.x ? Math.min(1, sp.x + dt / TRIP) : Math.max(0, sp.x - dt / TRIP)
      moving = true
    } else if (space && this.capDirty && performance.now() - this.capAt > 20_000) this.captureField()
    // a followed planet keeps moving round its orbit
    if (space && this.spaceTarget) {
      const p = this.cosmos.planet(this.spaceTarget)
      if (p) {
        this.sgoal.tx = p.pos.x
        this.sgoal.ty = p.pos.y
        this.sgoal.tz = p.pos.z
      }
    }
    const sf = this.sflight
    if (sf && this.interacted > sf.t0) this.sflight = null
    if (this.sflight && sf) {
      const p = Math.min(1, (now - sf.t0) / sf.dur)
      const e = inOut(p)
      for (const key of ['tx', 'ty', 'tz', 'dist', 'tilt', 'az'] as const) this.scam[key] = lerp(sf.from[key], this.sgoal[key], e)
      // a hop between planets pulls back a little at the middle
      this.scam.dist += Math.sin(Math.PI * p) * Math.min(30, Math.hypot(sf.from.tx - this.sgoal.tx, sf.from.tz - this.sgoal.tz) * 0.35)
      moving = true
      if (p >= 1) this.sflight = null
    } else if (space || sp.x > 0) {
      const k = 1 - Math.pow(this.dragging ? 0.000002 : 0.0015, dt)
      for (const key of ['tx', 'ty', 'tz', 'dist', 'tilt', 'az'] as const) {
        const next = this.reduced ? this.sgoal[key] : lerp(this.scam[key], this.sgoal[key], k)
        if (Math.abs(next - this.sgoal[key]) > 0.002) moving = true
        this.scam[key] = next
      }
    }
    // planets turn and orbit: space is never quite still
    if (space && !this.reduced) moving = true
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

    // worlds lifting off: the ground shakes, then the world tears free and climbs away
    this.follow = { y: 0, shake: 0 }
    for (const [id, l] of this.lifts) {
      const w = this.worlds.find((x) => x.id === id)
      if (!w) {
        this.endLift(id)
        continue
      }
      moving = true
      const t = (now - l.t0) / 1000
      const watched = (this.view.kind === 'world' || this.view.kind === 'district') && this.view.id === id && this.sp.goal === 0
      if (l.phase === 'rumble') {
        // dust and embers spitting from the rim, more as it builds
        if (t > l.fx) {
          l.fx = t + 0.1
          const a = Math.random() * Math.PI * 2, rr = l.from.radius * (0.85 + Math.random() * 0.3)
          const x = l.from.x + Math.cos(a) * rr, z = l.from.z + Math.sin(a) * rr
          this.atmos.burst(x, heightAt(x, z, this.hills()) + 0.15, z, Math.random() < 0.55 ? 'dust' : 'bad')
        }
        if (watched) this.follow.shake = 0.04 + 0.14 * (t / RUMBLE)
        if (t >= RUMBLE) this.tearFree(id, l, w)
      } else if (l.chunk) {
        const u = clamp01((t - RUMBLE) / CLIMB)
        // a heave, then an ever faster climb, swaying a little as it goes
        const y = smooth(0, 0.12, u) * 0.6 + 40 * Math.pow(u, 2.3)
        l.chunk.pivot.position.y = y
        l.chunk.pivot.rotation.z = Math.sin(t * 1.6) * 0.035 * u
        l.chunk.pivot.rotation.x = Math.cos(t * 1.25) * 0.03 * u
        const fade = 1 - smooth(0.8, 1, u)
        ;(l.chunk.top.material as THREE.MeshBasicMaterial).opacity = fade
        ;(l.chunk.under.material as THREE.MeshLambertMaterial).opacity = fade
        for (const gr of l.carried) setLook(gr, 1, fade)
        // rubble falling from beneath
        if (t > l.fx && u < 0.8) {
          l.fx = t + 0.16
          this.atmos.burst(l.from.x + (Math.random() - 0.5) * l.from.radius, y - l.chunk.depth * 0.6, l.from.z + (Math.random() - 0.5) * l.from.radius, 'dust')
        }
        if (watched) {
          this.follow.y = Math.min(y * 0.5, 14)
          this.follow.shake = 0.18 * (1 - smooth(0, 0.25, u))
        }
        if (u >= 1) {
          // gone from the land: it arrives in space as a planet
          const done = !l.replay
          this.endLift(id)
          this.capDirty = true
          if (done) {
            this.cosmos.arrive(id, w.hill.x, w.hill.z)
            if (watched) {
              this.tripFocus = { x: w.hill.x, z: w.hill.z }
              this.focusSet = true
              this.setView(this.view)
            }
          }
        }
      }
    }

    // hills ease toward their targets: growth, terraces, the moat, focus and filters
    const g = 1 - Math.pow(0.12, dt)
    this.worlds.forEach((w, i) => {
      const s = this.shown.get(w.id)!
      const green = w.id === this.focus ? 1 : w.id === this.hover ? 0.55 : 0
      const rp = this.replay?.id === w.id ? this.replay : null
      const th = this.targetHill(w)
      const target = { height: th.height, radius: th.radius, tiers: th.tiers, moat: th.moat, green, muted: w.muted ? 1 : 0, trouble: rp || this.siteMode(w) ? 0 : w.trouble }
      for (const key of Object.keys(target) as (keyof typeof target)[]) {
        // growth is unhurried; the moat opens slower still. A replay follows the scrubber closely
        const speed = rp ? 1 - Math.pow(0.004, dt) : key === 'moat' ? 1 - Math.pow(0.5, dt) : key === 'trouble' ? 1 - Math.pow(0.6, dt) : key === 'height' ? 1 - Math.pow(0.25 + (i % 5) * 0.05, dt) : g
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
    })
    // settlements appear once their hill has grown into place
    for (const w of this.worlds) {
      const st = this.settlements.get(w.id)
      const s = this.shown.get(w.id)!
      if (!st) continue
      const site = this.siteMode(w)
      const grown = Math.min(1, Math.max(0, (s.height / Math.max(this.targetHill(w).height, 0.01) - 0.9) / 0.1))
      const replaced = this.district?.input.id === w.id ? this.district.shown : 0
      // in a replay, buildings stand as far as the world had built by then
      if (this.replay?.id === w.id && !site) {
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
      const ls = this.sites.get(w.id)
      if (ls) lookSite(ls, clamp01(st.rise) * (1 - s.muted * 0.75), this.night.k)
    }
    // islands: the bridge is laid as the water opens; the lighthouse and pier come with it
    for (const [id, isl] of this.islands) {
      const s = this.shown.get(id)
      if (!s) continue
      // a launch site's bridge is laid again once the world has climbed clear
      const st = this.settlements.get(id)
      const site = isl.key.startsWith('site')
      const k = site ? clamp01(((st?.rise ?? 1) + 0.6) / 0.9) : Math.min(1, Math.max(0, (s.moat - 0.3) / 0.6))
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
    // the land's own life only needs moving while the land can be seen
    const landSeen = sp.x < 0.52
    if (landSeen && !this.reduced && this.life.step(dt)) moving = true
    // with reduced motion the air holds still, but is still drawn where it is
    if (landSeen && this.atmos.step(this.reduced ? 0 : dt, this.reduced ? 0 : (now - this.t0) / 1000, this.night.k) && !this.reduced) moving = true
    if (landSeen && this.atmos.busy()) moving = true

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

    // the trip to space: the land view rises to straight overhead, hands over to the home
    // planet (which carries the same map, seen from the same height), then space opens out
    const x = sp.x
    const rise = inOut(clamp01(x / 0.42))
    const over = smooth(0.36, 0.52, x)
    const open = inOut(clamp01((x - 0.45) / 0.55))
    const c = this.cam
    const top: Cam = { tx: this.tripFocus.x, tz: this.tripFocus.z, dist: RISE, tilt: 0.1, az: c.az }
    const lc: Cam = rise > 0 ? { tx: lerp(c.tx, top.tx, rise), tz: lerp(c.tz, top.tz, rise), dist: lerp(c.dist, top.dist, rise), tilt: lerp(c.tilt, top.tilt, rise), az: c.az } : c

    if (over < 1) {
      // watching a world lift off: look up after it, step back, and feel the ground shake
      const fy = this.follow.y
      const ld = lc.dist + fy * 1.3
      const ground = Math.max(0, heightAt(lc.tx, lc.tz, this.hills()) * 0.6) * (1 - rise) + fy
      const target = new THREE.Vector3(lc.tx, ground, lc.tz)
      this.camera.position.set(lc.tx + Math.sin(lc.az) * Math.sin(lc.tilt) * ld, ground + Math.cos(lc.tilt) * ld, lc.tz + Math.cos(lc.az) * Math.sin(lc.tilt) * ld)
      const sh = this.follow.shake * (this.reduced ? 0 : 1) * ld * 0.004
      if (sh > 0) {
        target.x += (Math.random() - 0.5) * sh
        target.y += (Math.random() - 0.5) * sh
        target.z += (Math.random() - 0.5) * sh
      }
      this.camera.lookAt(target)
      this.camera.updateMatrixWorld()
      if (this.hfDirty) {
        this.hf.update(this.renderer, this.hills())
        this.hfDirty = false
      }
      this.sky.follow(lc.tx, lc.tz, lc.dist, this.camera.position)
      this.renderer.render(this.scene, this.camera)
    }
    if (over > 0) {
      // the space camera starts exactly where the land view topped out, carried onto the
      // home planet: above the same spot of its map, at the same scale, facing the same way
      const f = this.tripFocus
      const fl = Math.hypot(f.x, f.z)
      const arc = fl / ARC
      const n = new THREE.Vector3(fl > 1e-4 ? (Math.sin(arc) * f.x) / fl : 0, Math.cos(arc), fl > 1e-4 ? (Math.sin(arc) * f.z) / fl : 0)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
      const ta = n.clone().multiplyScalar(GLOBE_R)
      const pa = new THREE.Vector3(Math.sin(top.az) * Math.sin(top.tilt), Math.cos(top.tilt), Math.cos(top.az) * Math.sin(top.tilt))
        .multiplyScalar((RISE * GLOBE_R) / ARC)
        .applyQuaternion(q)
        .add(ta)
      const sc = this.scam
      const tb = new THREE.Vector3(sc.tx, sc.ty, sc.tz)
      const pb = new THREE.Vector3(sc.tx + Math.sin(sc.az) * Math.sin(sc.tilt) * sc.dist, sc.ty + Math.cos(sc.tilt) * sc.dist, sc.tz + Math.cos(sc.az) * Math.sin(sc.tilt) * sc.dist)
      this.scamera.position.lerpVectors(pa, pb, open)
      this.scamera.up.lerpVectors(n, new THREE.Vector3(0, 1, 0), open).normalize()
      this.scamera.lookAt(ta.lerp(tb, open))
      this.scamera.updateMatrixWorld()
      this.cosmos.step(dt, (now - this.t0) / 1000, this.scamera, this.renderer.getPixelRatio(), { focus: this.spaceTarget, hover: this.hover, still: this.reduced })
      if (over >= 1) this.renderer.render(this.cosmos.scene, this.scamera)
      else this.crossfade(over)
    }

    if (this.listeners.size && x > 0) this.listeners.forEach((f) => f(this.spaceLabels(x)))
    else if (this.listeners.size) {
      const hills = this.hills()
      const out: Projected[] = this.worlds.map((w) => {
        const s = this.shown.get(w.id)!
        const y = heightAt(w.hill.x, w.hill.z, hills) + 0.2
        const p = this.project(w.hill.x, y, w.hill.z)
        const dist = this.camera.position.distanceTo(new THREE.Vector3(w.hill.x, y, w.hill.z))
        return { id: w.id, x: p.x, y: p.y, depth: Math.min(1, dist / 260), visible: p.z < 1 && s.height > 0.15 && p.x > -60 && p.x < this.size.w + 60 && p.y > -40 && p.y < this.size.h + 40 }
      })
      out.push({ id: 'home', x: 0, y: 0, depth: 1, visible: false })
      this.listeners.forEach((f) => f(out))
    }

    if (moving && !document.hidden) this.wake()
  }

  /** lay space over the land at some strength, for the moment one hands over to the other */
  private crossfade(k: number) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    if (!this.fade) {
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType })
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: rt.texture }, uK: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
        fragmentShader: 'uniform sampler2D uTex; uniform float uK; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, uK);\n#include <colorspace_fragment>\n}',
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
      const scene = new THREE.Scene()
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
      quad.frustumCulled = false
      scene.add(quad)
      this.fade = { rt, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat }
    }
    const f = this.fade
    if (f.rt.width !== size.x || f.rt.height !== size.y) f.rt.setSize(size.x, size.y)
    this.renderer.setRenderTarget(f.rt)
    this.renderer.render(this.cosmos.scene, this.scamera)
    this.renderer.setRenderTarget(null)
    f.mat.uniforms.uK.value = k
    const auto = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.render(f.scene, f.cam)
    this.renderer.autoClear = auto
  }

  /** name tags in space: the planets and the home planet; none while travelling */
  private spaceLabels(x: number): Projected[] {
    const show = this.sp.goal === 1 && x > 0.9
    const cam = this.scamera
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    const eye = cam.position
    // hidden behind the home planet?
    const behind = (p: THREE.Vector3) => {
      const d = p.clone().sub(eye)
      const len = d.length()
      d.divideScalar(len)
      const t = -eye.dot(d)
      return t > 0 && t < len && eye.clone().addScaledVector(d, t).length() < GLOBE_R * 0.98
    }
    const out: Projected[] = this.worlds.map((w) => {
      const p = show ? this.cosmos.planet(w.id) : null
      if (!p) return { id: w.id, x: 0, y: 0, depth: 1, visible: false }
      const at = p.pos.clone().addScaledVector(up, p.r * 1.08)
      const s = this.projectWith(cam, at)
      return { id: w.id, x: s.x, y: s.y, depth: Math.min(1, eye.distanceTo(p.pos) / (this.sbase * 2.2)), visible: s.z < 1 && !behind(p.pos) && s.x > -60 && s.x < this.size.w + 60 && s.y > -40 && s.y < this.size.h + 40 }
    })
    const h = this.projectWith(cam, up.clone().multiplyScalar(GLOBE_R * 1.04))
    out.push({ id: 'home', x: h.x, y: h.y, depth: Math.min(1, eye.length() / (this.sbase * 2.2)), visible: show && !this.spaceTarget && h.z < 1 })
    return out
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
    const free = () => this.sp.goal === 0 && (this.view.kind === 'atlas' || this.view.kind === 'coast')
    /** turning round: the land keeps a survey's tilt, space lets you look from almost any side */
    const tiltBy = (d: number) => {
      const g = this.active()
      g.tilt = this.sp.goal === 1 ? Math.min(1.45, Math.max(0.2, g.tilt + d)) : Math.min(1.2, Math.max(0.5, g.tilt + d))
    }

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
          this.active().az -= da
          if (free()) this.panBy(s2.cx - two.cx, s2.cy - two.cy)
          else tiltBy(-(s2.cy - two.cy) * 0.004)
        }
        two = s2
        travel = 99
      } else if (pointers.size === 1) {
        if (!free() || e.shiftKey || e.buttons === 2) {
          // turn around the centre (around the world, when one is open)
          this.active().az -= dx * 0.006
          tiltBy(-dy * 0.003)
        } else this.panBy(dx, dy)
      }
      trail.push({ t: now, tx: this.goal.tx, tz: this.goal.tz, az: this.active().az })
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
        // the home planet: back down to the land
        if (id === 'home') this.escapeListeners.forEach((f) => f('in'))
        else if (id) this.selectListeners.forEach((f) => f(id))
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
    if (this.sp.goal === 1) {
      const home = !this.spaceTarget
      const lo = this.sbase * (home ? 0.5 : 0.45)
      const hi = this.sbase * (home ? 1.9 : 2.6)
      // zooming on into the home planet takes you back down to the land
      if (home && f < 1 && this.sgoal.dist <= lo * 1.001) this.overshoot(-Math.log(f), 'in')
      this.sgoal.dist = Math.min(hi, Math.max(lo, this.sgoal.dist * f))
      this.wake()
      return
    }
    // the atlas zooms freely; a world's view zooms within reach of its framing
    const atlas = this.view.kind === 'atlas' || this.view.kind === 'coast'
    const lo = atlas ? 30 : this.base * 0.45
    const hi = atlas ? 240 : this.base * 1.8
    // zooming on out past the whole map lifts you into space
    if (atlas && f > 1 && this.goal.dist >= hi * 0.999) this.overshoot(Math.log(f), 'out')
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
