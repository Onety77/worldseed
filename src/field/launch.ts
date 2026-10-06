import * as THREE from 'three'
import type { Template } from '@/lib/types'
import { continent, heightAt, hillAt, type Hill } from './height'
import { Builder, box, cylinder, footing, type Shared } from './kit'
import { rand, seedOf } from './settlement'

/*
  What a world leaves behind when it earns its own chain and lifts off to become a planet.

  - The launch site: the small island that is left, still bridged to the mainland, with a
    concrete pad where the world stood, scorched ground around it, a beacon tower, fuel
    tanks and two sheds, and a soft beam of light pointing up at the planet it became.
  - The chunk: the world itself, torn free. Its top is the land as it was (photographed
    from straight above a moment before) with its real town riding on it; underneath is
    raw rock, tapering to a point, the way a lifted island would look.
*/

const glsl = String.raw

/** the island a launch site stands on, for a world that stood on this hill */
export function siteOf(h: Hill): Hill {
  // standing a little above the sea, however deep the water is there
  return { x: h.x, z: h.z, radius: Math.max(5.6, h.radius * 0.72), height: 0.75 - Math.min(0, continent(h.x, h.z)) * 1.8, tiers: 1, moat: 1 }
}

// ── the beam ──

const beamVS = glsl`
varying float vY;
varying float vEdge;
void main() {
  vY = uv.y;
  vec3 n = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  // soft at the sides: bright where the beam faces you, fading where it turns away
  vEdge = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`
const beamFS = glsl`
uniform vec3 uColor;
uniform float uK;
varying float vY;
varying float vEdge;
void main() {
  float a = pow(1. - vY, 2.2) * pow(vEdge, 2.) * uK;
  gl_FragColor = vec4(uColor * a, 1.);
  #include <colorspace_fragment>
}`

export interface Site {
  /** the pad, tower, tanks and sheds (rises like any building) */
  group: THREE.Group
  /** the light pointing up at the planet, and the burnt ground round the pad */
  beam: THREE.Mesh
  scorch: THREE.Mesh
  /** where the beacon's lamp is, for a label or a ping */
  top: THREE.Vector3
}

