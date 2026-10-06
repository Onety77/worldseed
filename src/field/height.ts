/*
  The Field's height function, shared by the GPU (as GLSL text) and the CPU (for labels,
  bridges and camera targets). Units are field units; sea level is 0.

  - The continent: a low plateau with a ragged coast, the shared WORLDSEED environment.
  - Each world: a hill whose height follows its growth, cut into one terrace per era.
  - Water round a hill: a launch site's island, left where a world lifted off to become a
    planet (and, in a replay, the world itself on the day it earned its chain).
*/

export const MAX_HILLS = 40
export const CONTOUR = 0.5 // a line every half unit
export const INDEX_EVERY = 5 // every fifth line is an index contour, drawn darker

export interface Hill {
  x: number
  z: number
  radius: number
  height: number
  /** terraces: one per era reached */
  tiers: number
  /** 0..1, how far the moat has opened */
  moat: number
}

export const GLSL = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
float continent(vec2 p) {
  float n = fbm(p * .045);
  float d = fbm(p * .13 + 7.);
  float r = length(p * vec2(1., 1.12)) / 47.;
  float land = 1. - smoothstep(.78, 1.04, r + (n - .45) * .42);
  return land * (.7 + n * 1.7 + d * .5) - (1. - land) * 2.2;
}
float hill(vec2 p, vec4 h, vec4 m) {
  vec2 d = p - h.xy;
  float ang = atan(d.y, d.x);
  float rr = h.z * (1. + .1 * sin(ang * 3. + h.x) + .06 * sin(ang * 5. + h.y * .7));
  float t = length(d) / max(rr, .001);
  float shape = smoothstep(0., 1., clamp(1. - t, 0., 1.));
  // a flat summit plateau for the square and its landmark
  float s = min(shape * m.x * 1.15, m.x);
  float terr = (floor(s) + smoothstep(.66, 1., fract(s))) / max(m.x, 1.);
  float hh = mix(shape, terr, .8) * h.w;
  float moat = m.y * exp(-pow((t - 1.24) / .17, 2.)) * 6.;
  return hh - moat;
}
`

// ── CPU mirror ──
const fract = (x: number) => x - Math.floor(x)
function hash(x: number, y: number) {
  let px = fract(x * 123.34)
  let py = fract(y * 456.21)
  const d = px * (px + 45.32) + py * (py + 45.32)
  px += d
  py += d
  return fract(px * py)
}
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), e = hash(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + e) * ux * uy
}
function fbm(x: number, y: number) {
  let v = 0, a = 0.5
  for (let i = 0; i < 4; i++) {
    v += a * noise(x, y)
    x = x * 2.03 + 1.7
    y = y * 2.03 + 9.2
    a *= 0.5
  }
  return v
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export function continent(x: number, z: number) {
  const n = fbm(x * 0.045, z * 0.045)
  const d = fbm(x * 0.13 + 7, z * 0.13 + 7)
  const r = Math.hypot(x, z * 1.12) / 47
  const land = 1 - smooth(0.78, 1.04, r + (n - 0.45) * 0.42)
  return land * (0.7 + n * 1.7 + d * 0.5) - (1 - land) * 2.2
}
export function hillAt(x: number, z: number, h: Hill) {
  const dx = x - h.x, dz = z - h.z
  const ang = Math.atan2(dz, dx)
  const rr = h.radius * (1 + 0.1 * Math.sin(ang * 3 + h.x) + 0.06 * Math.sin(ang * 5 + h.z * 0.7))
  const t = Math.hypot(dx, dz) / Math.max(rr, 0.001)
  const shape = smooth(0, 1, Math.min(1, Math.max(0, 1 - t)))
  const s = Math.min(shape * h.tiers * 1.15, h.tiers)
  const terr = (Math.floor(s) + smooth(0.66, 1, fract(s))) / Math.max(h.tiers, 1)
  const hh = (shape + (terr - shape) * 0.8) * h.height
  const moat = h.moat * Math.exp(-(((t - 1.24) / 0.17) ** 2)) * 6
  return hh - moat
}
export function heightAt(x: number, z: number, hills: Hill[]) {
  let y = continent(x, z)
  for (const h of hills) y += hillAt(x, z, h)
  return y
}
