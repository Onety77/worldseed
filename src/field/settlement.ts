import * as THREE from 'three'
import { heightAt, type Hill } from './height'

/*
  What a world has built, standing on its hill: one small block per deployed app, set on
  the terraces and facing the slope. Seeds have none yet; they carry a survey stake instead.
  Built once from the world's settled shape and faded in when the hill has grown into it.
*/

const TOP = new THREE.Color('#fbfbf8')
const SIDE_A = new THREE.Color('#dfe3db')
const SIDE_B = new THREE.Color('#c3cac0')
const INK = new THREE.Color('#141813')
const SPROUT = new THREE.Color('#c4ef3a')

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

export function buildSettlement(id: string, hill: Hill, hills: Hill[], count: number) {
  const group = new THREE.Group()
  const r = rand([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483646 || 1)

  if (count === 0) {
    // a survey stake: a thin post and a small sprout flag
    const top = heightAt(hill.x, hill.z, hills)
    const post = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(hill.x, top, hill.z), new THREE.Vector3(hill.x, top + 2.2, hill.z)])
    group.add(new THREE.Line(post, new THREE.LineBasicMaterial({ color: INK, transparent: true })))
    const flag = new THREE.BufferGeometry()
    flag.setAttribute('position', new THREE.Float32BufferAttribute([hill.x, top + 2.2, hill.z, hill.x + 0.9, top + 1.95, hill.z, hill.x, top + 1.7, hill.z], 3))
    group.add(new THREE.Mesh(flag, new THREE.MeshBasicMaterial({ color: SPROUT, side: THREE.DoubleSide, transparent: true })))
    return group
  }

  const pos: number[] = []
  const col: number[] = []
  const edges: number[] = []
  const placed: { x: number; z: number; s: number }[] = []
  let tries = 0
  while (placed.length < count && tries++ < count * 30) {
    // on the shoulders of the hill, avoiding the summit and each other
    const a = r() * Math.PI * 2
    const d = hill.radius * (0.15 + r() * 0.55)
    const x = hill.x + Math.cos(a) * d
    const z = hill.z + Math.sin(a) * d
    const s = 0.5 + r() * 0.4
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.s + s) * 1.25)) continue
    placed.push({ x, z, s })
    const w = s
    const dd = s * (0.7 + r() * 0.5)
    const h = 0.6 + r() * 1 + (count > 6 ? r() * 0.9 : 0)
    // sit on the lowest corner so nothing floats on the slope
    const base = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => heightAt(x + i * w, z + j * dd, hills))) - 0.05
    const rot = a + Math.PI / 2
    const c = Math.cos(rot), sn = Math.sin(rot)
    const P = (i: number, k: number, y: number) => [x + (i * w * c - k * dd * sn), y, z + (i * w * sn + k * dd * c)]
    const b = [P(-1, -1, base), P(1, -1, base), P(1, 1, base), P(-1, 1, base)]
    const t = [P(-1, -1, base + h), P(1, -1, base + h), P(1, 1, base + h), P(-1, 1, base + h)]
    const quad = (q: number[][], color: THREE.Color) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[i])
        col.push(color.r, color.g, color.b)
      }
    }
    quad([t[0], t[1], t[2], t[3]], TOP)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      quad([b[i], b[j], t[j], t[i]], i % 2 ? SIDE_A : SIDE_B)
      edges.push(...t[i], ...t[j], ...b[i], ...t[i])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })))
  const eg = new THREE.BufferGeometry()
  eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3))
  group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 })))
  return group
}

/** fade a settlement in or out */
export function setOpacity(group: THREE.Group, o: number) {
  group.visible = o > 0.01
  group.traverse((n) => {
    const m = (n as THREE.Mesh).material as THREE.Material | undefined
    if (!m) return
    const base = (m.userData.base ??= m.opacity)
    m.opacity = base * o
  })
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((n) => {
    const mesh = n as THREE.Mesh
    mesh.geometry?.dispose()
    ;(mesh.material as THREE.Material | undefined)?.dispose()
  })
}
