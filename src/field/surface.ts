import * as THREE from 'three'
import type { Shared } from './kit'
import { rand, seedOf } from './settlement'
import { NOISE, type Style } from './cosmos'
import type { Capital, CapitalCtx, Place, Plan, Pt, SurfaceInput } from './capital'
import { classic } from './capitals/classic'
import { lattice } from './capitals/lattice'

/*
  Standing on a planet: what you find when you land on a world that earned its own chain.

  The planet is drawn again at a scale you can walk on: the same painted surface you saw
  from orbit, with hills, coasts and (on Emberfall) lava, curving away to a horizon close
  enough to see the planet is small. Its capital stands at the top. Each planet builds
  its own (see capital.ts and capitals/); this file is what they share: the ground and
  how a capital reshapes it, the sky, the sun and the mainland hanging over the horizon,
  the figures walking between the places where work is done, and the pulse of a proof.
*/

const glsl = String.raw

/** the planet's radius at this scale */
export const SURFACE_R = 160
export type { SurfaceInput, Place } from './capital'

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

const planFn = glsl`
vec2 planUv(vec2 xz) { return xz / (2. * uPlanHalf) + .5; }
float planIn(vec2 pu) {
  vec2 e = abs(pu - .5);
  return uPlanOn * (1. - smoothstep(.43, .5, max(e.x, e.y)));
}`
const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
BLANK.needsUpdate = true

/** the planet's ground: its painted surface, displaced into hills and seas, flattened for the city */
function groundMaterial(style: Style, map: THREE.Texture, mask: THREE.Texture, u: { uNight: { value: number }; uT: { value: number } }, station: boolean, seed: number, mesa: number, plan: Plan | undefined) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uMap: { value: map },
      uMask: { value: mask },
      uR: { value: SURFACE_R },
      uCity: { value: mesa },
      uPlanShape: { value: plan?.shape ?? BLANK },
      uPlanPaint: { value: plan?.paint ?? BLANK },
      uPlanHalf: { value: plan?.half ?? 1 },
      uPlanOn: { value: plan ? 1 : 0 },
      uWater: { value: C(style.shallow).lerp(C(style.deep), 0.55) },
      uStation: { value: station ? 1 : 0 },
      uSeed: { value: seed },
      uLava: { value: style.lava ? 1 : 0 },
      uLow: { value: C(style.low) },
      uMid: { value: C(style.mid) },
      uField: { value: C(style.field ?? style.low) },
      uNight: u.uNight,
      uT: u.uT,
    })
    const pars = `uniform sampler2D uMap, uMask, uPlanShape, uPlanPaint;\nuniform vec3 uLow, uMid, uField, uWater;\nuniform float uR, uCity, uStation, uSeed, uLava, uNight, uT, uPlanHalf, uPlanOn;\nvarying vec3 vPP;\nvarying vec2 vXZ;\nvarying float vFlat;\n${NOISE}\n${equirect}\n${planFn}`
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
      // the capital's own plan: ground pressed to a height (a canal, a crater, a terrace)
      vec2 pu = planUv(p.xz);
      vec4 sh = texture2D(uPlanShape, pu);
      p.y = mix(p.y, sh.r, sh.b * planIn(pu) * step(0., d.y));
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
      vXZ = transformed.xz;
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
        // the plan's tint, then its standing water
        vec2 pu = planUv(vXZ);
        float pin = planIn(pu);
        vec4 pc = texture2D(uPlanPaint, pu);
        col = mix(col, pc.rgb, pc.a * pin);
        float pw = smoothstep(.35, .65, texture2D(uPlanShape, pu).g) * pin;
        vec3 water = uWater * (.9 + .1 * snoise(vec3(vXZ * .7, uT * .12))) * (1. - uNight * .35);
        col = mix(col, water, pw);
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        glsl`#include <emissivemap_fragment>
        vec4 mk = texture2D(uMask, eq(vPP));
        float fine = (1. - smoothstep(0., .035, abs(fbm3(vPP * 70. + uSeed)))) * (1. - vFlat) * (1. - smoothstep(.3, .7, m.a));
        float dry = 1. - smoothstep(.35, .65, texture2D(uPlanShape, planUv(vXZ)).g) * planIn(planUv(vXZ));
        // standing water keeps a little of the night sky in it
        totalEmissiveRadiance += (1. - dry) * uNight * vec3(.035, .055, .085) * (.8 + .4 * snoise(vec3(vXZ * .5, uT * .1)));
        totalEmissiveRadiance += dry * vec3(1., .38, .1) * uLava * (mk.g * .3 + fine * .8) * (1. - vFlat) * (.2 + uNight * 1.1);`,
      )
  }
  mat.customProgramCacheKey = () => 'surface-ground'
  return mat
}

/**
 * A sphere of the planet: rings evenly and finely spaced across the capital and a little
 * beyond (so streets, quays and banks keep their shape), then widening to the far side.
 */
