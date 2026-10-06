import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { heightAt, type Hill } from './height'
import { Builder, house, pole, signature, tent, footing, type Shared } from './kit'

/*
  What a world has built, standing on its hill as seen from the Atlas: one signature
  building per deployed app, in its world type's own architecture, and houses on the
  terraces around them. A seed has its survey stake and, once its governor has published
  a first proof, its first tent. Built once from the world's settled shape; it rises out
  of the ground when the hill has grown into it.
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

export function buildSettlement(input: SettlementInput, hill: Hill, hills: Hill[], shared: Shared) {
  const r = rand(seedOf(input.id))
  const b = new Builder(r)
  b.lit = 0.25 + input.lit * 0.6
  const g = (x: number, z: number) => heightAt(x, z, hills)

  if (input.seed) {
    const top = g(hill.x, hill.z)
    b.at(top)
    pole(b, hill.x, hill.z, top, 2.2)
    if (input.apps > 0) {
      const a = r() * Math.PI * 2
      const f = { x: hill.x + Math.cos(a) * hill.radius * 0.35, z: hill.z + Math.sin(a) * hill.radius * 0.35, rot: a }
      const y = footing(g, f, 0.5, 0.4)
      b.at(y)
      tent(b, f, y, 0.5, 0.4, 0.55)
    }
    return b.build(shared)
  }

  const placed: { x: number; z: number; s: number }[] = []
  const find = (lo: number, hi: number, s: number) => {
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2
      const d = hill.radius * (lo + r() * (hi - lo))
      const x = hill.x + Math.cos(a) * d, z = hill.z + Math.sin(a) * d
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 1.2)) continue
      placed.push({ x, z, s })
      return { x, z, s, rot: a + Math.PI / 2 }
    }
    return null
  }
  for (let i = 0; i < input.apps; i++) {
    const site = find(0.12, 0.5, 1.15)
    if (site) signature(input.template, b, g, site, false, r, 'wall')
  }
  for (let i = 0; i < input.houses; i++) {
    const site = find(0.12, 0.72, 0.42 + r() * 0.2)
    if (site) house(input.template, b, g, site, r)
  }
  return b.build(shared)
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((n) => {
    const mesh = n as THREE.Mesh
    mesh.geometry?.dispose()
    ;(mesh.material as THREE.Material | undefined)?.dispose()
  })
}
