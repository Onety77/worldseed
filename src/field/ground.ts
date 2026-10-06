import * as THREE from 'three'
import { CONTOUR, GLSL, INDEX_EVERY, MAX_HILLS, heightAt, type Hill } from './height'

/*
  The ground: land and sea as one lit surface.

  The whole shape of the land is first drawn into a height texture on the GPU (the same
  height function the CPU uses for labels and buildings). The terrain mesh stands on that
  texture, and every pixel reads it again: so slopes, cliffs, beaches and water depth are
  all exact per pixel, and the sun lights every terrace edge crisply.

  The look is a lit miniature: meadows that shift with the ground, rock where terraces
  step up, sand where land meets water, and sea that runs from turquoise shallows with
  surf at the shore to deep blue. Faint contour lines stay as the surveyor's signature.
*/

/** the heightfield covers -HALF..HALF in x and z */
export const HALF = 100

const glsl = String.raw

/** the colours of the ground, by day (night is the same land under different light) */
export const GROUND = {
  grassDark: '#7ba65a',
  grass: '#97bf68',
  grassLight: '#b3d27d',
  meadow: '#d2d68e',
  high: '#c3cc8e',
  tended: '#a3cc68',
  rock: '#bdb09a',
  rockDark: '#8a7f6e',
  sand: '#eedfb4',
  wetSand: '#d3bd8c',
  shallow: '#7fd0c8',
  sea: '#4ba3bf',
  deep: '#2f7ba3',
  foam: '#ffffff',
  ink: '#33392c',
  sprout: '#c4ef3a',
  red: '#d2553a',
  withered: '#a99f6c',
  path: '#dcc497',
  pathEdge: '#b89a6a',
  field: '#e0cc6e',
  fieldGreen: '#a7c95e',
  plaza: '#d8ccb0',
  lamp: '#ffc46b',
}

const C = (hex: string) => new THREE.Color(hex)

// ── the height texture ──

const hfVS = glsl`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}`
const hfFS = glsl`
precision highp float;
${GLSL}
uniform vec4 uHill[${MAX_HILLS}];
uniform vec4 uMeta[${MAX_HILLS}];
uniform int uCount;
varying vec2 vUv;
void main() {
  vec2 p = vUv * ${(HALF * 2).toFixed(1)} - ${HALF.toFixed(1)};
  float y = continent(p);
  for (int i = 0; i < ${MAX_HILLS}; i++) {
    if (i >= uCount) break;
    y += hill(p, uHill[i], uMeta[i]);
  }
  gl_FragColor = vec4(y, 0., 0., 1.);
}`

export class Heightfield {
  readonly texture: THREE.Texture
  readonly size: number
  private rt: THREE.WebGLRenderTarget | null = null
  private data: THREE.DataTexture | null = null
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private lastCpu = 0

  constructor(renderer: THREE.WebGLRenderer, size: number, uniforms: { uHill: { value: THREE.Vector4[] }; uMeta: { value: THREE.Vector4[] }; uCount: { value: number } }) {
    this.size = size
    const ext = renderer.extensions
    // draw on the GPU where half floats can be rendered to (nearly everywhere with WebGL2)
    if (renderer.capabilities.isWebGL2 !== false && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'))) {
      this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping })
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: hfVS, fragmentShader: hfFS, uniforms }))
      quad.frustumCulled = false
      this.scene.add(quad)
      this.texture = this.rt.texture
    } else {
      // otherwise work it out on the CPU, smaller, and less often while hills move
      const s = Math.min(size, 256)
      this.size = s
      this.data = new THREE.DataTexture(new Uint16Array(s * s * 4), s, s, THREE.RGBAFormat, THREE.HalfFloatType)
      this.data.minFilter = this.data.magFilter = THREE.LinearFilter
      this.texture = this.data
    }
  }

  update(renderer: THREE.WebGLRenderer, hills: Hill[], force = false) {
    if (this.rt) {
      const prev = renderer.getRenderTarget()
      renderer.setRenderTarget(this.rt)
      renderer.render(this.scene, this.cam)
      renderer.setRenderTarget(prev)
      return
    }
    const now = performance.now()
    if (!force && now - this.lastCpu < 220) return
    this.lastCpu = now
    const s = this.size
    const arr = this.data!.image.data as Uint16Array
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const x = ((i + 0.5) / s) * HALF * 2 - HALF, z = ((j + 0.5) / s) * HALF * 2 - HALF
        arr[(j * s + i) * 4] = THREE.DataUtils.toHalfFloat(heightAt(x, z, hills))
      }
    this.data!.needsUpdate = true
  }

  dispose() {
    this.rt?.dispose()
    this.data?.dispose()
  }
}

