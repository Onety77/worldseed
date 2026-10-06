import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { Builder, box, cylinder, dome, house, lantern, signature, type Shared } from './kit'
import { rand, seedOf } from './settlement'
import { NOISE, type Style } from './cosmos'

/*
  Standing on a planet: what you find when you land on a world that earned its own chain.

  The planet is drawn again at a scale you can walk on: the same painted surface you saw
  from orbit, with hills, coasts and (on Emberfall) lava, curving away to a horizon close
  enough to see the planet is small. The capital stands on a mesa at the top, laid out
  round a plaza:

  - the governor's tower in the middle, which sends a ring out across the city with
    every proof it publishes;
  - the world's apps, each a landmark in its own architecture, in a ring round the plaza;
  - the treasury vault, a domed drum with a lit band that shows its runway;
  - the assembly hall, with a banner for each live proposal, filled as far as it has
    support;
  - the market, a stall for every open job;
  - the spaceport at the edge, where the chain is: a pad and a ship.

  Houses, lamps and trees fill the rest; small figures walk between the places where work
  is done. Overhead is a thin sky that fades to stars, the sun, and the mainland the world
  came from. A gas giant has no ground to stand on, so its capital is a station: a deck
  floating above the cloud bands.
*/

const glsl = String.raw

/** the planet's radius at this scale */
export const SURFACE_R = 160
/** the flat ground the city stands on */
const CITY_R = 20

export interface SurfaceInput {
  id: string
  template: Template
  apps: { key: string }[]
  jobs: { key: string }[]
  lit: number
  /** months of chain costs in reserve */
  runway: number
  /** live proposals and how much of the vote is for them */
  proposals: { key: string; support: number }[]
}

type PlaceKind = 'app' | 'market' | 'vault' | 'hall' | 'tower' | 'port'

export interface Place {
  key: string
  kind: PlaceKind
  x: number
  y: number
  z: number
}

const equirect = glsl`
vec2 eq(vec3 p) {
  float u = atan(p.x, p.z) / 6.2831853 + .5;
  return vec2(u, asin(clamp(p.y, -1., 1.)) / 3.14159265 + .5);
}`

// ── the sky: haze at the horizon, thinning to space; the sun ──

