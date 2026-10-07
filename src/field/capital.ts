import * as THREE from 'three'
import type { Template } from '@/lib/types'
import type { Shared } from './kit'
import type { Style } from './cosmos'

/*
  A capital: the city you walk when you land on a planet.

  Every planet builds its own. What they share is only the contract with the rest of the
  site: the same civic places (the governor's tower, the treasury vault, the assembly hall,
  the market, the spaceport, and one landmark per app), each tagged so it opens its tab;
  small figures walking between them; a pulse when a proof is published; lights at night.
  Everything else (the street plan, the architecture, the ground it stands on, what moves
  through it) is the planet's own.

  A capital can also reshape the ground under it with a plan: three soft maps, drawn on
  canvases in the city's own coordinates, that say where the ground is pressed to a given
  height, how strongly, and where there is standing water; and a fourth that tints it.
*/

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

export interface Pt {
  x: number
  z: number
  /** the height of the way here, if not the city's ground */
  y?: number
}

export interface CapitalCtx {
  input: SurfaceInput
  r: () => number
  /** height of the ground the city stands on */
  top: number
  /** a deck floating over a gas giant, not ground */
  station: boolean
  hi: boolean
  shared: Shared
  style: Style
  place(key: string, kind: PlaceKind, x: number, y: number, z: number): void
}

export interface Capital {
  /** everything the city is made of */
  objects: THREE.Object3D[]
  /** radius of the level ground the city stands on */
  mesa: number
  /** how the city reshapes the ground under it */
  plan?: Plan
  /** where a published proof rings out from, and the ring's shape (sides, turn) */
  pulse: { x: number; z: number; sides: number; rot: number }
  /** the way a walker takes from one place to another */
  route(a: Pt, b: Pt, i: number): Pt[]
  /** a published proof, shown the capital's own way instead of the ring */
  flash?(): void
  /** anything that moves on its own (boats, sails); true while it is moving */
  step?(dt: number, t: number, still: boolean): boolean
  setNight?(k: number): void
}

/** the walker's way when a city has no streets to follow: a gentle curve */
export function curve(a: Pt, b: Pt, i: number): Pt[] {
  const nx = -(b.z - a.z), nz = b.x - a.x
  const nl = Math.hypot(nx, nz) || 1
  const out: Pt[] = []
  for (let k = 0; k <= 12; k++) {
    const e = k / 12
    const bend = Math.sin(e * Math.PI) * 1.2 * (i % 2 ? 1 : -1)
    out.push({ x: a.x + (b.x - a.x) * e + (nx / nl) * bend, z: a.z + (b.z - a.z) * e + (nz / nl) * bend })
  }
  return out
}

// ── the ground plan ──

/** heights a plan can press the ground to, either way from level */
const PLAN_H = 8

export interface Plan {
  /** half the width of the square the plan covers */
  half: number
  /** r: height, g: where standing water may lie, b: how strongly the height applies, a: the water's surface */
  shape: THREE.DataTexture
  /** a tint over the ground: colour, and how much of it */
  paint: THREE.CanvasTexture
  /** what stands in the low places: water, or (on a volcanic world) lava */
  molten?: boolean
  /** how much brighter the lava burns just now (a capital can flare it) */
  flare?: { value: number }
}

export interface Pens {
  /** white where there is standing water */
  water: CanvasRenderingContext2D
  /** white where the ground is pressed to the height drawn */
  weight: CanvasRenderingContext2D
  /** the height to press to, drawn as grey(h) */
  height: CanvasRenderingContext2D
  /** the surface of the standing water (or lava) here, drawn as grey(h): it can step down terraces */
  level: CanvasRenderingContext2D
  /** colour laid over the ground (alpha is how much) */
  paint: CanvasRenderingContext2D
  /** the grey that stands for a height */
  grey(h: number): string
  /** canvas units per world unit, for line widths */
  k: number
}

/**
 * Draw a plan. The pens draw in the city's own coordinates: (u, v) turned by `rot` into
 * the world's (x, z). Each of the shape maps is then softened by its own blur, in world units.
 */
export function drawPlan(half: number, res: number, rot: number, blur: { water: number; weight: number; height: number }, draw: (p: Pens) => void, level = -0.62): Plan {
  const k = res / (2 * half)
  const pen = (fill: string) => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = res
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.fillStyle = fill
    g.fillRect(0, 0, res, res)
    const c = Math.cos(rot), s = Math.sin(rot)
    g.setTransform(k * c, k * s, -k * s, k * c, res / 2, res / 2)
    return g
  }
  const grey = (h: number) => {
    const v = Math.round(Math.min(255, Math.max(0, 128 + (h / PLAN_H) * 127)))
    return `rgb(${v},${v},${v})`
  }
  const pens: Pens = { water: pen('#000'), weight: pen('#000'), height: pen(grey(0)), level: pen(grey(level)), paint: pen('rgba(0,0,0,0)'), grey, k }
  draw(pens)

  const read = (g: CanvasRenderingContext2D, px: number) => {
    const d = g.getImageData(0, 0, res, res).data
    const out = new Float32Array(res * res)
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255
    return soften(out, res, Math.round(px * k))
  }
  const hgt = read(pens.height, blur.height), wat = read(pens.water, blur.water), wgt = read(pens.weight, blur.weight), lvl = read(pens.level, blur.height)
  const data = new Uint16Array(res * res * 4)
  for (let i = 0; i < res * res; i++) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(((hgt[i] * 255 - 128) / 127) * PLAN_H)
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(wat[i])
    data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(wgt[i])
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(((lvl[i] * 255 - 128) / 127) * PLAN_H)
  }
  const shape = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.HalfFloatType)
  shape.magFilter = shape.minFilter = THREE.LinearFilter
  shape.wrapS = shape.wrapT = THREE.ClampToEdgeWrapping
  shape.needsUpdate = true
  const paint = new THREE.CanvasTexture(pens.paint.canvas)
  paint.flipY = false
  paint.colorSpace = THREE.SRGBColorSpace
  paint.anisotropy = 4
  return { half, shape, paint }
}

/** three passes of a box blur, near enough a gaussian */
function soften(a: Float32Array, n: number, r: number) {
  if (r < 1) return a
  let src: Float32Array = a
  let dst: Float32Array = new Float32Array(a.length)
  for (let pass = 0; pass < 3; pass++)
    for (const horiz of [true, false]) {
      for (let line = 0; line < n; line++) {
        let sum = 0
        const at = (i: number) => src[horiz ? line * n + Math.min(n - 1, Math.max(0, i)) : Math.min(n - 1, Math.max(0, i)) * n + line]
        for (let i = -r; i <= r; i++) sum += at(i)
        for (let i = 0; i < n; i++) {
          dst[horiz ? line * n + i : i * n + line] = sum / (2 * r + 1)
          sum += at(i + r + 1) - at(i - r)
        }
      }
      ;[src, dst] = [dst, src]
    }
  return src
}