// ── the terrain material ──

/** shared by the terrain's vertex and fragment stages */
const sample = glsl`
uniform sampler2D uHF;
uniform float uTexel;
float hf(vec2 p) { return texture2D(uHF, p / ${(HALF * 2).toFixed(1)} + .5).r; }
vec3 hfNormal(vec2 p, float e) {
  float l = hf(p - vec2(e, 0.)), r = hf(p + vec2(e, 0.)), d = hf(p - vec2(0., e)), u = hf(p + vec2(0., e));
  return normalize(vec3(l - r, 2. * e, d - u));
}
`

const noiseAndGlints = glsl`
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1., 0.)), u.x), mix(h2(i + vec2(0., 1.)), h2(i + 1.), u.x), u.y);
}
// the sun (or the moon) catching small moving facets of the water: scattered sparkles, never stripes
vec3 waterGlints(vec2 p, float t, vec3 sun, float night) {
  vec3 wn = normalize(vec3((vn(p * 1.7 + vec2(t * .35, t * .1)) - .5) * .5, 1., (vn(p * 2.1 - vec2(t * .2, t * .3) + 5.) - .5) * .5));
  vec3 v = normalize(cameraPosition - vW);
  float s = max(dot(reflect(-sun, wn), v), 0.);
  float sparkle = smoothstep(.998, 1., s) * smoothstep(.7, .9, vn(p * 3.3 + t * .6));
  // after dark only a soft moon sheen, from smooth broad facets
  vec3 mn = normalize(vec3((vn(p * .35 + t * .05) - .5) * .25, 1., (vn(p * .4 - t * .04 + 3.) - .5) * .25));
  float m = max(dot(reflect(-sun, mn), v), 0.);
  return vec3(1., .97, .88) * (sparkle * .9 + pow(s, 14.) * .04) * (1. - night) + vec3(.6, .72, .95) * pow(m, 18.) * .035 * night;
}
`

const fragPars = glsl`
${sample}
uniform vec3 uGrassDark, uGrass, uGrassLight, uMeadow, uHigh, uTended, uRock, uRockDark, uSand, uWetSand;
uniform vec3 uShallow, uSea, uDeep, uFoam, uInk, uSprout, uRed, uWithered, uLamp, uPath, uPathEdge, uField, uFieldGreen, uPlaza;
uniform sampler2D uPaint;
uniform vec3 uSunDir;
uniform float uT, uNight, uContours;
uniform vec4 uHill[${MAX_HILLS}];
uniform vec4 uMeta[${MAX_HILLS}];
uniform int uCount;
uniform float uGlow[${MAX_HILLS}];
uniform float uTrouble[${MAX_HILLS}];
uniform vec4 uPing[8];
varying vec3 vW;
${noiseAndGlints}
float lineAt(float v, float width) {
  float w = max(fwidth(v), 1e-4);
  return (1. - smoothstep(0., w * width, abs(fract(v - .5) - .5))) * (1. - smoothstep(.18, .45, w));
}
// soft cloud shadows drifting slowly over land and sea by day
float cloud(vec2 p, float t) {
  return smoothstep(.55, .85, vn(p * .04 + t * vec2(.035, .014)) * .65 + vn(p * .1 - t * vec2(.02, .03)) * .35);
}
`