const skyVS = glsl`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const skyFS = glsl`
uniform vec3 uUp, uHaze, uZenith, uSpace, uSun, uSunCol;
uniform float uInside, uDip;
varying vec3 vW;
void main() {
  vec3 d = normalize(vW - cameraPosition);
  // measured from the horizon, which on a small planet lies below level
  float e = dot(d, uUp) + uDip;
  float haze = exp(-max(e + .04, 0.) * 7.);
  vec3 c = mix(uZenith, uHaze, haze);
  float s = max(dot(d, uSun), 0.);
  c += uSunCol * (pow(s, 10.) * .22 + pow(s, 90.) * .5);
  c = mix(uSpace, c, uInside);
  gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`
const starVS = glsl`
attribute float aSize;
attribute vec3 aColor;
uniform vec3 uUp;
uniform float uInside, uPx;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx;
  float e = dot(normalize(position), uUp);
  // through the air only the brightest show, and only well above the horizon
  vC = aColor * (1. - uInside * (1. - .3 * smoothstep(.1, .9, e)));
}`
const starFS = glsl`
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, 0., d);
  gl_FragColor = vec4(vC, a * a);
  #include <colorspace_fragment>
}`

// a ring of light from the governor's tower
const ringFS = glsl`
uniform float uK;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor * uK, 1.);
  #include <colorspace_fragment>
}`
const ringVS = glsl`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`

const C = (hex: string) => new THREE.Color(hex)

/** the planet's ground: its painted surface, displaced into hills and seas, flattened for the city */
function groundMaterial(style: Style, map: THREE.Texture, mask: THREE.Texture, u: { uNight: { value: number }; uT: { value: number } }, station: boolean, seed: number) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uMap: { value: map },
      uMask: { value: mask },
      uR: { value: SURFACE_R },
      uCity: { value: CITY_R },
      uStation: { value: station ? 1 : 0 },
      uSeed: { value: seed },
      uLava: { value: style.lava ? 1 : 0 },
      uLow: { value: C(style.low) },
      uMid: { value: C(style.mid) },
      uField: { value: C(style.field ?? style.low) },
      uNight: u.uNight,
      uT: u.uT,
    })
    const pars = `uniform sampler2D uMap, uMask;\nuniform vec3 uLow, uMid, uField;\nuniform float uR, uCity, uStation, uSeed, uLava, uNight, uT;\nvarying vec3 vPP;\nvarying float vFlat;\n${NOISE}\n${equirect}`
    const groundFn = glsl`
    vec3 ground(vec3 d) {
      vec3 pp = vec3(d.x, -d.z, d.y);
      float wet = texture2D(uMap, eq(pp)).a;
      float land = 1. - smoothstep(.3, .7, wet);
      float hills = .2 + 2.2 * smoothstep(-.1, .6, fbm3(pp * 20. + uSeed)) + .25 * fbm3(pp * 70. + uSeed);
      float h = mix(-.45, hills, land) * (1. - uStation);
      vec3 p = d * (uR + h) - vec3(0., uR, 0.);
      // the mesa the city stands on
      float flatK = (1. - smoothstep(uCity, uCity + 11., length(p.xz))) * (1. - uStation) * step(0., d.y);
      p.y = mix(p.y, 0., flatK);
      return p;
    }`
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${pars}\n${groundFn}`).replace(
      '#include <begin_vertex>',
      glsl`
      vec3 d = normalize(position);
      // the planet's own frame: the capital faces out of its equator
      vec3 pp = vec3(d.x, -d.z, d.y);
      vec3 transformed = ground(d);
      // the slope, from two neighbours, for smooth rolling light
      vec3 ta = normalize(cross(d, abs(d.y) < .99 ? vec3(0., 1., 0.) : vec3(1., 0., 0.)));
      vec3 tb = cross(d, ta);
      float e = .0025;
      vec3 pa = ground(normalize(d + ta * e)), pb = ground(normalize(d + tb * e));
      vec3 nrm = normalize(cross(pa - transformed, pb - transformed));
      if (dot(nrm, d) < 0.) nrm = -nrm;
      vNormal = normalize(normalMatrix * nrm);
      vPP = pp;
      vFlat = (1. - smoothstep(uCity, uCity + 11., length(transformed.xz))) * (1. - uStation) * step(0., d.y);`,
    )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${pars}`)
      .replace(
        '#include <color_fragment>',
        glsl`#include <color_fragment>
        vec2 uv = eq(vPP);
        vec4 m = texture2D(uMap, uv);
        vec3 col = m.rgb;
        float wet = smoothstep(.3, .7, m.a) * (1. - uStation);
        // close up the land has patches and grain, so it is never one flat colour
        float dn = fbm3(vPP * 150. + uSeed);
        vec3 ground = col * (.84 + .3 * dn + .05 * snoise(vPP * 800.));
        vec3 sea = col * (.94 + .06 * snoise(vPP * 260. + uT * .04));
        col = mix(ground, sea, wet);
        // the tended ground of the mesa: patches of meadow and earth in the world's own colours
        float pat = smoothstep(-.25, .35, fbm3(vPP * 420. + uSeed * 2.));
        vec3 tended = mix(uField, uLow, pat * .55) * (.92 + .12 * snoise(vPP * 1600.));
        col = mix(col, mix(col, tended, .75), vFlat);
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        glsl`#include <emissivemap_fragment>
        vec4 mk = texture2D(uMask, eq(vPP));
        float fine = (1. - smoothstep(0., .035, abs(fbm3(vPP * 70. + uSeed)))) * (1. - vFlat) * (1. - smoothstep(.3, .7, m.a));
        totalEmissiveRadiance += vec3(1., .38, .1) * uLava * (mk.g * .3 + fine * .8) * (1. - vFlat) * (.2 + uNight * 1.1);`,
      )
  }
  mat.customProgramCacheKey = () => 'surface-ground'
  return mat
}

