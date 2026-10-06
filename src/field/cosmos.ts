import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { rand, seedOf } from './settlement'

/*
  Space around the Field.

  Pull far enough back from the land and it turns out to be a planet: the home world, its
  northern side wrapped in the live map itself (every town, wood and road, captured from
  above by day and by night, so the towns light up its dark side). Around it orbit the
  worlds that earned their own chain, each now a planet of its own, drawn from what it has
  built:

  - size follows the people it keeps,
  - rings mark a treasury past $2M,
  - moons follow its revenue,
  - city lights on its night side follow its holders,
  - its look follows what kind of world it is (a volcanic game world, an ocean of agents,
    a warm trading world, a banded giant of forecasters…).

  Everything is lit by one sun, with real day and night sides; there are no clouds.
*/

const glsl = String.raw

/** the home planet's radius */
export const GLOBE_R = 10
/** field units per radian of arc on the home planet: the map wraps onto its northern side */
export const ARC = 64
/** half the width of the square of land captured from above, in field units */
export const CAPTURE_HALF = 76

// 3D simplex noise (Ian McEwan, Ashima Arts; MIT)
export const NOISE = glsl`
vec3 mod289(vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 mod289(vec4 x) { return x - floor(x * (1. / 289.)) * 289.; }
vec4 permute(vec4 x) { return mod289(((x * 34.) + 1.) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - .85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1. / 6., 1. / 3.);
  const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1. - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7. * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2. + 1.;
  vec4 s1 = floor(b1) * 2. + 1.;
  vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.);
  m = m * m;
  return 42. * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 5; i++) { s += a * snoise(p); p = p * 2.03 + 17.1; a *= .5; }
  return s;
}
float fbm3(vec3 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p = p * 2.07 + 11.3; a *= .5; }
  return s;
}
`