function groundGeometry(fine: number, far: number, segs: number) {
  const d0 = fine / SURFACE_R, tc = 40 / SURFACE_R
  const th: number[] = []
  for (let t = d0; t < tc; t += d0) th.push(t)
  // each ring a little further than the last, to reach the far pole in `far` rings
  const t0 = th[th.length - 1]
  let lo = 1.0001, hi = 2
  for (let i = 0; i < 60; i++) {
    const g = (lo + hi) / 2
    if ((d0 * (Math.pow(g, far + 1) - g)) / (g - 1) > Math.PI - t0) hi = g
    else lo = g
  }
  for (let i = 1, t = t0, st = d0; i <= far; i++) {
    st *= lo
    t += st
    th.push(i === far ? Math.PI : Math.min(t, Math.PI))
  }
  const pos: number[] = [0, 1, 0]
  const idx: number[] = []
  for (const t of th)
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      pos.push(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a))
    }
  const rings = th.length
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

/** which capital each kind of world builds */
const CAPITALS: Partial<Record<string, (ctx: CapitalCtx) => Capital>> = { defi: lattice }

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
  private capital: Capital
  private walkers: THREE.Points
  private agents: Walker[] = []
  private stops: Pt[] = []
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

    // the capital, built in the planet's own way; then the ground it reshapes
    const ctx: CapitalCtx = { input, r, top: this.top, station: this.station, hi, shared: this.shared, style: look.style, place: (key, kind, x, y, z) => this.places.push({ key, kind, x, y, z }) }
    this.capital = (!this.station && CAPITALS[input.template]?.(ctx)) || classic(ctx)
    this.stops = this.places.map((p) => ({ x: p.x, z: p.z }))
    this.ground = new THREE.Mesh(groundGeometry(hi ? 0.42 : 0.7, hi ? 110 : 80, hi ? 384 : 224), groundMaterial(look.style, look.map, look.mask, this.u, this.station, seed, this.capital.mesa, this.capital.plan))
    this.ground.receiveShadow = true
    this.ground.frustumCulled = false
    this.walkers = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }))
    this.walkers.frustumCulled = false
    this.setupWalkers(r)

    this.scene.add(this.sky, this.stars, this.sunGlow, this.home, this.ground, this.sun, this.sun.target, this.hemi, ...this.capital.objects, this.walkers)
    this.scene.fog = new THREE.Fog(0xffffff, 90, 420)
    this.setNight(night.value)
  }

  private setupWalkers(r: () => number) {
    const n = Math.min(26, 8 + this.stops.length * 2)
    for (let i = 0; i < n; i++) {
      const from = Math.floor(r() * this.stops.length)
      let to = Math.floor(r() * this.stops.length)
      if (to === from) to = (to + 1) % this.stops.length
      this.agents.push(this.walker(from, to, i, r(), 0.1 + r() * 0.1, 0.3 + r() * 0.12, false))
    }
    this.syncWalkers()
  }

  /** a figure setting out from one place to another, on the way the capital gives it */
  private walker(from: number, to: number, i: number, t: number, speed: number, lift: number, cart: boolean): Walker {
    const path = this.capital.route(this.stops[from], this.stops[to], i)
    const at = [0]
    for (let k = 1; k < path.length; k++) at.push(at[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z))
    return { to, i, t, speed, lift, cart, path, at }
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
    const pl = this.capital.pulse
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(pl.sides > 8 ? 0.92 : 0.95, 1, pl.sides, 1, pl.rot),
      new THREE.ShaderMaterial({ vertexShader: ringVS, fragmentShader: ringFS, uniforms: { uK: { value: 1 }, uColor: { value: C('#c4ef3a') } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(pl.x, this.top + 0.12, pl.z)
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
    this.agents.push(this.walker(from, vault, this.agents.length, 0, 0.35, 0.25, true))
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
    this.capital.setNight?.(k)
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
      const total = a.at[a.at.length - 1]
      const len = Math.max(1, total)
      if (!still) a.t += (dt * a.speed * 6) / len
      if (a.t >= 1) {
        if (a.cart) {
          changed = true
          return false
        }
        // on to somewhere else
        const next = (a.to + 1 + Math.floor(Math.random() * (this.stops.length - 1))) % this.stops.length
        Object.assign(a, this.walker(a.to, next, a.i, 0, a.speed, a.lift, false))
      }
      const e = a.t * a.t * (3 - 2 * a.t)
      const d = e * a.at[a.at.length - 1]
      let k = 1
      while (k < a.at.length - 1 && a.at[k] < d) k++
      const p0 = a.path[k - 1], p1 = a.path[k] ?? p0
      const f = (d - a.at[k - 1]) / Math.max(1e-6, a.at[k] - a.at[k - 1])
      arr.setXYZ(i, p0.x + (p1.x - p0.x) * f, this.top + a.lift, p0.z + (p1.z - p0.z) * f)
      return true
    })
    if (changed) this.syncWalkers()
    arr.needsUpdate = true
    ;(this.walkers.material as THREE.PointsMaterial).size = 0.55
    const busy = this.capital.step?.(dt, t, still) ?? false

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
    return this.rings.length > 0 || this.agents.length > 0 || busy
  }

  dispose() {
    for (const rg of this.rings) this.dropRing(rg)
    this.capital.plan?.shape.dispose()
    this.capital.plan?.paint.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | undefined
      if (mat && 'map' in mat && mat !== this.ground.material) (mat as THREE.SpriteMaterial).map?.dispose()
      mat?.dispose()
    })
  }
}

interface Walker {
  to: number
  i: number
  t: number
  speed: number
  lift: number
  cart: boolean
  path: Pt[]
  /** distance along the path at each point */
  at: number[]
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