/** a sphere of the planet, fine round the capital at its top and coarse on the far side */
function groundGeometry(rings: number, segs: number) {
  const pos: number[] = [0, 1, 0]
  const idx: number[] = []
  for (let k = 1; k <= rings; k++) {
    const th = Math.PI * Math.pow(k / rings, 1.9)
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      pos.push(Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a))
    }
  }
  const v = (k: number, i: number) => 1 + (k - 1) * segs + (i % segs)
  for (let i = 0; i < segs; i++) idx.push(0, v(1, i + 1), v(1, i))
  for (let k = 1; k < rings; k++)
    for (let i = 0; i < segs; i++) {
      idx.push(v(k, i), v(k, i + 1), v(k + 1, i + 1))
      idx.push(v(k, i), v(k + 1, i + 1), v(k + 1, i))
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // displaced in the shader: keep it from being culled when the camera is close
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -SURFACE_R, 0), SURFACE_R + 20)
  return g
}

/** what grows on each kind of world (a volcanic one has rocks instead) */
const FLORA: Record<Template, { kind: 'broad' | 'pine' | 'shrub' | 'rock'; colors: string[]; n: number }> = {
  defi: { kind: 'broad', colors: ['#6f9a4a', '#7fa955', '#8db35c'], n: 46 },
  agents: { kind: 'pine', colors: ['#3f6f52', '#4b7d5a', '#365f48'], n: 40 },
  game: { kind: 'rock', colors: ['#3b302b', '#4a3d36', '#2f2724'], n: 34 },
  creator: { kind: 'broad', colors: ['#4f8f3e', '#5f9f47', '#73b04f'], n: 56 },
  prediction: { kind: 'shrub', colors: ['#6c7fb8', '#8090c4', '#5f71a8'], n: 14 },
  frontier: { kind: 'shrub', colors: ['#a08a55', '#8f7c4a', '#b29a62'], n: 24 },
}

export class Surface {
  readonly scene = new THREE.Scene()
  readonly places: Place[] = []
  /** height of the ground the city stands on (a station's deck floats higher) */
  readonly top: number
  readonly station: boolean
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  readonly sunDir = { value: new THREE.Vector3(-0.62, 0.58, 0.52).normalize() }
  private sky: THREE.Mesh
  private skyU: Record<string, THREE.IUniform>
  private stars: THREE.Points
  private sunGlow: THREE.Sprite
  private home: THREE.Mesh
  private ground: THREE.Mesh
  private city: THREE.Group
  private flora: THREE.InstancedMesh | null = null
  private walkers: THREE.Points
  private agents: { from: number; to: number; t: number; speed: number; lift: number; cart: boolean }[] = []
  private stops: { x: number; z: number }[] = []
  private rings: { mesh: THREE.Mesh; t: number }[] = []
  private u = { uNight: { value: 0 }, uT: { value: 0 } }
  private style: Style
  private night = 0
  private shared: Shared

