import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { heightAt, type Hill } from './height'
import { Builder, campfire, crates, footing, house, lantern, pole, signature, tent, type Shared } from './kit'

/*
  What a world has built, standing on its hill as seen from the Atlas.

  A grown world is a small hill town: its main app stands as a landmark on the summit
  square, its other apps on the upper terraces, and houses fill the level ground of every
  terrace, set along the slope and facing downhill. A path climbs from the foot to the
  square, lit by lanterns after dark. Nothing is placed on a terrace's rock face or on the
  path itself.

  A seed is a survey camp: a stake at the top, tents, crates and a campfire, and once its
  governor has published a first proof, a bigger tent for its first app.

  Built once from the world's settled shape; it rises out of the ground when the hill has
  grown into it.
*/

export interface SettlementInput {
  id: string
  template: Template
  apps: number
  houses: number
  /** 0..1: how busy the world is; more windows are lit at night */
  lit: number
  seed: boolean
}

export const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
export const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7) || 1

/** the footpath up a world, in a loose spiral from its foot to its summit (shared with the ground paint) */
export function hillPath(id: string, hill: Hill, seed: boolean) {
  const r = rand(seedOf(id + ':path'))
  const turns = seed ? 0.35 : 0.55 + hill.tiers * 0.22
  const a0 = r() * Math.PI * 2
  const pts: { x: number; z: number }[] = []
  for (let i = 0; i <= 48; i++) {
    const t = i / 48
    const a = a0 + t * turns * Math.PI * 2
    // a little wobble, as a real path finds its way
    const d = hill.radius * (1.12 - t * 0.99) * (1 + Math.sin(t * 17 + a0 * 3) * 0.035)
    pts.push({ x: hill.x + Math.cos(a) * d, z: hill.z + Math.sin(a) * d })
  }
  return pts
}

export function buildSettlement(input: SettlementInput, hill: Hill, hills: Hill[], shared: Shared) {
  const r = rand(seedOf(input.id))
  const b = new Builder(r, input.template)
  b.lit = 0.25 + input.lit * 0.6
  const g = (x: number, z: number) => heightAt(x, z, hills)
  const slope = (x: number, z: number) => Math.hypot(g(x + 0.35, z) - g(x - 0.35, z), g(x, z + 0.35) - g(x, z - 0.35)) / 0.7
  const path = hillPath(input.id, hill, input.seed)
  const onPath = (x: number, z: number, pad: number) => path.some((p) => Math.hypot(p.x - x, p.z - z) < pad)

  if (input.seed) {
    const top = g(hill.x, hill.z)
    b.at(top)
    pole(b, hill.x, hill.z, top, 2.2)
    // the camp: a couple of tents, supplies, a fire
    const a0 = r() * Math.PI * 2
    for (let i = 0; i < 2; i++) {
      const a = a0 + i * 2.2
      const f = { x: hill.x + Math.cos(a) * hill.radius * 0.42, z: hill.z + Math.sin(a) * hill.radius * 0.42, rot: a }
      const y = footing(g, f, 0.42, 0.34)
      b.at(y)
      tent(b, f, y, 0.42, 0.34, 0.48)
    }
    crates(b, g, hill.x + Math.cos(a0 + 1.1) * hill.radius * 0.35, hill.z + Math.sin(a0 + 1.1) * hill.radius * 0.35, r)
    campfire(b, g, hill.x + Math.cos(a0 - 1) * hill.radius * 0.28, hill.z + Math.sin(a0 - 1) * hill.radius * 0.28)
    if (input.apps > 0) {
      const a = a0 + 3.6
      const f = { x: hill.x + Math.cos(a) * hill.radius * 0.38, z: hill.z + Math.sin(a) * hill.radius * 0.38, rot: a }
      const y = footing(g, f, 0.62, 0.48)
      b.at(y)
      tent(b, f, y, 0.62, 0.48, 0.7)
    }
    return b.build(shared)
  }

  const placed: { x: number; z: number; s: number }[] = []
  const free = (x: number, z: number, s: number) => !placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 1.08)
  /** a level spot between two radii (as fractions of the hill), clear of the path and other buildings */
  const find = (lo: number, hi: number, s: number, flatness = 0.42) => {
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2
      const d = hill.radius * (lo + r() * (hi - lo))
      const x = hill.x + Math.cos(a) * d, z = hill.z + Math.sin(a) * d
      if (!free(x, z, s) || onPath(x, z, s * 0.8 + 0.35) || slope(x, z) > flatness) continue
      placed.push({ x, z, s })
      // long side along the terrace, front facing downhill
      return { x, z, s, rot: a + Math.PI / 2 }
    }
    return null
  }

  // the landmark: the first app, on the summit square
  if (input.apps > 0) {
    placed.push({ x: hill.x, z: hill.z, s: 1.1 })
    signature(input.template, b, g, { x: hill.x, z: hill.z, s: 1.1, rot: r() * Math.PI }, true, r, 'roof')
  }
  for (let i = 1; i < input.apps; i++) {
    const site = find(0.2, 0.55, 1.05, 0.55)
    if (site) signature(input.template, b, g, site, false, r, 'roof')
  }
  // houses on every terrace: more of them the bigger the world
  const count = Math.min(38, Math.round(input.houses * 1.6 + hill.radius * 1.2))
  for (let i = 0; i < count; i++) {
    const site = find(0.16, 0.9, 0.36 + r() * 0.22)
    if (site) house(input.template, b, g, site, r)
  }
  // lanterns along the path
  for (let i = 3; i < path.length - 2; i += 4) {
    const p = path[i], q = path[i + 1]
    const nx = -(q.z - p.z), nz = q.x - p.x
    const l = Math.hypot(nx, nz) || 1
    const side = i % 8 === 3 ? 1 : -1
    lantern(b, g, p.x + (nx / l) * 0.45 * side, p.z + (nz / l) * 0.45 * side)
  }
  return b.build(shared)
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((n) => {
    const mesh = n as THREE.Mesh
    mesh.geometry?.dispose()
    const m = mesh.material as THREE.Material | undefined
    m?.dispose()
    ;(mesh as THREE.Mesh & { customDepthMaterial?: THREE.Material }).customDepthMaterial?.dispose()
  })
}