const bodyVS = glsl`
varying vec3 vP;
varying vec3 vN;
varying vec3 vW;
void main() {
  vP = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

// ── a planet's surface ──

// The surface is painted once, when the planet is made, into two maps that wrap round it
// (colour with where the water is; where its cities and lava are). Each frame then only
// lights it: cheap enough for a phone filling its screen with a planet.
const bakeVS = glsl`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}`
const bakeFS = glsl`
uniform vec3 uDeep, uShallow, uLow, uMid, uHigh, uIce;
uniform float uSeed, uSea, uIceCap, uLava, uBands, uLightsK, uCrater, uPass;
varying vec2 vUv;
${NOISE}
void main() {
  float lon = (vUv.x - .5) * 6.2831853;
  float lat0 = (vUv.y - .5) * 3.14159265;
  vec3 p = vec3(cos(lat0) * sin(lon), sin(lat0), cos(lat0) * cos(lon));
  vec3 q = p * 1.1 + uSeed;
  // a slow warp, so coasts and bands meander instead of looking like noise
  vec3 w = vec3(fbm3(q + 3.1), fbm3(q + 7.7), fbm3(q + 11.3));
  // big continents first; the fine octaves only roughen their coasts
  float h = fbm3(q + w * .45) * .8 + fbm(q * 2.6 + w) * .22;
  // the capital stands on its own land, facing out from the planet's equator
  float cap = smoothstep(.86, .975, dot(p, vec3(0., 0., 1.)));
  h += cap * .6;
  vec3 col;
  float land = 1.;
  float wet = 0.;
  if (uBands > .5) {
    // a banded giant: soft belts that wander, and one great storm
    float lat = p.y + w.x * .07 + fbm3(vec3(p.x * 2., p.y * 9., p.z * 2.) + uSeed) * .05;
    float b = sin(lat * 13. + fbm3(vec3(lat * 4., uSeed, 1.)) * 2.5);
    col = mix(uLow, uMid, smoothstep(-.7, .7, b));
    col = mix(col, uHigh, smoothstep(.6, .95, sin(lat * 29. + 1.3)) * .55);
    col *= .94 + .1 * snoise(vec3(p.x * 3., p.y * 40., p.z * 3.) + uSeed);
    vec3 eye = normalize(vec3(.8, -.32, .5));
    float d = length((p - eye) * vec3(1., 2.3, 1.));
    float swirl = smoothstep(.2, .0, d);
    col = mix(col, uHigh * 1.08, swirl * (.6 + .4 * sin(d * 60.)));
    land = 0.;
  } else {
    land = smoothstep(uSea - .012, uSea + .012, h);
    float depth = clamp((uSea - h) * 3.5, 0., 1.);
    vec3 sea = mix(uShallow, uDeep, smoothstep(0., .55, depth));
    float e = clamp((h - uSea) * 2.4, 0., 1.);
    vec3 ground = mix(uLow, uMid, smoothstep(.04, .42, e));
    ground = mix(ground, uHigh, smoothstep(.45, .92, e));
    ground *= .92 + .16 * fbm3(p * 14. + uSeed);
    // craters, on airless moons
    float cr = snoise(p * 6. + uSeed * 2.);
    ground *= 1. - uCrater * smoothstep(.45, .8, cr) * .35;
    ground += uCrater * smoothstep(.75, .82, cr) * .08;
    col = mix(sea, ground, land);
    wet = 1. - land;
    float ice = smoothstep(uIceCap, uIceCap + .025, abs(p.y) + fbm3(q * 3.) * .05);
    col = mix(col, uIce, ice);
    wet *= 1. - ice;
  }
  // towns gather in a few regions; inside them, a fine scatter of lights joined up
  float cities = 0.;
  if (uLightsK > 0.) {
    float region = max(smoothstep(.12, .42, fbm3(p * 2.6 + uSeed * 1.7)), smoothstep(.9, .99, dot(p, vec3(0., 0., 1.))));
    float towns = smoothstep(.35, .85, snoise(p * 22. + uSeed));
    float grain = .55 + .45 * smoothstep(.2, .9, snoise(p * 90. + uSeed * 3.));
    cities = region * towns * grain * uLightsK * max(land, uBands * .35) * (1. - uLava * .75);
  }
  // thin glowing rivers of lava along the ridges of the noise
  float lava = 0.;
  if (uLava > .5) {
    float ridge = abs(fbm(q * 3.2 + w * 1.4));
    lava = ((1. - smoothstep(0., .028, ridge)) * .9 + (1. - smoothstep(0., .1, ridge)) * .18) * land;
  }
  gl_FragColor = uPass < .5 ? vec4(col, wet) : vec4(cities, lava, 0., 1.);
  #include <colorspace_fragment>
}`

const planetFS = glsl`
uniform sampler2D uMap, uMask;
uniform vec3 uSun, uAtmos, uLights;
uniform float uGlow;
varying vec3 vP;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 p = normalize(vP);
  float u = atan(p.x, p.z) / 6.2831853 + .5;
  float u2 = fract(u + .5) - .5;
  // of the two ways round, take the one that doesn't jump here, so no seam shows
  float uu = fwidth(u) <= fwidth(u2) + 1e-5 ? u : u2;
  vec2 uv = vec2(uu, asin(clamp(p.y, -1., 1.)) / 3.14159265 + .5);
  vec4 a = texture2D(uMap, uv);
  vec4 m = texture2D(uMask, uv);
  vec3 col = a.rgb;
  float wet = a.a;

  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float ndl = dot(n, uSun);
  float day = smoothstep(-.1, .28, ndl);
  vec3 lit = col * (.035 + 1.08 * max(ndl, 0.));
  // the sun on open water
  vec3 hv = normalize(uSun + v);
  lit += wet * pow(max(dot(n, hv), 0.), 380.) * vec3(1., .95, .85) * .22 * day;
  // the air at the edge of the disc, bright on the lit side
  float fr = pow(1. - max(dot(n, v), 0.), 2.6);
  lit += uAtmos * fr * smoothstep(-.3, .45, ndl) * .5 * uGlow;
  // cities on the night side; lava glowing, brighter in the dark
  lit += uLights * m.r * smoothstep(.05, -.25, ndl) * 1.25;
  lit += vec3(1., .38, .1) * m.g * (.22 + (1. - day) * 1.2);
  gl_FragColor = vec4(lit, 1.);
  #include <colorspace_fragment>
}`

// ── the air around a planet, lit from the side the sun is on ──

const atmosVS = glsl`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const atmosFS = glsl`
uniform vec3 uColor, uSun, uC;
uniform float uR, uRa, uK;
varying vec3 vW;
void main() {
  vec3 o = cameraPosition;
  vec3 d = normalize(vW - o);
  vec3 closest = o + d * dot(uC - o, d);
  float b = length(closest - uC);
  float t = clamp((b - uR) / (uRa - uR), 0., 1.);
  float g = pow(1. - t, 3.2);
  float s = smoothstep(-.42, .6, dot(normalize(closest - uC), uSun));
  gl_FragColor = vec4(uColor * g * s * uK, 1.);
  #include <colorspace_fragment>
}`

// ── rings, with the planet's shadow across them ──

const ringVS = glsl`
varying vec3 vL;
varying vec3 vW;
void main() {
  vL = position;
  vec4 w = modelMatrix * vec4(position, 1.);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const ringFS = glsl`