export function buildSite(id: string, template: Template, hill: Hill, hills: Hill[], shared: Shared): Site {
  const r = rand(seedOf(id + ':site'))
  const g = (x: number, z: number) => heightAt(x, z, hills)
  const b = new Builder(r, template)
  b.lit = 0.9
  const cx = hill.x, cz = hill.z
  const y0 = g(cx, cz)
  // the way home, toward the middle of the continent (the bridge runs this way too)
  const len = Math.hypot(cx, cz) || 1
  const home = Math.atan2(-cz / len, -cx / len)

  // the pad: a wide concrete disc, with its markings
  b.at(y0 - 0.06)
  const top = cylinder(b, { x: cx, z: cz, rot: 0 }, y0 - 0.06, 2.1, 0.16, 28, 'trim')
  const ring = (rad: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
      b.edge([cx + Math.cos(a0) * rad, top + 0.004, cz + Math.sin(a0) * rad], [cx + Math.cos(a1) * rad, top + 0.004, cz + Math.sin(a1) * rad])
    }
  }
  ring(1.35, 32)
  ring(0.55, 16)
  for (const a of [0, Math.PI / 2]) b.edge([cx + Math.cos(a) * 1.35, top + 0.004, cz + Math.sin(a) * 1.35], [cx - Math.cos(a) * 1.35, top + 0.004, cz - Math.sin(a) * 1.35])
  // the cradle the world sat in: four low posts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    box(b, { x: cx + Math.cos(a) * 1.0, z: cz + Math.sin(a) * 1.0, rot: a }, top, 0.09, 0.09, 0.32, { roof: 'trim', windows: false })
  }

  // the beacon tower, at the edge of the pad, away from the bridge
  const ta = home + Math.PI * 0.75
  const tx = cx + Math.cos(ta) * 2.55, tz = cz + Math.sin(ta) * 2.55
  const ty = footing(g, { x: tx, z: tz, rot: ta }, 0.3, 0.3)
  b.at(ty)
  const H = 3.4
  for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(b, { x: tx + i * 0.22, z: tz + k * 0.22, rot: 0 }, ty, 0.035, 0.035, H, { roof: 'trim', windows: false, edges: false })
  // cross braces up the faces
  for (let y = ty + 0.3; y < ty + H - 0.4; y += 0.6)
    for (const [a, c] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      b.edge([tx + a[0] * 0.22, y, tz + a[1] * 0.22], [tx + c[0] * 0.22, y + 0.6, tz + c[1] * 0.22])
      b.edge([tx + c[0] * 0.22, y, tz + c[1] * 0.22], [tx + a[0] * 0.22, y + 0.6, tz + a[1] * 0.22])
    }
  const deck = box(b, { x: tx, z: tz, rot: 0 }, ty + H, 0.34, 0.34, 0.08, { roof: 'trim', windows: false })
  // the lamp: glass that glows, under a small cap
  const k = 0.16
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2
    const p0 = [tx + Math.cos(a0) * k, deck, tz + Math.sin(a0) * k], p1 = [tx + Math.cos(a1) * k, deck, tz + Math.sin(a1) * k]
    b.tri(p0, p1, [p1[0], deck + 0.3, p1[2]], 'lamp', 1)
    b.tri(p0, [p1[0], deck + 0.3, p1[2]], [p0[0], deck + 0.3, p0[2]], 'lamp', 1)
  }
  cylinder(b, { x: tx, z: tz, rot: 0 }, deck + 0.3, 0.2, 0.06, 8, 'roof')
  // a gantry arm reaching over the pad
  const ax = Math.cos(ta + Math.PI), az = Math.sin(ta + Math.PI)
  box(b, { x: tx + ax * 0.75, z: tz + az * 0.75, rot: ta }, ty + H * 0.62, 0.55, 0.05, 0.07, { roof: 'trim', windows: false })

  // fuel tanks and two sheds, round the far side
  for (let i = 0; i < 2; i++) {
    const a = home + Math.PI * (1.15 + i * 0.16)
    const x = cx + Math.cos(a) * 3.0, z = cz + Math.sin(a) * 3.0
    const y = footing(g, { x, z, rot: 0 }, 0.4, 0.4)
    b.at(y)
    const t = cylinder(b, { x, z, rot: 0 }, y, 0.36, 0.85, 12, 'wall')
    cylinder(b, { x, z, rot: 0 }, t, 0.22, 0.06, 10, 'trim')
  }
  for (let i = 0; i < 2; i++) {
    const a = home + Math.PI * (0.38 + i * 0.2)
    const x = cx + Math.cos(a) * 3.05, z = cz + Math.sin(a) * 3.05
    const f = { x, z, rot: a + Math.PI / 2 }
    const y = footing(g, f, 0.5, 0.32)
    b.at(y)
    box(b, f, y, 0.5, 0.32, 0.42, { roof: 'roof' })
  }
  const group = b.build(shared)

  // the beam, from the pad's centre straight up
  const geo = new THREE.CylinderGeometry(0.75, 0.32, 34, 24, 1, true).translate(0, 17, 0)
  const beam = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ vertexShader: beamVS, fragmentShader: beamFS, uniforms: { uColor: { value: new THREE.Color('#d6ff6a') }, uK: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  beam.position.set(cx, top, cz)
  beam.renderOrder = 3
  beam.frustumCulled = false

  // scorched ground: a soft dark ring following the land round the pad
  const sc = scorchTexture(r)
  const N = 40, M = 6, R = 4.2
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let j = 0; j <= M; j++)
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, d = (j / M) * R
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      pos.push(x, g(x, z) + 0.035, z)
      uv.push(0.5 + (Math.cos(a) * d) / (2 * R), 0.5 + (Math.sin(a) * d) / (2 * R))
    }
  for (let j = 0; j < M; j++)
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, c = a + N + 1
      idx.push(a, c, a + 1, a + 1, c, c + 1)
    }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  sg.setIndex(idx)
  const scorch = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: sc, color: '#1d1a17', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  scorch.renderOrder = 1

  return { group, beam, scorch, top: new THREE.Vector3(tx, deck + 0.3, tz) }
}

