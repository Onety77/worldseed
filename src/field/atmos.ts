import * as THREE from 'three'
import { rand } from './settlement'

/*
  The air above the Field: what makes it feel inhabited even when nothing is happening.

  - Clouds: a few soft, puffy ones, mostly out over the sea, drifting with the wind. They
    thin out as the camera comes close, so they never stand between you and a world.
  - Birds: small flocks wheeling slowly over the land, flapping now and then, gliding
    in between.
  - Smoke: thin puffs rising from town chimneys, drifting with the same wind.
*/

const WIND = new THREE.Vector2(1, 0.35).normalize()

function blobGeo(seed: number) {
  const r = rand(seed)
  const parts: THREE.BufferGeometry[] = []
  const n = 4 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const s = 1.4 + r() * 1.6
    // smooth, round puffs: normals point out from each puff's centre
    const g = new THREE.IcosahedronGeometry(s, 2)
    g.scale(1, 0.62, 1)
    g.translate((i - n / 2) * 1.6 + (r() - 0.5), r() * 0.6, (r() - 0.5) * 2)
    parts.push(g.toNonIndexed())
  }
  const total = parts.reduce((t, g) => t + g.getAttribute('position').count, 0)
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3)
  let o = 0
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o)
    nor.set(g.getAttribute('normal').array as Float32Array, o)
    o += g.getAttribute('position').count * 3
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return out
}

