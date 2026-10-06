import * as THREE from 'three'
import { continent, heightAt, type Hill } from './height'
import { rand } from './settlement'

/*
  Nature on the Field: woods, single trees, bushes and rocks.

  Three kinds of tree (round broadleaf, tall pine, low bush) and two of rock, each one
  drawn once and repeated thousands of times by the GPU, so a whole continent of forest
  costs a handful of draw calls. Every tree has its own size, lean and shade of green; a
  few broadleaves have turned gold. All of them sway a little in the wind, cast shadows,
  and keep clear of the worlds' towns, the coast and the roads.

  Woods grow in clumps where the noise says so; the worlds themselves get orchards on
  their lower terraces.
*/

/** shared clock for anything that moves in the wind */
export const WIND = { uT: { value: 0 } }

const GREENS = ['#5e9443', '#6fa64c', '#7fb255', '#5b8c46', '#89b95b']
const PINES = ['#3f7449', '#4a8251', '#3a6a45']
const AUTUMN = ['#d7a03f', '#c9743b', '#e0b84c']
const BARK = '#7a5b3d'
const ROCKS = ['#b9b2a5', '#a9a294', '#c6c0b4']

/** wind sway: the higher a vertex stands, the further it moves */
function sway(mat: THREE.Material, amount: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = WIND.uT
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      float ph = ip.x * .37 + ip.z * .23;
      float k = max(position.y, 0.) * ${amount.toFixed(3)};
      transformed.x += sin(uT * 1.3 + ph) * k;
      transformed.z += cos(uT * 1.1 + ph * 1.3) * k * .6;
      #endif`,
    )
  }
  mat.customProgramCacheKey = () => `sway-${amount}`
}

/** a low-poly blob, slightly lumpy so no two clumps of leaves catch the light alike */
function blob(r: number, detail = 0, seed = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const rr = rand(seed)
  for (let i = 0; i < p.count; i++) {
    const k = 0.86 + rr() * 0.28
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.92, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

function merge(parts: THREE.BufferGeometry[]) {
  // flatten to non-indexed and join; tiny geometries, done once
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  const total = flat.reduce((s, g) => s + g.getAttribute('position').count, 0)
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3)
  let o = 0
  for (const g of flat) {
    const p = g.getAttribute('position') as THREE.BufferAttribute, n = g.getAttribute('normal') as THREE.BufferAttribute
    pos.set(p.array as Float32Array, o * 3)
    nor.set(n.array as Float32Array, o * 3)
    o += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return out
}

// unit-sized shapes, scaled per instance
function crownGeo() {
  const a = blob(0.62, 1, 3).translate(0, 1.35, 0)
  const b = blob(0.46, 0, 5).translate(0.32, 1.05, 0.12)
  const c = blob(0.4, 0, 7).translate(-0.28, 1.12, -0.18)
  return merge([a, b, c])
}
function pineGeo() {
  const parts = [0, 1, 2].map((i) => new THREE.ConeGeometry(0.62 - i * 0.16, 0.95 - i * 0.12, 7).translate(0, 0.85 + i * 0.52, 0))
  parts.forEach((g) => g.computeVertexNormals())
  return merge(parts)
}
function trunkGeo(h: number) {
  const g = new THREE.CylinderGeometry(0.07, 0.1, h, 5).translate(0, h / 2, 0)
  return g
}
function bushGeo() {
  return merge([blob(0.42, 0, 11).translate(0, 0.28, 0), blob(0.3, 0, 13).translate(0.28, 0.2, 0.1)])
}
function rockGeo(seed: number) {
  const g = new THREE.DodecahedronGeometry(0.5, 0)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const r = rand(seed)
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.55 + r() * 0.2), p.getZ(i) * (0.8 + r() * 0.4))
  g.computeVertexNormals()
  return g.translate(0, 0.12, 0)
}

interface Spot {
  x: number
  y: number
  z: number
  s: number
  rot: number
  kind: 'broad' | 'pine' | 'bush' | 'rock'
}

export interface NatureWorld {
  hill: Hill
  stage: 'seed' | 'realm' | 'sovereign'
}

export class Nature {
  readonly group = new THREE.Group()
  private meshes: THREE.InstancedMesh[] = []
  private key = ''