uniform vec3 uSun, uC, uA, uB, uNormal;
uniform float uR, uIn, uOut, uSeed, uK;
varying vec3 vL;
varying vec3 vW;
${NOISE}
void main() {
  float r = (length(vL.xy) - uIn) / (uOut - uIn);
  // broad bands, and finer ones only as fine as the screen can show without shimmering
  float n = snoise(vec3(r * 11., uSeed, 0.)) * .5 + .5;
  float fw = max(fwidth(r) * 40., 1.);
  float n2 = (snoise(vec3(r * 38., uSeed + 3., 0.)) * .5 + .5) / fw + .5 * (1. - 1. / fw);
  float a = (.25 + .5 * n + .3 * n2) * smoothstep(0., .06, r) * smoothstep(1., .86, r);
  a *= 1. - .88 * (1. - smoothstep(0., .03, abs(r - .64)));
  vec3 col = mix(uB, uA, n);
  vec3 oc = vW - uC;
  float bb = dot(oc, uSun);
  float c = dot(oc, oc) - uR * uR;
  float shade = (bb < 0. && bb * bb - c > 0.) ? .1 : 1.;
  float l = .3 + .8 * abs(dot(normalize(uNormal), uSun));
  gl_FragColor = vec4(col * l * shade, a * .88 * uK);
  #include <colorspace_fragment>
}`

// ── the home planet: the map on its northern side, open ocean and a few far islands beyond ──

const globeFS = glsl`
uniform sampler2D uDay, uNight;
uniform vec3 uSun, uAtmos, uIsle, uSand;
uniform float uArc, uHalf, uHave;
varying vec3 vP;
varying vec3 vN;
varying vec3 vW;
${NOISE}
vec3 corners(sampler2D t) {
  return (texture2D(t, vec2(.02, .02)).rgb + texture2D(t, vec2(.98, .02)).rgb + texture2D(t, vec2(.02, .98)).rgb + texture2D(t, vec2(.98, .98)).rgb) * .25;
}
void main() {
  vec3 p = normalize(vP);
  float a = acos(clamp(p.y, -1., 1.));
  vec2 dir = length(p.xz) > 1e-5 ? normalize(p.xz) : vec2(0.);
  vec2 plane = dir * a * uArc;
  vec2 uv = vec2((plane.x + uHalf) / (uHalf * 2.), (uHalf - plane.y) / (uHalf * 2.));
  float inside = (1. - smoothstep(uHalf - 14., uHalf - 3., length(plane))) * uHave;

  vec3 seaDay = uHave > .5 ? corners(uDay) : vec3(.05, .2, .32);
  vec3 seaNight = uHave > .5 ? corners(uNight) : vec3(.01, .02, .05);
  // the open ocean beyond the survey: gentle variation, a few far islands
  float v = fbm3(p * 5. + 2.);
  vec3 farDay = seaDay * (.92 + .1 * v);
  vec3 farNight = seaNight * (.9 + .1 * v);
  float hgt = fbm3(p * 2.4 + 9.);
  float isle = smoothstep(.36, .39, hgt) * smoothstep(1.32, 1.6, a);
  float beach = smoothstep(.33, .36, hgt) * smoothstep(1.32, 1.6, a) * (1. - isle);
  farDay = mix(farDay, uSand, beach * .8);
  farDay = mix(farDay, uIsle * (.9 + .2 * v), isle);
  farNight = mix(farNight, uIsle * .04, isle);

  vec3 dayC = mix(farDay, texture2D(uDay, uv).rgb, inside);
  vec3 nightC = mix(farNight, texture2D(uNight, uv).rgb, inside);

  vec3 n = normalize(vN);
  vec3 vw = normalize(cameraPosition - vW);
  float ndl = dot(n, uSun);
  float day = smoothstep(-.14, .26, ndl);
  // the captured map already carries its own sunlight; this only turns it toward night
  vec3 col = mix(nightC * 1.15, dayC * (.62 + .62 * max(ndl, 0.)), day);
  float wet = 1. - max(isle, inside * .6);
  vec3 hv = normalize(uSun + vw);
  col += wet * pow(max(dot(n, hv), 0.), 80.) * .35 * day;
  float fr = pow(1. - max(dot(n, vw), 0.), 2.4);
  col += uAtmos * fr * smoothstep(-.3, .45, ndl) * .9;
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`

// ── stars and the faint band of the galaxy behind them ──

const starVS = glsl`
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uT, uPx;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx;
  vC = aColor * (.78 + .22 * sin(uT * (.9 + aPhase * 1.6) + aPhase * 40.));
}`
const starFS = glsl`
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, 0., d);
  gl_FragColor = vec4(vC, a * a);
  #include <colorspace_fragment>
}`
// worked out per vertex: the band is soft enough that the sphere's corners carry it
const bandVS = glsl`
uniform vec3 uN, uA, uB;
varying vec3 vC;
${NOISE}
void main() {
  vec3 d = normalize(position);
  float lat = dot(d, uN);
  float band = exp(-lat * lat / .03);
  float n = fbm3(d * 3.2) * .5 + .5;
  vC = mix(uA, uB, n) * band * (.55 + .45 * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`
const bandFS = glsl`
varying vec3 vC;
void main() {
  gl_FragColor = vec4(vC, 1.);
  #include <colorspace_fragment>
}`

// ── what each kind of world looks like from space ──

export interface Style {
  deep: string
  shallow: string
  low: string
  mid: string
  high: string
  ice: string
  atmos: string
  lights: string
  /** sea level, about -0.6 (dry) … 0.3 (mostly ocean) */
  sea: number
  /** latitude where ice begins; 2 = none */
  iceCap: number
  lava?: boolean
  bands?: boolean
  /** the tended ground round a capital */
  field?: string
  ring: [string, string]
}

const STYLES: Record<Template, Style> = {
  // a warm trading world: ochre and terracotta continents, teal seas
  defi: { deep: '#123f58', shallow: '#2f8496', low: '#8f7a4c', mid: '#b07a4e', high: '#dcc49a', ice: '#dfe6ea', atmos: '#a6dcec', lights: '#ffc46b', field: '#9aa45e', sea: 0.02, iceCap: 2, ring: ['#ddc7a2', '#8e7056'] },
  // an ocean of agents: mostly sea, cool slate islands, ice at both poles
  agents: { deep: '#0f2b50', shallow: '#2f72a8', low: '#4f735f', mid: '#6f8a72', high: '#9aa596', ice: '#d6e2ea', atmos: '#8ab9ff', lights: '#d4e6ff', field: '#6f8f6c', sea: 0.12, iceCap: 2, ring: ['#c9d3dc', '#7d8ea0'] },
  // volcanic: basalt, ash plains and rivers of fire
  game: { deep: '#141012', shallow: '#221a19', low: '#2e2522', mid: '#4a3d37', high: '#7a6b61', ice: '#cfc6c0', atmos: '#c96a45', lights: '#ff9a4a', field: '#3a302c', sea: -0.1, iceCap: 2, lava: true, ring: ['#b98d6e', '#4f3a31'] },
  // lush: deep green continents, turquoise shallows
  creator: { deep: '#11485a', shallow: '#3aa59a', low: '#437f37', mid: '#6fa349', high: '#d3cc98', ice: '#dce8e4', atmos: '#9df2d6', lights: '#ffd27a', field: '#7aac52', sea: 0.03, iceCap: 2, ring: ['#cfe6d6', '#7da393'] },
  // a banded giant of forecasters
  prediction: { deep: '#2c3566', shallow: '#4b5e97', low: '#55649f', mid: '#cfd0e3', high: '#a184c4', ice: '#eef0f8', atmos: '#aab6ff', lights: '#d9e1ff', sea: 0, iceCap: 2, bands: true, ring: ['#d6d8ee', '#7f86b8'] },
  // dunes and a few dark lakes
  frontier: { deep: '#204f60', shallow: '#468d96', low: '#b8935c', mid: '#d4b47a', high: '#f0e2bd', ice: '#e6e2d8', atmos: '#f4dcae', lights: '#ffcf80', field: '#c4a86e', sea: -0.34, iceCap: 2, ring: ['#e6d5b0', '#a68b62'] },
}
const MOON: Style = { deep: '#000000', shallow: '#000000', low: '#77736d', mid: '#9c978f', high: '#c9c4ba', ice: '#e8e6e1', atmos: '#000000', lights: '#000000', sea: -9, iceCap: 2, ring: ['#000000', '#000000'] }

const C = (hex: string) => new THREE.Color(hex)

interface Surface {
  mat: THREE.ShaderMaterial
  maps: THREE.WebGLRenderTarget[]
}

const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
bakeQuad.frustumCulled = false
const bakeScene = new THREE.Scene().add(bakeQuad)
const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

/** paint a planet's surface once into its maps, and a material that lights it */
function surface(renderer: THREE.WebGLRenderer, style: Style, seed: number, sun: { value: THREE.Vector3 }, size: number, opts: { lights?: number; crater?: number; glow?: number } = {}): Surface {
  const bake = new THREE.ShaderMaterial({
    vertexShader: bakeVS,
    fragmentShader: bakeFS,
    uniforms: {
      uDeep: { value: C(style.deep) },
      uShallow: { value: C(style.shallow) },
      uLow: { value: C(style.low) },
      uMid: { value: C(style.mid) },
      uHigh: { value: C(style.high) },
      uIce: { value: C(style.ice) },
      uSeed: { value: seed },
      uSea: { value: style.sea },
      uIceCap: { value: style.iceCap },
      uLava: { value: style.lava ? 1 : 0 },
      uBands: { value: style.bands ? 1 : 0 },
      uLightsK: { value: opts.lights ?? 0 },
      uCrater: { value: opts.crater ?? 0 },
      uPass: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  })
  const make = (srgb: boolean) => {
    const rt = new THREE.WebGLRenderTarget(size, size / 2, { colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping })
    rt.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    return rt
  }
  const maps = [make(true), make(false)]
  bakeQuad.material = bake
  const keep = renderer.getRenderTarget()
  maps.forEach((rt, i) => {
    bake.uniforms.uPass.value = i
    renderer.setRenderTarget(rt)
    renderer.render(bakeScene, bakeCam)
  })
  renderer.setRenderTarget(keep)
  bake.dispose()
  const mat = new THREE.ShaderMaterial({
    vertexShader: bodyVS,
    fragmentShader: planetFS,
    uniforms: {
      uMap: { value: maps[0].texture },
      uMask: { value: maps[1].texture },
      uSun: sun,
      uAtmos: { value: C(style.atmos) },
      uLights: { value: C(style.lights) },
      uGlow: { value: opts.glow ?? 1 },
    },
  })
  return { mat, maps }
}

function atmosphere(color: string, r: number, ra: number, sun: { value: THREE.Vector3 }) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: atmosVS,
    fragmentShader: atmosFS,
    uniforms: { uColor: { value: C(color) }, uSun: sun, uC: { value: new THREE.Vector3() }, uR: { value: r }, uRa: { value: ra }, uK: { value: 1 } },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(ra, 64, 32), mat)
  mesh.renderOrder = 2
  return mesh
}

export interface PlanetInput {
  id: string
  template: Template
  /** 0 small … 1 large: the people it keeps */
  size: number
  moons: number
  rings: boolean
  /** 0 … 1: how much of its night side is lit */
  lights: number
  launchedAt: number
}

interface Planet {
  key: string
  /** its painted surfaces */
  maps: THREE.WebGLRenderTarget[]
  input: PlanetInput
  r: number
  group: THREE.Group
  tilt: THREE.Group
  body: THREE.Mesh
  atmos: THREE.Mesh
  ring: THREE.Mesh | null
  moons: { mesh: THREE.Mesh; d: number; a: number; speed: number; incl: number }[]
  line: THREE.LineLoop
  orbit: { radius: number; phase: number; speed: number; q: THREE.Quaternion }
  spin: number
  /** 0 … 1 as a new planet takes its place */
  shown: number
  /** still on the land, lifting off: not in space yet */
  held: boolean
  /** flying out from the home planet to its orbit */
  arrival: { from: THREE.Vector3; k: number } | null
}

export class Cosmos {
  readonly scene = new THREE.Scene()
  /** the direction toward the sun */
  readonly sun = { value: new THREE.Vector3(-0.5, 0.55, 0.67).normalize() }
  private globe: THREE.Mesh
  private globeU: Record<string, THREE.IUniform>
  private globeAtmos: THREE.Mesh
  private planets = new Map<string, Planet>()
  private stars: THREE.Points
  private band: THREE.Mesh
  private sunGlow: THREE.Sprite
  private orbitT = 0
  private blank = new THREE.DataTexture(new Uint8Array([20, 60, 90, 255]), 1, 1)
  private hi: boolean
  private renderer: THREE.WebGLRenderer

  constructor(renderer: THREE.WebGLRenderer, quality: 'high' | 'low') {
    this.renderer = renderer
    this.hi = quality === 'high'
    this.scene.background = C('#03050b')
    this.blank.needsUpdate = true

    // the home planet
    this.globeU = {
      uDay: { value: this.blank },
      uNight: { value: this.blank },
      uSun: this.sun,
      uAtmos: { value: C('#8fc8ff') },
      uIsle: { value: C('#7fa456') },
      uSand: { value: C('#d9c99a') },
      uArc: { value: ARC },
      uHalf: { value: CAPTURE_HALF },
      uHave: { value: 0 },
    }
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, this.hi ? 160 : 96, this.hi ? 120 : 72), new THREE.ShaderMaterial({ vertexShader: bodyVS, fragmentShader: globeFS, uniforms: this.globeU }))
    this.globeAtmos = atmosphere('#7fbcff', GLOBE_R, GLOBE_R * 1.075, this.sun)
    ;(this.globeAtmos.material as THREE.ShaderMaterial).uniforms.uK.value = 1.15
    this.scene.add(this.globe, this.globeAtmos)

    // stars, thicker along the band of the galaxy
    const r = rand(4401)
    const n = this.hi ? 3400 : 1900
    const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3), ph = new Float32Array(n)
    const bandN = new THREE.Vector3(0.32, 0.86, -0.4).normalize()
    const u = new THREE.Vector3(1, 0, 0).cross(bandN).normalize(), w = bandN.clone().cross(u)
    const tints = ['#ffffff', '#cfe0ff', '#fff1d8', '#ffe2c2', '#d8e4ff']
    const v = new THREE.Vector3(), c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      if (i % 5 < 2) {
        // in the band: a narrow spread either side of it
        const a = r() * Math.PI * 2
        const lat = (r() + r() + r() - 1.5) * 0.16
        v.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(bandN, lat).normalize()
      } else v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize()
      v.multiplyScalar(1500)
      pos.set([v.x, v.y, v.z], i * 3)
      const big = r()
      size[i] = big > 0.985 ? 3.2 + r() * 1.6 : big > 0.9 ? 2 + r() : 0.9 + r() * 1.1
      c.set(tints[Math.floor(r() * tints.length)]).multiplyScalar(big > 0.9 ? 1 : 0.45 + r() * 0.45)
      col.set([c.r, c.g, c.b], i * 3)
      ph[i] = r()
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    sg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1))
    this.stars = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: starVS, fragmentShader: starFS, uniforms: { uT: { value: 0 }, uPx: { value: 1 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.stars.frustumCulled = false
    this.stars.renderOrder = -2
    this.band = new THREE.Mesh(
      new THREE.SphereGeometry(1700, 96, 48),
      new THREE.ShaderMaterial({ vertexShader: bandVS, fragmentShader: bandFS, uniforms: { uN: { value: bandN }, uA: { value: C('#0d1430') }, uB: { value: C('#2a2552') } }, side: THREE.BackSide, depthWrite: false }),
    )
    this.band.renderOrder = -3
    this.band.frustumCulled = false

    // the sun itself, far off: a small hot core in a wide soft glow
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    const g = cv.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.05, 'rgba(255,250,235,1)')
    grad.addColorStop(0.12, 'rgba(255,224,170,.45)')
    grad.addColorStop(0.35, 'rgba(255,190,120,.10)')
    grad.addColorStop(1, 'rgba(255,170,100,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    this.sunGlow.scale.setScalar(420)
    this.sunGlow.renderOrder = -1
    this.scene.add(this.band, this.stars, this.sunGlow)
  }

  /** the map captured from above, by day and by night, to wrap the home planet in */
  setCapture(day: THREE.Texture, night: THREE.Texture) {
    this.globeU.uDay.value = day
    this.globeU.uNight.value = night
    this.globeU.uHave.value = 1
  }

  setPlanets(list: PlanetInput[]) {
    const sorted = [...list].sort((a, b) => a.launchedAt - b.launchedAt || a.id.localeCompare(b.id))
    const live = new Set(sorted.map((p) => p.id))
    for (const [id, p] of this.planets) {
      if (live.has(id)) continue
      this.drop(p)
      this.planets.delete(id)
    }
    sorted.forEach((input, i) => {
      const key = [input.template, input.size.toFixed(2), input.moons, input.rings, input.lights.toFixed(2)].join()
      const prev = this.planets.get(input.id)
      const radius = 22 + i * 9
      if (prev && prev.key === key) {
        prev.orbit.radius = radius
        prev.line.scale.setScalar(radius)
        if (!prev.arrival) this.place(prev)
        return
      }
      if (prev) this.drop(prev)
      const p = this.build(input, key, radius, i)
      // a planet that was already here keeps its place; a new one grows into it
      if (prev) {
        p.shown = prev.shown
        p.held = prev.held
        p.arrival = prev.arrival
      }
      this.planets.set(input.id, p)
      if (!p.arrival) this.place(p)
    })
  }

  private build(input: PlanetInput, key: string, radius: number, order: number): Planet {
    const seed = seedOf(input.id)
    const r = rand(seed)
    const style = STYLES[input.template]
    const pr = 2.4 + input.size * 1.8
    const group = new THREE.Group()
    const tilt = new THREE.Group()
    tilt.rotation.z = (r() - 0.5) * 0.7
    tilt.rotation.x = (r() - 0.5) * 0.3
    const maps: THREE.WebGLRenderTarget[] = []
    const skin = surface(this.renderer, style, (seed % 1000) / 37, this.sun, this.hi ? 1024 : 512, { lights: input.lights })
    maps.push(...skin.maps)
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, this.hi ? 96 : 64, this.hi ? 64 : 40), skin.mat)
    body.scale.setScalar(pr)
    tilt.add(body)
    let ring: THREE.Mesh | null = null
    if (input.rings) {
      const inner = pr * 1.42, outer = pr * 2.3
      ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 160, 1),
        new THREE.ShaderMaterial({
          vertexShader: ringVS,
          fragmentShader: ringFS,
          uniforms: { uSun: this.sun, uC: { value: new THREE.Vector3() }, uA: { value: C(style.ring[0]) }, uB: { value: C(style.ring[1]) }, uNormal: { value: new THREE.Vector3(0, 1, 0) }, uR: { value: pr }, uIn: { value: inner }, uOut: { value: outer }, uSeed: { value: (seed % 97) / 7 }, uK: { value: 1 } },
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.renderOrder = 1
      tilt.add(ring)
    }
    group.add(tilt)
    const atmos = atmosphere(style.atmos, pr, pr * (style.bands ? 1.07 : 1.1), this.sun)
    group.add(atmos)
    const moons: Planet['moons'] = []
    for (let i = 0; i < input.moons; i++) {
      const ms = pr * (0.16 + r() * 0.12)
      const ms_ = surface(this.renderer, MOON, ((seed + i * 131) % 1000) / 41, this.sun, 256, { crater: 1, glow: 0 })
      maps.push(...ms_.maps)
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), ms_.mat)
      mesh.scale.setScalar(ms)
      group.add(mesh)
      moons.push({ mesh, d: pr * (input.rings ? 2.6 : 1.9) + i * pr * 0.55, a: r() * Math.PI * 2, speed: (0.16 + r() * 0.12) / (1 + i * 0.6), incl: (r() - 0.5) * 0.35 })
    }
    // its orbit: a faint line round the home planet, a little inclined
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.14, 0, (r() - 0.5) * 0.14))
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 192; i++) pts.push(new THREE.Vector3(Math.cos((i / 192) * Math.PI * 2), 0, Math.sin((i / 192) * Math.PI * 2)))
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.1, depthWrite: false }))
    line.scale.setScalar(radius)
    line.quaternion.copy(q)
    this.scene.add(group, line)
    return { key, input, maps, r: pr, group, tilt, body, atmos, ring, moons, line, orbit: { radius, phase: order * 2.39996 + 0.6 + (r() - 0.5) * 0.3, speed: 0.012 / Math.sqrt(radius / 23), q }, spin: 0.05 + r() * 0.05, shown: 0, held: false, arrival: null }
  }

  private drop(p: Planet) {
    this.scene.remove(p.group, p.line)
    p.group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
    p.line.geometry.dispose()
    ;(p.line.material as THREE.Material).dispose()
    p.maps.forEach((m) => m.dispose())
  }

  /** where a planet is on its orbit right now */
  private place(p: Planet) {
    const a = p.orbit.phase + this.orbitT * p.orbit.speed
    p.group.position.set(Math.cos(a) * p.orbit.radius, 0, Math.sin(a) * p.orbit.radius).applyQuaternion(p.orbit.q)
  }

  /** keep a planet out of sight while its world is still lifting off the land */
  hold(id: string) {
    const p = this.planets.get(id)
    if (p && !p.arrival) p.held = true
  }

  /** the world has left the land at (x, z): it rises from that spot on the home planet and flies out to its orbit */
  arrive(id: string, x: number, z: number) {
    const p = this.planets.get(id)
    if (!p) return
    const l = Math.hypot(x, z), a = l / ARC
    const from = new THREE.Vector3(l > 1e-4 ? (Math.sin(a) * x) / l : 0, Math.cos(a), l > 1e-4 ? (Math.sin(a) * z) / l : 0).multiplyScalar(GLOBE_R * 1.02)
    p.held = false
    p.shown = 1
    p.arrival = { from, k: 0 }
  }

  /** what a planet looks like, for standing on it: its style and its painted surface */
  look(id: string) {
    const p = this.planets.get(id)
    return p ? { style: STYLES[p.input.template], map: p.maps[0].texture, mask: p.maps[1].texture, template: p.input.template } : null
  }

  /** the capital's spot on a planet, in space: where it is, which way is up there, and which way is north */
  capital(id: string) {
    const p = this.planets.get(id)
    if (!p) return null
    p.body.updateWorldMatrix(true, false)
    const m = p.body.matrixWorld
    const point = new THREE.Vector3(0, 0, 1).applyMatrix4(m)
    const center = new THREE.Vector3().setFromMatrixPosition(m)
    const normal = point.clone().sub(center).normalize()
    const north = new THREE.Vector3(0, 1, 0).transformDirection(m)
    return { point, normal, north, r: p.r * Math.max(0.001, p.group.scale.x) }
  }

  /** the home planet as seen from somewhere else, lit by that place's own sun */
  homeMaterial(sun: { value: THREE.Vector3 }) {
    return new THREE.ShaderMaterial({ vertexShader: bodyVS, fragmentShader: globeFS, uniforms: { ...this.globeU, uSun: sun } })
  }

  ids() {
    return [...this.planets.keys()]
  }

  /** where a planet is now, and how big */
  planet(id: string) {
    const p = this.planets.get(id)
    // reach: what a close view frames, the planet and its rings (moons come and go)
    return p && !p.held ? { pos: p.group.position, r: p.r * Math.max(0.001, p.group.scale.x), reach: p.r * (p.ring ? 2.35 : 1.55) } : null
  }

  /** the farthest any planet goes from the home planet */
  reach() {
    let m = GLOBE_R * 1.4
    for (const p of this.planets.values()) m = Math.max(m, p.orbit.radius + p.r * (p.ring ? 2.3 : 1.4))
    return m
  }

  step(dt: number, t: number, camera: THREE.Camera, px: number, look: { focus: string | null; hover: string | null; still: boolean; present?: { id: string; night: number } | null }) {
    if (!look.still) this.orbitT += dt
    const ex = new THREE.Vector3()
    for (const [id, p] of this.planets) {
      p.group.visible = !p.held
      p.line.visible = !p.held
      if (p.held) continue
      p.shown = look.still ? 1 : Math.min(1, p.shown + dt * 0.45)
      let e = 1 - Math.pow(1 - p.shown, 3)
      this.place(p)
      // arriving: out from the home planet on a curve, small and bright, growing into its orbit
      let flare = 0
      const ar = p.arrival
      if (ar) {
        ar.k = look.still ? 1 : Math.min(1, ar.k + dt / 4.8)
        const k = ar.k < 0.5 ? 4 * ar.k ** 3 : 1 - Math.pow(-2 * ar.k + 2, 3) / 2
        const mid = ar.from.clone().multiplyScalar(2.1).add(new THREE.Vector3(0, GLOBE_R * 0.6, 0))
        const end = p.group.position.clone()
        p.group.position.set(0, 0, 0).addScaledVector(ar.from, (1 - k) ** 2).addScaledVector(mid, 2 * (1 - k) * k).addScaledVector(end, k * k)
        e = 0.16 + 0.84 * k
        flare = 1 - k
        const count = Math.floor(192 * k)
        p.line.geometry.setDrawRange(0, Math.max(2, count))
        for (const m of p.moons) m.mesh.visible = k > 0.85
        if (ar.k >= 1) {
          p.arrival = null
          p.line.geometry.setDrawRange(0, Infinity)
          for (const m of p.moons) m.mesh.visible = true
        }
      }
      p.group.scale.setScalar(Math.max(0.001, e))
      if (look.present?.id === id) {
        // landing: the planet turns its capital to the sun (or, at night, away from it)
        p.tilt.updateWorldMatrix(true, false)
        const s = this.sun.value.clone().transformDirection(p.tilt.matrixWorld.clone().invert())
        const want = Math.atan2(s.x, s.z) + (look.present.night > 0.5 ? Math.PI : 0) - 0.35
        let d = want - p.body.rotation.y
        d = Math.atan2(Math.sin(d), Math.cos(d))
        p.body.rotation.y += look.still ? d : d * (1 - Math.pow(0.04, dt))
      } else if (!look.still) p.body.rotation.y += dt * p.spin
      const on = look.focus === id ? 1 : look.hover === id ? 0.6 : 0
      const am = p.atmos.material as THREE.ShaderMaterial
      am.uniforms.uC.value.copy(p.group.position)
      am.uniforms.uR.value = p.r * e
      am.uniforms.uRa.value = p.r * e * (STYLES[p.input.template].bands ? 1.07 : 1.1)
      am.uniforms.uK.value = 0.6 + on * 0.5 + flare * 2.2
      ;(p.line.material as THREE.LineBasicMaterial).opacity = (0.09 + on * 0.22) * e
      if (p.ring) {
        const rm = p.ring.material as THREE.ShaderMaterial
        rm.uniforms.uC.value.copy(p.group.position)
        rm.uniforms.uR.value = p.r * e
        p.ring.updateWorldMatrix(true, false)
        rm.uniforms.uNormal.value.set(0, 0, 1).transformDirection(p.ring.matrixWorld)
      }
      for (const m of p.moons) {
        if (!look.still) m.a += dt * m.speed
        ex.set(Math.cos(m.a) * m.d, Math.sin(m.a) * m.d * Math.sin(m.incl), Math.sin(m.a) * m.d * Math.cos(m.incl))
        m.mesh.position.copy(ex)
      }
    }
    // the sky stays at infinity
    const cp = (camera as THREE.PerspectiveCamera).position
    this.stars.position.copy(cp)
    this.band.position.copy(cp)
    this.sunGlow.position.copy(cp).addScaledVector(this.sun.value, 1400)
    const sm = this.stars.material as THREE.ShaderMaterial
    sm.uniforms.uT.value = look.still ? 0 : t
    sm.uniforms.uPx.value = px
  }

  /** the planet under a point on screen */
  pick(px: number, py: number, project: (v: THREE.Vector3) => { x: number; y: number; z: number }, camera: THREE.Camera) {
    let best: { id: string; d: number } | null = null
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    for (const [id, p] of this.planets) {
      const c = project(p.group.position)
      if (c.z > 1) continue
      const e = project(p.group.position.clone().addScaledVector(right, p.r))
      const rad = Math.max(22, Math.hypot(e.x - c.x, e.y - c.y) * 1.15)
      const d = Math.hypot(px - c.x, py - c.y)
      if (d < rad && (!best || d < best.d)) best = { id, d }
    }
    if (best) return best.id
    const c = project(new THREE.Vector3())
    const e = project(right.clone().multiplyScalar(GLOBE_R))
    return Math.hypot(px - c.x, py - c.y) < Math.hypot(e.x - c.x, e.y - c.y) ? 'home' : null
  }

  dispose() {
    for (const p of this.planets.values()) this.drop(p)
    this.planets.clear()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | undefined
      if (mat && 'map' in mat) (mat as THREE.SpriteMaterial).map?.dispose()
      mat?.dispose()
    })
    this.blank.dispose()
  }
}