  constructor(input: SurfaceInput, look: { style: Style; map: THREE.Texture; mask: THREE.Texture }, home: (sun: { value: THREE.Vector3 }) => THREE.ShaderMaterial, night: { value: number }, quality: 'high' | 'low') {
    this.style = look.style
    this.station = Boolean(look.style.bands)
    this.top = this.station ? 26 : 0
    this.u.uNight = night
    const hi = quality === 'high'
    const seed = (seedOf(input.id) % 1000) / 37
    this.shared = { uNight: night, uHaze: { value: C(look.style.atmos) }, uFog: { value: new THREE.Vector2(90, 420) } }

    // the planet underfoot
    this.ground = new THREE.Mesh(groundGeometry(hi ? 170 : 120, hi ? 256 : 168), groundMaterial(look.style, look.map, look.mask, this.u, this.station, seed))
    this.ground.receiveShadow = true
    this.ground.frustumCulled = false

    // light: the sun, and the sky's own fill
    this.sun = new THREE.DirectionalLight(0xffffff, 2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.04
    const sc = this.sun.shadow.camera
    sc.left = -28
    sc.right = 28
    sc.top = 28
    sc.bottom = -28
    sc.near = 1
    sc.far = 200
    this.sun.position.copy(this.sunDir.value).multiplyScalar(80).add(new THREE.Vector3(0, this.top, 0))
    this.sun.target.position.set(0, this.top, 0)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1)

    // the sky, the stars, the sun's disc
    this.skyU = { uDip: { value: 0 }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uHaze: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uSpace: { value: C('#03050b') }, uSun: this.sunDir, uSunCol: { value: C('#fff1d6') }, uInside: { value: 1 } }
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false }))
    this.sky.renderOrder = -3
    this.sky.frustumCulled = false
    const r = rand(seedOf(input.id + ':sky'))
    const n = hi ? 2200 : 1200
    const sp = new Float32Array(n * 3), ss = new Float32Array(n), scol = new Float32Array(n * 3)
    const v = new THREE.Vector3(), c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(2300)
      sp.set([v.x, v.y, v.z], i * 3)
      const big = r()
      ss[i] = big > 0.985 ? 3.4 : big > 0.9 ? 2.1 : 1 + r()
      c.set(['#ffffff', '#cfe0ff', '#fff1d8'][i % 3]).multiplyScalar(big > 0.9 ? 1 : 0.5 + r() * 0.4)
      scol.set([c.r, c.g, c.b], i * 3)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    sg.setAttribute('aSize', new THREE.BufferAttribute(ss, 1))
    sg.setAttribute('aColor', new THREE.BufferAttribute(scol, 3))
    this.stars = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: starVS, fragmentShader: starFS, uniforms: { uUp: this.skyU.uUp, uInside: this.skyU.uInside, uPx: { value: 1 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    this.stars.renderOrder = -2
    this.stars.frustumCulled = false
    const cv = document.createElement('canvas')
    cv.width = cv.height = 128
    const gx = cv.getContext('2d')!
    const grad = gx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,250,1)')
    grad.addColorStop(0.08, 'rgba(255,248,230,1)')
    grad.addColorStop(0.2, 'rgba(255,225,170,.35)')
    grad.addColorStop(1, 'rgba(255,200,140,0)')
    gx.fillStyle = grad
    gx.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }))
    this.sunGlow.scale.setScalar(300)
    this.sunGlow.renderOrder = -1

    // the mainland, hanging in the sky over the horizon
    this.home = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), home(this.sunDir))
    this.home.scale.setScalar(95)
    this.home.position.set(0.3, 0.13, -1).normalize().multiplyScalar(1500).add(new THREE.Vector3(0, this.top, 0))
    this.home.rotation.set(0.5, 0, -0.35)
    this.home.frustumCulled = false

    this.city = this.build(input, r)
    this.walkers = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }))
    this.walkers.frustumCulled = false
    this.setupWalkers(r)

    this.scene.add(this.sky, this.stars, this.sunGlow, this.home, this.ground, this.sun, this.sun.target, this.hemi, this.city, this.walkers)
    if (this.flora) this.scene.add(this.flora)
    this.scene.fog = new THREE.Fog(0xffffff, 90, 420)
    this.setNight(night.value)
  }

  // ── the city ──

  private build(input: SurfaceInput, r: () => number) {
    const t = input.template
    const top = this.top
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
    const place = (key: string, kind: PlaceKind, x: number, y: number, z: number) => this.places.push({ key, kind, x, y, z })

    // a station is a deck; anywhere else, the plaza is paved on the mesa
    if (this.station) {
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
    for (let i = 0; i < 900 && houses < (this.station ? 42 : 64); i++) {
      const a = r() * Math.PI * 2, d = 4.6 + Math.sqrt(r()) * (CITY_R - 5.2)
      const x = Math.cos(a) * d, z = Math.sin(a) * d
      const s = 0.42 + r() * 0.26
      if (!clear(x, z, s * 1.25)) continue
      take(x, z, s * 1.25)
      house(t, b, g, { x, z, s, rot: a + Math.PI / 2 + (r() - 0.5) * 0.3 }, r)
      houses++
    }
    const group = b.build(this.shared)
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
    for (let i = 0; i < 1400 && spots.length < (this.station ? 10 : fl.n); i++) {
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
      this.flora = im
    }
    this.stops = this.places.map((p) => ({ x: p.x, z: p.z }))
    return group
  }

  private setupWalkers(r: () => number) {
    const n = Math.min(26, 8 + this.stops.length * 2)
    for (let i = 0; i < n; i++) {
      const from = Math.floor(r() * this.stops.length)
      let to = Math.floor(r() * this.stops.length)
      if (to === from) to = (to + 1) % this.stops.length
      this.agents.push({ from, to, t: r(), speed: 0.1 + r() * 0.1, lift: 0.3 + r() * 0.12, cart: false })
    }
    this.syncWalkers()
  }

  private syncWalkers() {
    const n = Math.max(1, this.agents.length)
    const g = this.walkers.geometry
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3))
    this.paintWalkers()
  }

  private paintWalkers() {
    const col = this.walkers.geometry.getAttribute('color') as THREE.BufferAttribute
    const k = this.night
    const day = [C('#141813'), C('#3f6b00')], night = [C('#e8ece4'), C('#c4ef3a')]
    this.agents.forEach((a, i) => {
      const c = a.cart ? C('#ffd76a') : day[i % 3 === 0 ? 0 : 1].clone().lerp(night[i % 3 === 0 ? 0 : 1], k)
      col.setXYZ(i, c.r, c.g, c.b)
    })
    col.needsUpdate = true
  }

  /** a proof published: a ring of light runs out from the governor's tower */
  pulse() {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 96),
      new THREE.ShaderMaterial({ vertexShader: ringVS, fragmentShader: ringFS, uniforms: { uK: { value: 1 }, uColor: { value: C('#c4ef3a') } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = this.top + 0.12
    this.scene.add(mesh)
    this.rings.push({ mesh, t: 0 })
    if (this.rings.length > 4) this.dropRing(this.rings.shift()!)
  }

  /** a trade: a little cart runs from the market to the vault */
  trade() {
    const market = this.places.findIndex((p) => p.kind === 'market')
    const vault = this.places.findIndex((p) => p.kind === 'vault')
    if (vault < 0) return
    const from = market >= 0 ? market : 0
    if (this.agents.filter((a) => a.cart).length > 6) return
    this.agents.push({ from, to: vault, t: 0, speed: 0.35, lift: 0.25, cart: true })
    this.syncWalkers()
  }

  private dropRing(r: { mesh: THREE.Mesh }) {
    this.scene.remove(r.mesh)
    r.mesh.geometry.dispose()
    ;(r.mesh.material as THREE.Material).dispose()
  }

  setNight(k: number) {
    this.night = k
    const st = this.style
    const atm = C(st.atmos)
    const hazeDay = atm.clone().lerp(C('#ffffff'), 0.38)
    const hazeNight = atm.clone().multiplyScalar(0.16).lerp(C('#0b1426'), 0.5)
    const zenDay = atm.clone().multiplyScalar(0.55).lerp(C('#14233f'), 0.45)
    const zenNight = C('#04070f')
    ;(this.skyU.uHaze.value as THREE.Color).copy(hazeDay).lerp(hazeNight, k)
    ;(this.skyU.uZenith.value as THREE.Color).copy(zenDay).lerp(zenNight, k)
    ;(this.skyU.uSunCol.value as THREE.Color).set('#fff1d6').multiplyScalar(1 - k * 0.85)
    this.sun.color.set('#fff1d6').lerp(C('#a9c4f2'), k)
    this.sun.intensity = 2.3 - k * 1.75
    this.hemi.color.copy(hazeDay).lerp(C('#3a5487'), k)
    this.hemi.groundColor.set(st.low).multiplyScalar(0.5 - k * 0.3)
    this.hemi.intensity = 1.05 - k * 0.5
    ;(this.scene.fog as THREE.Fog).color.copy(this.skyU.uHaze.value as THREE.Color)
    this.shared.uHaze.value.copy(this.skyU.uHaze.value as THREE.Color)
    this.sunGlow.material.opacity = 1 - k * 0.8
    this.paintWalkers()
  }

  /** each frame: the sky round the camera, its air thinning with height; walkers, rings and carts */
  step(dt: number, t: number, camera: THREE.Camera, px: number, still: boolean) {
    const cp = (camera as THREE.PerspectiveCamera).position
    const center = new THREE.Vector3(0, -SURFACE_R, 0)
    const alt = cp.distanceTo(center) - SURFACE_R - this.top
    const up = cp.clone().sub(center).normalize()
    this.skyU.uUp.value.copy(up)
    const inside = 1 - smoothstep(30, 170, alt)
    this.skyU.uInside.value = inside
    const dip = Math.sin(Math.acos(Math.min(1, SURFACE_R / (SURFACE_R + Math.max(0, alt + this.top)))))
    this.skyU.uDip.value = dip
    // the mainland rides a little above the horizon, wherever that is from here
    const el = -dip * 0.62 + 0.035
    this.home.position.set(-0.1, el * 1.05, -1).normalize().multiplyScalar(1500).add(cp)
    const fog = this.scene.fog as THREE.Fog
    fog.near = 70 + (1 - inside) * 4000
    fog.far = 380 + (1 - inside) * 8000
    this.sky.position.copy(cp)
    this.stars.position.copy(cp)
    this.sunGlow.position.copy(cp).addScaledVector(this.sunDir.value, 2000)
    ;(this.stars.material as THREE.ShaderMaterial).uniforms.uPx.value = px
    this.u.uT.value = t
    if (!still) this.home.rotation.y += dt * 0.01

    // walkers and carts
    const arr = this.walkers.geometry.getAttribute('position') as THREE.BufferAttribute
    let changed = false
    this.agents = this.agents.filter((a, i) => {
      const f = this.stops[a.from], to = this.stops[a.to]
      if (!f || !to) return false
      const len = Math.max(1, Math.hypot(to.x - f.x, to.z - f.z))
      if (!still) a.t += (dt * a.speed * 6) / len
      if (a.t >= 1) {
        if (a.cart) {
          changed = true
          return false
        }
        a.t = 0
        a.from = a.to
        a.to = (a.to + 1 + Math.floor(Math.random() * (this.stops.length - 1))) % this.stops.length
      }
      const e = a.t * a.t * (3 - 2 * a.t)
      const bend = Math.sin(e * Math.PI) * 1.2 * (i % 2 ? 1 : -1)
      const nx = -(to.z - f.z), nz = to.x - f.x
      const nl = Math.hypot(nx, nz) || 1
      arr.setXYZ(i, f.x + (to.x - f.x) * e + (nx / nl) * bend, this.top + a.lift, f.z + (to.z - f.z) * e + (nz / nl) * bend)
      return true
    })
    if (changed) this.syncWalkers()
    arr.needsUpdate = true
    ;(this.walkers.material as THREE.PointsMaterial).size = 0.55

    // rings run out from the tower and fade
    for (const rg of [...this.rings]) {
      rg.t += dt / 2.6
      const k = rg.t
      rg.mesh.scale.setScalar(1 + k * 24)
      ;(rg.mesh.material as THREE.ShaderMaterial).uniforms.uK.value = (1 - k) * (1 - k) * (0.6 + this.night * 0.6)
      if (k >= 1) {
        this.dropRing(rg)
        this.rings.splice(this.rings.indexOf(rg), 1)
      }
    }
    return this.rings.length > 0 || this.agents.length > 0
  }

  dispose() {
    for (const rg of this.rings) this.dropRing(rg)
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | undefined
      if (mat && 'map' in mat && mat !== this.ground.material) (mat as THREE.SpriteMaterial).map?.dispose()
      mat?.dispose()
    })
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function segDist(x: number, z: number, s: { ax: number; az: number; bx: number; bz: number }) {
  const dx = s.bx - s.ax, dz = s.bz - s.az
  const l = dx * dx + dz * dz || 1
  const t = Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l))
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t))
}