function scorchTexture(r: () => number) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  // dark at the pad's edge, fading out in streaks
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.32, 'rgba(255,255,255,.75)')
  g.addColorStop(0.6, 'rgba(255,255,255,.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 256, 256)
  x.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, d = 50 + r() * 70
    x.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.4})`
    x.beginPath()
    x.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + r() * 14, 2 + r() * 5, a, 0, Math.PI * 2)
    x.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** set how much of the site shows: the scorch with the pad, the beam brighter after dark */
export function lookSite(s: Site, k: number, night: number) {
  ;(s.scorch.material as THREE.MeshBasicMaterial).opacity = k * 0.55
  s.scorch.visible = k > 0.01
  ;(s.beam.material as THREE.ShaderMaterial).uniforms.uK.value = k * (0.012 + night * 0.2)
  s.beam.visible = k > 0.01
}

export function disposeSite(s: Site) {
  for (const m of [s.beam, s.scorch]) {
    m.geometry.dispose()
    const mat = m.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.dispose()
  }
}

// ── the chunk that lifts off ──

export interface Chunk {
  /** lifts and sways about the world's centre */
  pivot: THREE.Group
  /** holds the land and whatever stood on it, in field coordinates */
  inner: THREE.Group
  /** the land's top, for fading */
  top: THREE.Mesh
  under: THREE.Mesh
  /** how far down the rock reaches, for dust falling from it */
  depth: number
}

/**
 * The world's hill as a solid piece: the land on top, textured with a photograph of it
 * taken from straight above (`map`, covering x±half, z±half round the hill), and rock below.
 */
export function buildChunk(hill: Hill, hills: Hill[], map: THREE.Texture, half: number): Chunk {
  const cx = hill.x, cz = hill.z
  const A = 72, RINGS = 14
  // where the hill meets the plain (or its shore), all the way round
  const floor = Math.max(0.12, hill.height * 0.025)
  const edge: number[] = []
  for (let i = 0; i < A; i++) {
    const a = (i / A) * Math.PI * 2
    let rr = hill.radius * 0.5
    while (rr < hill.radius * 1.3 && hillAt(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, hill) > floor) rr += 0.08
    edge.push(Math.min(hill.radius * 1.2, Math.max(hill.radius * 0.7, rr)))
  }
  // smooth it a little so the rim isn't jagged
  const rim = edge.map((_, i) => (edge[(i + A - 1) % A] + edge[i] * 2 + edge[(i + 1) % A]) / 4)

  // the top: rings out from the centre, each point on the land as it is now
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const at = (x: number, z: number) => {
    pos.push(x, heightAt(x, z, hills), z)
    uv.push((x - cx + half) / (2 * half), (half - (z - cz)) / (2 * half))
  }
  at(cx, cz)
  for (let j = 1; j <= RINGS; j++)
    for (let i = 0; i < A; i++) {
      const a = (i / A) * Math.PI * 2, d = rim[i] * (j / RINGS)
      at(cx + Math.cos(a) * d, cz + Math.sin(a) * d)
    }
  const v = (j: number, i: number) => (j === 0 ? 0 : 1 + (j - 1) * A + (i % A))
  for (let i = 0; i < A; i++) idx.push(0, v(1, i + 1), v(1, i))
  for (let j = 1; j < RINGS; j++)
    for (let i = 0; i < A; i++) {
      idx.push(v(j, i), v(j, i + 1), v(j + 1, i + 1))
      idx.push(v(j, i), v(j + 1, i + 1), v(j + 1, i))
    }
  const tg = new THREE.BufferGeometry()
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  tg.setIndex(idx)
  // the photograph already carries its light and shade
  const top = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, transparent: true }))

  // the underside: raw rock, soil just under the rim, tapering to a jagged point
  const r = rand(seedOf(`${cx},${cz}`))
  const rimY = (i: number) => pos[(1 + (RINGS - 1) * A + i) * 3 + 1]
  const depth = hill.radius * 1.05 + hill.height * 0.3
  const LAY = 5
  const up: number[] = [], col: number[] = [], ui: number[] = []
  const soil = new THREE.Color('#8f7556'), rock = new THREE.Color('#857a6d'), deep = new THREE.Color('#5d554d')
  const c = new THREE.Color()
  for (let k = 0; k <= LAY; k++)
    for (let i = 0; i < A; i++) {
      const a = (i / A) * Math.PI * 2
      const t = k / LAY
      // narrowing as it goes down, with knuckles of rock
      const shrink = Math.pow(1 - t, 0.75) * (k === 0 ? 1 : 0.86 + r() * 0.2)
      const d = rim[i] * shrink
      const y = k === 0 ? rimY(i) - 0.02 : rimY(i) * (1 - t) - depth * Math.pow(t, 1.25) * (0.9 + r() * 0.2) - 0.25
      up.push(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d)
      c.copy(k <= 1 ? soil : rock).lerp(deep, t).multiplyScalar(0.85 + r() * 0.25)
      col.push(c.r, c.g, c.b)
    }
  const tip = up.length / 3
  up.push(cx + (r() - 0.5), rimY(0) - depth * 1.12, cz + (r() - 0.5))
  col.push(deep.r * 0.8, deep.g * 0.8, deep.b * 0.8)
  for (let k = 0; k < LAY; k++)
    for (let i = 0; i < A; i++) {
      const a = k * A + i, b2 = k * A + ((i + 1) % A), cc = (k + 1) * A + i, d = (k + 1) * A + ((i + 1) % A)
      ui.push(a, b2, d, a, d, cc)
    }
  for (let i = 0; i < A; i++) ui.push(LAY * A + i, LAY * A + ((i + 1) % A), tip)
  const ug = new THREE.BufferGeometry()
  ug.setAttribute('position', new THREE.Float32BufferAttribute(up, 3))
  ug.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  ug.setIndex(ui)
  const flat = ug.toNonIndexed()
  ug.dispose()
  flat.computeVertexNormals()
  const under = new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, transparent: true, emissive: '#2b2520' }))
  under.castShadow = true

  const inner = new THREE.Group()
  inner.position.set(-cx, 0, -cz)
  inner.add(top, under)
  const pivot = new THREE.Group()
  pivot.position.set(cx, 0, cz)
  pivot.add(inner)
  return { pivot, inner, top, under, depth }
}

export function disposeChunk(ch: Chunk) {
  for (const m of [ch.top, ch.under]) {
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }
}