/** the colour of the ground at p: albedo, plus light it gives off (surf glints, lamps) */
const groundColor = glsl`
  vec2 gp = vW.xz;
  float gh = hf(gp);
  float ge = ${(HALF * 2).toFixed(1)} * uTexel;
  vec3 gn = gh > 0. ? hfNormal(gp, ge) : vec3(0., 1., 0.);
  vec3 glow = vec3(0.);
  vec3 col;
  float n1 = vn(gp * .07), n2 = vn(gp * .31 + 3.1), n3 = vn(gp * 1.9 + 7.);
  // which world, if any, this pixel belongs to
  float own = 0., focus = 0., muted = 0., trouble = 0., halo = 0., lamps = 0.;
  for (int i = 0; i < ${MAX_HILLS}; i++) {
    if (i >= uCount) break;
    vec4 hl = uHill[i];
    vec4 m = uMeta[i];
    float t = length(gp - hl.xy) / max(hl.z, .001);
    float inside = 1. - smoothstep(.9, 1.06, t);
    own = max(own, inside * step(.05, hl.w));
    focus = max(focus, inside * m.z);
    muted = max(muted, inside * m.w);
    // a challenge is a warning, a missed milestone is a failure: the ground shows the difference
    trouble = max(trouble, inside * uTrouble[i] * uTrouble[i]);
    // a soft ring of light around the world in focus, at the foot of its hill
    halo = max(halo, exp(-pow((t - 1.1) / .028, 2.)) * m.z);
    // after dark, a lived-in world lights the ground around its buildings
    lamps += uGlow[i] * exp(-t * t * 5.) * (1. - m.w * .8);
  }

  if (gh >= 0.) {
    // land
    float slope = 1. - gn.y;
    // the shape of the ground around this point: hollows darken, edges catch the light
    float rr = .75;
    float avg = (hf(gp + vec2(rr, 0.)) + hf(gp - vec2(rr, 0.)) + hf(gp + vec2(0., rr)) + hf(gp - vec2(0., rr))
      + hf(gp + vec2(rr, rr) * .7) + hf(gp - vec2(rr, rr) * .7) + hf(gp + vec2(rr, -rr) * .7) + hf(gp + vec2(-rr, rr) * .7)) / 8.;
    float cav = clamp((avg - gh) * 1.6, -1., 1.);
    vec3 grass = mix(uGrassDark, uGrass, smoothstep(.15, .8, n1 * .55 + n2 * .45));
    grass = mix(grass, uGrassLight, smoothstep(.55, .85, n2) * .55);
    grass = mix(grass, uMeadow, smoothstep(.62, .9, n1) * .35);
    // worlds are tended: a fresher green on their terraces
    grass = mix(grass, uTended, own * .45);
    // higher ground is drier
    grass = mix(grass, uHigh, smoothstep(5., 11., gh) * .5 * (1. - own * .6));
    grass *= .94 + n3 * .1;
    // close up, the grass has texture: fine speckles of light and dark
    float fine = vn(gp * 7.) * .6 + vn(gp * 15.) * .4;
    grass *= mix(1., .9 + fine * .2, 1. - smoothstep(.04, .14, fwidth(gp.x)));
    // terrace risers and steep banks show rock, banded like strata
    float cliff = smoothstep(.3, .48, slope);
    // terrace walls: dressed stone in courses, each block a slightly different shade
    float course = gh * 5.5;
    vec2 blockId = vec2(floor(course), floor((gp.x + gp.y) * 1.6 + floor(course) * .5));
    vec3 rock = mix(uRockDark, uRock, .62 + h2(blockId) * .38);
    float mortar = 1. - smoothstep(.0, .12, min(fract(course), 1. - fract(course)));
    rock *= 1. - mortar * .22 * (1. - smoothstep(.15, .4, fwidth(course)));
    rock *= .94 + n3 * .1;
    col = mix(grass, rock, cliff);
    // where land meets water: sand, darker where the surf keeps it wet
    float beach = (1. - smoothstep(.16, .5, gh + n2 * .12)) * (1. - cliff * .7);
    col = mix(col, mix(uWetSand, uSand, smoothstep(.02, .12, gh)), beach);
    // what people made of the ground: fields, paved squares, roads and paths
    vec4 pt = texture2D(uPaint, gp / ${(HALF * 2).toFixed(1)} + .5);
    float flat_ = 1. - cliff;
    float fm = smoothstep(.12, .3, pt.g) * flat_;
    float fa = (pt.g - .25) / .75 * 3.14159;
    float furrow = sin(dot(gp, vec2(cos(fa), sin(fa))) * 7.5);
    float crop = vn(floor(gp * .45) + 11.);
    vec3 fieldC = crop < .4 ? uField : crop < .75 ? uFieldGreen : mix(uPathEdge, uField, .35);
    fieldC *= .92 + furrow * .07;
    col = mix(col, fieldC, fm * .92);
    float pv = smoothstep(.3, .6, pt.b) * flat_;
    vec2 tile = abs(fract(gp * 2.2) - .5);
    vec3 stone = uPlaza * (.95 + vn(floor(gp * 2.2)) * .08) * (1. - smoothstep(.44, .5, max(tile.x, tile.y)) * .12);
    col = mix(col, stone, pv);
    float rd = pt.r;
    float roadEdge = smoothstep(.2, .45, rd) * (1. - smoothstep(.6, .85, rd));
    col = mix(col, uPathEdge * (.95 + n3 * .1), roadEdge * .55 * (1. - cliff * .5));
    col = mix(col, uPath * (.93 + n3 * .12), smoothstep(.72, .9, rd) * (1. - cliff * .4));
    // a world in trouble: its grass withers and greys
    col = mix(col, uWithered * (.9 + n3 * .15), trouble * .7 * (1. - cliff * .5));
    // hollows and the foot of each terrace sit in shade; the lip of each terrace catches light
    col *= 1. - max(cav, 0.) * .38;
    col *= 1. + max(-cav, 0.) * .26;
    // the surveyor's lines, faint: contours and index contours
    float c = lineAt(gh / ${CONTOUR.toFixed(2)}, 1.) * .07 + lineAt(gh / ${(CONTOUR * INDEX_EVERY).toFixed(2)}, 1.3) * .1;
    col = mix(col, uInk, c * uContours * (1. - beach) * (1. - smoothstep(.3, .6, rd)) * (1. - fm));
    // the coastline drawn in ink
    float coast = 1. - smoothstep(0., max(fwidth(gh), 1e-4) * 1.6, gh);
    col = mix(col, uInk, coast * .35);
  } else {
    // sea: turquoise over sand, blue over depth
    float d = -gh;
    float wob = vn(gp * .6 + uT * .05) * .18;
    col = mix(uShallow, uSea, smoothstep(.05, .9 + wob, d));
    col = mix(col, uDeep, smoothstep(.9, 2.1, d));
    // gentle waves: soft bands of light and shade drifting across
    float wave = sin(gp.x * .9 + gp.y * .35 + uT * .9 + n2 * 4.) * sin(gp.y * .7 - gp.x * .2 + uT * .6);
    col *= 1. + wave * .025;
    // surf: a white line at the shore, and a second that breathes in and out
    float edge = 1. - smoothstep(0., .09 + n3 * .05, d);
    float swell = sin(d * 16. - uT * 1.7 + n2 * 5.);
    float surf = edge + smoothstep(.75, 1., swell) * (1. - smoothstep(.12, .5, d)) * .8;
    col = mix(col, uFoam, clamp(surf, 0., 1.) * .85);
    // glints where the sun catches the water
    glow += waterGlints(gp, uT, uSunDir, uNight) * smoothstep(.2, 1.2, d);
  }

  // cloud shadows by day
  col *= 1. - cloud(gp, uT) * .16 * (1. - uNight);
  // focus: the world's hill brightens a little, and a ring of light stands at its foot
  col = mix(col, col * 1.06 + uSprout * .03, focus * .5);
  glow += uSprout * halo * .2 * (1. - uNight * .45);
  // muted by a filter: greyed and stepped back
  col = mix(col, vec3(dot(col, vec3(.3, .55, .15))) * .96, muted * .75);

  // pings: a ring of light runs out from a world that published proof (red for bad news)
  for (int i = 0; i < 8; i++) {
    vec4 pg = uPing[i];
    if (pg.w == 0.) continue;
    float sc = abs(pg.w);
    float dd = length(gp - pg.xy);
    float r = pg.z * 7. * sc;
    float v = exp(-pow((dd - r) / (.45 * sc), 2.)) * smoothstep(.08, .3, pg.z) * (1. - smoothstep(.4, 1.7 + (sc - 1.) * .4, pg.z));
    glow += (pg.w < 0. ? uRed : uSprout) * v * .9;
  }

  // night: warm light around lived-in worlds
  glow += uLamp * min(lamps, 1.) * uNight * .02 * (gh >= 0. ? 1. : .4);

  diffuseColor.rgb = col;
  vec3 gNormalView = normalize((viewMatrix * vec4(gn, 0.)).xyz);
`