  /** (re)plant for this set of worlds; `avoid` keeps trees off roads */
  build(worlds: NatureWorld[], hills: Hill[], avoid: (x: number, z: number) => boolean, budget: number) {
    const key = worlds.map((w) => `${w.hill.x},${w.hill.z},${w.hill.radius.toFixed(1)},${w.stage}`).join('|') + budget
    if (key === this.key) return
    this.key = key
    this.clear()
    const r = rand(5821)
    const spots: Spot[] = []
    const clear = (x: number, z: number, pad: number) => !worlds.some((w) => Math.hypot(w.hill.x - x, w.hill.z - z) < w.hill.radius + pad)

    // woods: clumps where two slow waves agree, on dry land away from towns
    for (let i = 0; i < budget * 9 && spots.length < budget; i++) {
      const x = (r() - 0.5) * 104, z = (r() - 0.5) * 100
      const land = continent(x, z)
      if (land < 0.75) continue
      const wood = Math.sin(x * 0.19 + 1.3) * Math.cos(z * 0.16 - 0.4) + Math.sin(x * 0.06 - z * 0.085) * 0.7 + Math.sin(x * 0.41 + z * 0.37) * 0.25
      const dense = wood > 0.42
      // outside the woods, only the odd lone tree, bush or rock
      if (!dense && r() > 0.06) continue
      if (!clear(x, z, 1.4) || avoid(x, z)) continue
      const y = heightAt(x, z, hills)
      if (y < 0.35) continue
      const roll = r()
      const kind: Spot['kind'] = dense ? (roll < (x + z > 0 ? 0.55 : 0.3) ? 'pine' : roll < 0.88 ? 'broad' : 'bush') : roll < 0.45 ? 'bush' : roll < 0.75 ? 'rock' : 'broad'
      spots.push({ x, y: y - 0.04, z, s: (kind === 'rock' ? 0.5 : 0.75) + r() * 0.55, rot: r() * Math.PI * 2, kind })
    }
    // orchards and hedges on the lower terraces of grown worlds; rocks on the bare seeds
    for (const w of worlds) {
      const n = w.stage === 'seed' ? 3 : Math.round(w.hill.radius * 1.6)
      for (let i = 0; i < n * 3 && n > 0; i++) {
        const a = r() * Math.PI * 2, d = w.hill.radius * (0.78 + r() * 0.32)
        const x = w.hill.x + Math.cos(a) * d, z = w.hill.z + Math.sin(a) * d
        if (avoid(x, z)) continue
        const y = heightAt(x, z, hills)
        if (y < 0.35) continue
        const kind: Spot['kind'] = w.stage === 'seed' ? 'rock' : r() < 0.6 ? 'broad' : 'bush'
        spots.push({ x, y: y - 0.04, z, s: 0.55 + r() * 0.35, rot: r() * Math.PI * 2, kind })
      }
    }

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    const make = (geo: THREE.BufferGeometry, list: Spot[], colors: string[], swayK: number, tint: (s: Spot, i: number) => string, scaleY = 1) => {
      if (!list.length) return
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
      if (swayK > 0) sway(mat, swayK)
      const mesh = new THREE.InstancedMesh(geo, mat, list.length)
      const c = new THREE.Color()
      list.forEach((s, i) => {
        // a slight lean, as if the wind had a habit
        e.set((r() - 0.5) * 0.08, s.rot, (r() - 0.5) * 0.08)
        q.setFromEuler(e)
        m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.s, s.s * scaleY * (0.9 + (i % 5) * 0.05), s.s))
        mesh.setMatrixAt(i, m)
        c.set(tint(s, i) ?? colors[i % colors.length]).multiplyScalar(0.92 + ((i * 7919) % 13) / 100)
        mesh.setColorAt(i, c)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.instanceMatrix.needsUpdate = true
      this.meshes.push(mesh)
      this.group.add(mesh)
    }
    const broad = spots.filter((s) => s.kind === 'broad')
    const pine = spots.filter((s) => s.kind === 'pine')
    const bush = spots.filter((s) => s.kind === 'bush')
    const rock = spots.filter((s) => s.kind === 'rock')
    // a few broadleaves have turned
    make(crownGeo(), broad, GREENS, 0.035, (_, i) => (i % 17 === 3 ? AUTUMN[i % AUTUMN.length] : GREENS[(i * 3) % GREENS.length]))
    make(trunkGeo(1.0), broad, [BARK], 0.02, () => BARK)
    make(pineGeo(), pine, PINES, 0.025, (_, i) => PINES[i % PINES.length])
    make(trunkGeo(0.6), pine, [BARK], 0.01, () => BARK)
    make(bushGeo(), bush, GREENS, 0.02, (_, i) => GREENS[(i * 5 + 2) % GREENS.length])
    make(rockGeo(17), rock, ROCKS, 0, (_, i) => ROCKS[i % ROCKS.length])
  }

  setOpacity(o: number) {
    for (const mesh of this.meshes) {
      const mat = mesh.material as THREE.MeshLambertMaterial
      mat.opacity = o
      mat.transparent = o < 0.999
    }
    this.group.visible = o > 0.01
  }

  private clear() {
    for (const mesh of this.meshes) {
      this.group.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.meshes = []
  }

  dispose() {
    this.clear()
  }
}
