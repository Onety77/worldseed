import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { heightAt, type Hill } from './height'
import { Builder, box, cylinder, dome, type Shared } from './kit'
import { rand, seedOf } from './settlement'

/*
  What only a sovereign world has: it stands on its own island, so it needs a way across.

  - A timber bridge arches over the moat towards the mainland it still settles to, on
    posts, with railings. It is built in order from the island outward, so during the
    ceremony that grants a chain it can be drawn plank by plank as the water opens.
  - A lighthouse on the seaward shore, its lamp lit after dark.
  - A small pier on the moat.
*/

export interface IslandParts {
  bridge: THREE.Group
  /** triangles and line vertices in the bridge, to reveal it in order */
  counts: { solid: number; lines: number }
  extras: THREE.Group
}

export function buildIsland(id: string, template: Template, hill: Hill, hills: Hill[], shared: Shared, opts: { lighthouse?: boolean } = {}): IslandParts {
  const g = (x: number, z: number) => heightAt(x, z, hills)
  // the way home: from the island towards the middle of the continent
  const len = Math.hypot(hill.x, hill.z) || 1
  const dir = { x: -hill.x / len, z: -hill.z / len }
  const side = { x: -dir.z, z: dir.x }

  // ── the bridge ──
  const b = new Builder(rand(seedOf(id + ':bridge')), template)
  // out from the island until it reaches land again
  const from = 0.82
  let to = 1.72
  for (let t = 1.3; t < 3.2; t += 0.04) {
    if (g(hill.x + dir.x * hill.radius * t, hill.z + dir.z * hill.radius * t) > 0.45) {
      to = Math.max(1.5, t + 0.12)
      break
    }
  }
  const n = 26
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n
    const x = hill.x + dir.x * hill.radius * t, z = hill.z + dir.z * hill.radius * t
    return { x, z, ground: g(x, z) }
  })
  // the deck follows the land at both ends and arches over the water between
  const deckY = pts.map((p, i) => {
    const u = i / n
    return Math.max(p.ground + 0.12, 0.35 + Math.sin(u * Math.PI) * 0.9)
  })
  const W = 0.42
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[i + 1]
    const y0 = deckY[i], y1 = deckY[i + 1]
    b.at(Math.min(y0, y1) - 0.05)
    const q = (p: { x: number; z: number }, s: number, y: number) => [p.x + side.x * W * s, y, p.z + side.z * W * s]
    // a plank: top and the two edges
    b.quad(q(a, -1, y0), q(c, -1, y1), q(c, 1, y1), q(a, 1, y0), 'wood')
    b.quad(q(a, -1, y0 - 0.07), q(c, -1, y1 - 0.07), q(c, -1, y1), q(a, -1, y0), 'wood')
    b.quad(q(a, 1, y0), q(c, 1, y1), q(c, 1, y1 - 0.07), q(a, 1, y0 - 0.07), 'wood')
    // railings
    b.edge(q(a, -1, y0 + 0.32), q(c, -1, y1 + 0.32))
    b.edge(q(a, 1, y0 + 0.32), q(c, 1, y1 + 0.32))
    if (i % 3 === 0) {
      b.edge(q(a, -1, y0), q(a, -1, y0 + 0.32))
      b.edge(q(a, 1, y0), q(a, 1, y0 + 0.32))
      // posts down into the water where the deck is off the ground
      if (y0 - a.ground > 0.4) {
        for (const s of [-1, 1]) {
          const p = q(a, s * 0.85, 0)
          box(b, { x: p[0], z: p[2], rot: 0 }, Math.min(a.ground, -0.4), 0.045, 0.045, y0 - Math.min(a.ground, -0.4), { roof: 'wood', windows: false, edges: false })
        }
      }
    }
  }
  const bridge = b.build(shared)
  const solid = bridge.children[0] as THREE.Mesh
  const lines = bridge.children[1] as THREE.LineSegments | undefined
  const counts = { solid: solid.geometry.getAttribute('position').count, lines: lines ? lines.geometry.getAttribute('position').count : 0 }

  // ── the lighthouse and the pier ──
  const e = new Builder(rand(seedOf(id + ':island')), template)
  e.lit = 1
  if (opts.lighthouse !== false) {
    // the lighthouse stands on the last of the land, facing the open sea
    const out = { x: -dir.x, z: -dir.z }
    let lx = hill.x, lz = hill.z
    for (let t = 0.7; t < 1.3; t += 0.02) {
      const x = hill.x + (out.x * 0.8 + side.x * 0.6) * hill.radius * t, z = hill.z + (out.z * 0.8 + side.z * 0.6) * hill.radius * t
      if (g(x, z) > 0.35) {
        lx = x
        lz = z
      }
    }
    const ly = g(lx, lz) - 0.05
    e.at(ly)
    const f = { x: lx, z: lz, rot: 0 }
    let top = cylinder(e, f, ly, 0.42, 0.2, 10, 'trim')
    for (let i = 0; i < 4; i++) top = cylinder(e, f, top, 0.34 - i * 0.03, 0.45, 10, i % 2 ? 'roof' : 'wall')
    top = cylinder(e, f, top, 0.36, 0.06, 10, 'trim')
    // the lamp room: glass that glows after dark
    const k = 0.2
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2
      const p0 = [lx + Math.cos(a0) * k, top, lz + Math.sin(a0) * k], p1 = [lx + Math.cos(a1) * k, top, lz + Math.sin(a1) * k]
      const p2 = [p1[0], top + 0.32, p1[2]], p3 = [p0[0], top + 0.32, p0[2]]
      e.tri(p0, p1, p2, 'lamp', 1)
      e.tri(p0, p2, p3, 'lamp', 1)
    }
    dome(e, { x: lx, z: lz, rot: 0 }, top + 0.32, 0.26, 'roof')
  }

  // a pier into the moat, a quarter turn round from the bridge
  const pa = Math.atan2(side.z, side.x)
  let sx = hill.x, sz = hill.z
  for (let t = 0.7; t < 1.3; t += 0.02) {
    const x = hill.x + Math.cos(pa) * hill.radius * t, z = hill.z + Math.sin(pa) * hill.radius * t
    if (g(x, z) > 0.2) {
      sx = x
      sz = z
    }
  }
  e.at(0.1)
  for (let i = 0; i < 6; i++) {
    const x = sx + Math.cos(pa) * i * 0.4, z = sz + Math.sin(pa) * i * 0.4
    box(e, { x, z, rot: pa }, 0.18, 0.22, 0.4, 0.06, { roof: 'wood', windows: false, edges: i === 0 })
    if (i % 2 === 0) for (const s of [-1, 1]) box(e, { x: x - Math.sin(pa) * 0.36 * s, z: z + Math.cos(pa) * 0.36 * s, rot: 0 }, -0.6, 0.04, 0.04, 0.95, { roof: 'wood', windows: false, edges: false })
  }
  const extras = e.build(shared)
  return { bridge, counts, extras }
}

/** show the bridge built up to a fraction k of its length */
export function revealBridge(parts: IslandParts, k: number) {
  const solid = parts.bridge.children[0] as THREE.Mesh
  const lines = parts.bridge.children[1] as THREE.LineSegments | undefined
  const tri = Math.floor((parts.counts.solid / 3) * k) * 3
  solid.geometry.setDrawRange(0, tri)
  lines?.geometry.setDrawRange(0, Math.floor((parts.counts.lines / 2) * k) * 2)
  parts.bridge.visible = k > 0.01
}