export interface GroundUniforms {
  uHF: { value: THREE.Texture }
  uPaint: { value: THREE.Texture }
  uTexel: { value: number }
  uHill: { value: THREE.Vector4[] }
  uMeta: { value: THREE.Vector4[] }
  uCount: { value: number }
  uGlow: { value: number[] }
  uTrouble: { value: number[] }
  uPing: { value: THREE.Vector4[] }
  uT: { value: number }
  uNight: { value: number }
  uSunDir: { value: THREE.Vector3 }
  uContours: { value: number }
}

export function makeGroundUniforms(): Omit<GroundUniforms, 'uHF' | 'uTexel' | 'uPaint'> {
  return {
    uHill: { value: Array.from({ length: MAX_HILLS }, () => new THREE.Vector4()) },
    uMeta: { value: Array.from({ length: MAX_HILLS }, () => new THREE.Vector4()) },
    uCount: { value: 0 },
    uGlow: { value: new Array(MAX_HILLS).fill(0) },
    uTrouble: { value: new Array(MAX_HILLS).fill(0) },
    uPing: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    uT: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.45, 0.85, 0.35).normalize() },
    uContours: { value: 1 },
  }
}

/** the terrain: a grid standing on the height texture, lit by the sun, shadowed by what stands on it */
export function makeTerrain(u: GroundUniforms, segments: number) {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const colors = Object.fromEntries(Object.entries(GROUND).map(([k, v]) => [`u${k[0].toUpperCase()}${k.slice(1)}`, { value: C(v) }]))
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, colors)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${sample}\nvarying vec3 vW;`)
      .replace('#include <beginnormal_vertex>', `float gh0 = hf(position.xz);\nvec3 objectNormal = gh0 > 0. ? hfNormal(position.xz, ${(HALF * 2).toFixed(1)} * uTexel) : vec3(0., 1., 0.);`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, max(gh0, 0.), position.z);\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragPars}`)
      .replace('#include <color_fragment>', groundColor)
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.;\nvec3 normal = gNormalView;\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += glow;')
  }
  // one program per quality level; the key keeps three from mixing them up
  mat.customProgramCacheKey = () => `ground-${segments}`
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  // the shadow pass needs the same shape the eye sees
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uHF: u.uHF, uTexel: u.uTexel })
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${sample}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, max(hf(position.xz), 0.), position.z);')
  }
  depth.customProgramCacheKey = () => `ground-depth-${segments}`
  mesh.customDepthMaterial = depth
  return mesh
}

/** open sea beyond the terrain's edge, in the same deep blue, with the same waves and glints */
export function makeOcean(u: GroundUniforms) {
  const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshLambertMaterial({ color: C(GROUND.deep) })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: u.uT, uNight: u.uNight, uSunDir: u.uSunDir })
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uT, uNight;\nuniform vec3 uSunDir;\nvarying vec3 vW;\n${noiseAndGlints}`)
      .replace(
        '#include <emissivemap_fragment>',
        glsl`
        vec2 gp = vW.xz;
        totalEmissiveRadiance += waterGlints(gp, uT, uSunDir, uNight);
        diffuseColor.rgb *= 1. + sin(gp.x * .9 + gp.y * .35 + uT * .9) * sin(gp.y * .7 - gp.x * .2 + uT * .6) * .025;`,
      )
  }
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = -0.04
  mesh.receiveShadow = true
  return mesh
}