function birdGeo() {
  // a body and two wings; wings are raised and lowered in the vertex shader
  const g = new THREE.BufferGeometry()
  const v = [
    // left wing
    0, 0, 0, -0.05, 0, -0.42, 0.14, 0, -0.08,
    // right wing
    0, 0, 0, 0.14, 0, 0.08, -0.05, 0, 0.42,
    // body
    -0.18, 0, 0, 0.22, 0, 0.03, 0.22, 0, -0.03,
  ]
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

interface Flock {
  cx: number
  cz: number
  r: number
  y: number
  a: number
  speed: number
  n: number
}

export class Atmos {
  readonly group = new THREE.Group()
  private clouds: { mesh: THREE.Mesh; x: number; z: number; y: number; speed: number }[] = []
  private birds: THREE.InstancedMesh
  private flocks: Flock[] = []
  private smoke: THREE.InstancedMesh
  private puffs: { x: number; y: number; z: number; t: number; life: number; src: number }[] = []
  private chimneys: { x: number; y: number; z: number }[] = []
  private time = { value: 0 }
  private m = new THREE.Matrix4()

  constructor(budget: 'high' | 'low') {
    const r = rand(2207)
    // clouds
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e8eef2', emissiveIntensity: 0.35, transparent: true, opacity: 0.92, depthWrite: false })
    const nClouds = budget === 'high' ? 9 : 5
    for (let i = 0; i < nClouds; i++) {
      const a = r() * Math.PI * 2
      const d = 38 + r() * 46
      const mesh = new THREE.Mesh(blobGeo(31 + i * 7), cloudMat.clone())
      mesh.scale.setScalar(0.8 + r() * 0.6)
      mesh.rotation.y = r() * Math.PI
      this.group.add(mesh)
      this.clouds.push({ mesh, x: Math.cos(a) * d, z: Math.sin(a) * d, y: 17 + r() * 7, speed: 0.6 + r() * 0.5 })
    }
    // birds
    const birdMat = new THREE.MeshLambertMaterial({ color: '#3b3a36', side: THREE.DoubleSide })
    birdMat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.time
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * .7 + instanceMatrix[3].z * 1.3;
        // flap in bursts, glide in between
        float burst = smoothstep(.2, .8, sin(uT * .5 + ph));
        float flap = sin(uT * 11. + ph * 3.) * (.25 + .75 * burst);
        transformed.y += abs(position.z) * flap * .9;
        #endif`,
      )
    }
    const nFlocks = budget === 'high' ? 4 : 2
    let count = 0
    for (let i = 0; i < nFlocks; i++) {
      const n = 4 + Math.floor(r() * 4)
      this.flocks.push({ cx: (r() - 0.5) * 60, cz: (r() - 0.5) * 50, r: 10 + r() * 14, y: 8 + r() * 5, a: r() * Math.PI * 2, speed: (0.07 + r() * 0.05) * (i % 2 ? -1 : 1), n })
      count += n
    }
    this.birds = new THREE.InstancedMesh(birdGeo(), birdMat, count)
    this.birds.frustumCulled = false
    this.group.add(this.birds)
    // smoke
    const smokeMat = new THREE.MeshLambertMaterial({ color: '#eceae4', emissive: '#d8d6d0', emissiveIntensity: 0.3, transparent: true, opacity: 0.55, depthWrite: false })
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), smokeMat, budget === 'high' ? 90 : 40)
    this.smoke.frustumCulled = false
    this.group.add(this.smoke)
  }

  /** where smoke rises from: the tops of chimneys, collected from the towns */
  setChimneys(list: { x: number; y: number; z: number }[]) {
    // only some chimneys are lit at any time
    const r = rand(77)
    this.chimneys = list.filter(() => r() < 0.45)
    this.puffs = []
    const max = this.smoke.count
    for (let i = 0; i < max && this.chimneys.length; i++) {
      const src = i % this.chimneys.length
      this.puffs.push({ ...this.chimneys[src], t: (i * 0.37) % 1, life: 3 + r() * 2, src })
    }
  }

  /** advance clouds, birds and smoke; returns true (the air is always moving) */
  step(dt: number, t: number, camPos: THREE.Vector3, night: number) {
    this.time.value = t
    // clouds drift with the wind and wrap around; they thin out near the camera
    for (const c of this.clouds) {
      c.x += WIND.x * c.speed * dt
      c.z += WIND.y * c.speed * dt
      if (c.x > 95) c.x -= 190
      if (c.z > 95) c.z -= 190
      c.mesh.position.set(c.x, c.y, c.z)
      const near = camPos.distanceTo(c.mesh.position)
      const mat = c.mesh.material as THREE.MeshLambertMaterial
      mat.opacity = (0.9 * Math.min(1, Math.max(0, (near - 30) / 40))) * (1 - night * 0.55)
      c.mesh.visible = mat.opacity > 0.02
    }
    // birds wheel round their flock's centre, each a little out of step
    let k = 0
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3()
    for (const f of this.flocks) {
      f.a += f.speed * dt
      for (let i = 0; i < f.n; i++) {
        const a = f.a - i * 0.045 * Math.sign(f.speed)
        const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5
        const rr = f.r + off
        p.set(f.cx + Math.cos(a) * rr, f.y + Math.sin(t * 0.6 + i) * 0.4, f.cz + Math.sin(a) * rr)
        e.set(0, -a + (f.speed > 0 ? -Math.PI / 2 : Math.PI / 2), Math.sin(t + i) * 0.15)
        q.setFromEuler(e)
        this.m.compose(p, q, s.setScalar(0.9))
        this.birds.setMatrixAt(k++, this.m)
      }
    }
    this.birds.instanceMatrix.needsUpdate = true
    this.birds.visible = night < 0.7
    // smoke puffs rise, swell and fade, then start again at their chimney
    for (let i = 0; i < this.smoke.count; i++) {
      const pf = this.puffs[i]
      if (!pf) {
        this.m.makeScale(0, 0, 0)
        this.smoke.setMatrixAt(i, this.m)
        continue
      }
      pf.t += dt / pf.life
      if (pf.t >= 1) pf.t -= 1
      const c = this.chimneys[pf.src]
      const u = pf.t
      p.set(c.x + WIND.x * u * 1.6 + Math.sin(u * 6 + i) * 0.08, c.y + u * 2.2, c.z + WIND.y * u * 1.6)
      const sc = (0.5 + u * 1.6) * (1 - Math.pow(u, 3))
      this.m.compose(p, q.identity(), s.setScalar(sc))
      this.smoke.setMatrixAt(i, this.m)
    }
    this.smoke.instanceMatrix.needsUpdate = true
    ;(this.smoke.material as THREE.MeshLambertMaterial).opacity = 0.5 * (1 - night * 0.6)
    return true
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
  }
}
