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
  // storms over worlds in trouble: a dark cloud and falling rain
  private storms: { mesh: THREE.Mesh; x: number; z: number; y: number; k: number; goal: number }[] = []
  private stormGeo = blobGeo(911)
  private rain: THREE.InstancedMesh
  private drops: { s: number; x: number; z: number; t: number }[] = []
  // sparks: proofs rise green from a summit; a chain earned sets off fireworks
  private sparks: THREE.InstancedMesh
  private sparkList: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; c: THREE.Color }[] = []

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
    // rain
    const rainMat = new THREE.MeshBasicMaterial({ color: '#c9d6de', transparent: true, opacity: 0.55, depthWrite: false })
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), rainMat, 160)
    this.rain.frustumCulled = false
    this.group.add(this.rain)
    // sparks glow by themselves, day or night
    const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false })
    this.sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), sparkMat, 220)
    this.sparks.frustumCulled = false
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3)
    this.group.add(this.sparks)
  }

  /** worlds in trouble get a storm: k from 0 (none) to 1 (a missed milestone) */
  setStorms(list: { id: string; x: number; z: number; r: number; k: number }[]) {
    const want = list.filter((s) => s.k > 0.5)
    // keep existing clouds where they are; fade out the ones no longer needed
    for (const st of this.storms) st.goal = want.some((w) => Math.hypot(w.x - st.x, w.z - st.z) < 0.5) ? 1 : 0
    for (const w of want) {
      if (this.storms.some((st) => Math.hypot(w.x - st.x, w.z - st.z) < 0.5)) continue
      const mesh = new THREE.Mesh(this.stormGeo, new THREE.MeshLambertMaterial({ color: '#6b737a', emissive: '#3a4046', emissiveIntensity: 0.4, transparent: true, opacity: 0, depthWrite: false }))
      mesh.scale.set(w.r * 0.2, 0.55, w.r * 0.2)
      this.group.add(mesh)
      // low over the town, so it reads as its own weather from any angle
      this.storms.push({ mesh, x: w.x, z: w.z, y: 6.5 + w.r * 0.25, k: 0, goal: 1 })
    }
  }

  /** a burst of sparks at a point: 'proof' rises green, 'bad' falls red, 'big' is a firework */
  burst(x: number, y: number, z: number, kind: 'proof' | 'bad' | 'big') {
    const colors = kind === 'big' ? ['#c4ef3a', '#ffd76a', '#ffffff', '#7fd3ff'] : kind === 'bad' ? ['#ff7a5a', '#d2553a'] : ['#c4ef3a', '#e6ff9a']
    const n = kind === 'big' ? 46 : 16
    const h = kind === 'big' ? y + 7 + Math.random() * 3 : y + 0.6
    for (let i = 0; i < n; i++) {
      if (this.sparkList.length >= this.sparks.count) this.sparkList.shift()
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI
      const sp = kind === 'big' ? 3 + Math.random() * 2.5 : 0.6 + Math.random() * 0.8
      this.sparkList.push({
        x: x + (kind === 'big' ? 0 : (Math.random() - 0.5) * 1.2),
        y: h,
        z: z + (kind === 'big' ? 0 : (Math.random() - 0.5) * 1.2),
        vx: kind === 'big' ? Math.cos(a) * Math.sin(e) * sp : Math.cos(a) * 0.25,
        vy: kind === 'big' ? Math.cos(e) * sp : kind === 'bad' ? -0.4 : sp * 1.6,
        vz: kind === 'big' ? Math.sin(a) * Math.sin(e) * sp : Math.sin(a) * 0.25,
        t: 0,
        life: kind === 'big' ? 1.6 + Math.random() * 0.8 : 1.2 + Math.random() * 0.6,
        c: new THREE.Color(colors[i % colors.length]),
      })
    }
  }

  /** anything short-lived still running (sparks), so the engine keeps drawing */
  busy() {
    return this.sparkList.length > 0 || this.storms.some((s) => Math.abs(s.k - s.goal) > 0.01)
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

    // storms gather and clear slowly; rain falls under the ones that are here
    for (const st of this.storms) {
      st.k += (st.goal - st.k) * Math.min(1, dt * 0.6)
      st.mesh.position.set(st.x + Math.sin(t * 0.2) * 0.6, st.y, st.z + Math.cos(t * 0.17) * 0.6)
      ;(st.mesh.material as THREE.MeshLambertMaterial).opacity = st.k * 0.93
      st.mesh.visible = st.k > 0.01
    }
    this.storms = this.storms.filter((st) => {
      if (st.goal === 0 && st.k < 0.01) {
        this.group.remove(st.mesh)
        ;(st.mesh.material as THREE.Material).dispose()
        return false
      }
      return true
    })
    const live = this.storms.filter((st) => st.k > 0.2)
    if (this.drops.length !== this.rain.count) this.drops = Array.from({ length: this.rain.count }, (_, i) => ({ s: i, x: Math.random() - 0.5, z: Math.random() - 0.5, t: Math.random() }))
    for (let i = 0; i < this.rain.count; i++) {
      const st = live[i % Math.max(1, live.length)]
      const d = this.drops[i]
      if (!st) {
        this.m.makeScale(0, 0, 0)
        this.rain.setMatrixAt(i, this.m)
        continue
      }
      d.t += dt * 0.9
      if (d.t > 1) {
        d.t -= 1
        d.x = Math.random() - 0.5
        d.z = Math.random() - 0.5
      }
      const span = st.mesh.scale.x * 4.5
      p.set(st.mesh.position.x + d.x * span, st.y - 0.5 - d.t * (st.y - 0.5), st.mesh.position.z + d.z * span)
      this.m.compose(p, q.identity(), s.setScalar(st.k))
      this.rain.setMatrixAt(i, this.m)
    }
    this.rain.instanceMatrix.needsUpdate = true
    this.rain.visible = live.length > 0

    // sparks fly, slow, fall and fade
    this.sparkList = this.sparkList.filter((sp) => (sp.t += dt / sp.life) < 1)
    const col = new THREE.Color()
    for (let i = 0; i < this.sparks.count; i++) {
      const sp = this.sparkList[i]
      if (!sp) {
        this.m.makeScale(0, 0, 0)
        this.sparks.setMatrixAt(i, this.m)
        continue
      }
      const drag = Math.pow(0.35, dt)
      sp.vx *= drag
      sp.vz *= drag
      sp.vy = sp.vy * drag - 1.6 * dt
      sp.x += sp.vx * dt
      sp.y += sp.vy * dt
      sp.z += sp.vz * dt
      p.set(sp.x, sp.y, sp.z)
      this.m.compose(p, q.identity(), s.setScalar((1 - sp.t) * (1.1 - sp.t * 0.4)))
      this.sparks.setMatrixAt(i, this.m)
      col.copy(sp.c).multiplyScalar(1.6)
      this.sparks.setColorAt(i, col)
    }
    this.sparks.instanceMatrix.needsUpdate = true
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true
    this.sparks.visible = this.sparkList.length > 0
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
