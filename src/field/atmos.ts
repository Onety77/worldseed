import * as THREE from 'three'
import { rand } from './settlement'

/*
  The air above the Field: what makes it feel inhabited even when nothing is happening.

  - Birds: small flocks wheeling slowly over the land, flapping now and then, gliding
    in between.
  - Smoke: thin puffs rising from town chimneys, drifting with the same wind.
*/

const WIND = new THREE.Vector2(1, 0.35).normalize()

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
  private birds: THREE.InstancedMesh
  private flocks: Flock[] = []
  private smoke: THREE.InstancedMesh
  private puffs: { x: number; y: number; z: number; t: number; life: number; src: number }[] = []
  private chimneys: { x: number; y: number; z: number }[] = []
  private time = { value: 0 }
  private m = new THREE.Matrix4()
  // sparks: proofs rise green from a summit; a chain earned sets off fireworks
  private sparks: THREE.InstancedMesh
  private sparkList: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; c: THREE.Color; dust?: boolean }[] = []

  constructor(budget: 'high' | 'low') {
    const r = rand(2207)
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
    // sparks glow by themselves, day or night
    const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false })
    this.sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), sparkMat, 220)
    this.sparks.frustumCulled = false
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3)
    this.group.add(this.sparks)
  }

  /** a burst of sparks at a point: 'proof' rises green, 'bad' falls red, 'big' is a firework */
  burst(x: number, y: number, z: number, kind: 'proof' | 'bad' | 'big' | 'dust') {
    if (kind === 'dust') {
      // dust and grit: thrown out, then drifting down; earth-coloured, not glowing
      for (let i = 0; i < 14; i++) {
        if (this.sparkList.length >= this.sparks.count) this.sparkList.shift()
        const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.1
        this.sparkList.push({ x: x + (Math.random() - 0.5) * 0.8, y, z: z + (Math.random() - 0.5) * 0.8, vx: Math.cos(a) * sp, vy: 0.6 + Math.random() * 1.4, vz: Math.sin(a) * sp, t: 0, life: 1.4 + Math.random() * 1, c: new THREE.Color(['#b8a68a', '#9a8a70', '#7d6f5c'][i % 3]), dust: true })
      }
      return
    }
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
    return this.sparkList.length > 0
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

  /** advance birds, smoke and sparks; returns true (the air is always moving) */
  step(dt: number, t: number, night: number) {
    this.time.value = t
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
      // sparks glow; dust only shows what light there is
      col.copy(sp.c).multiplyScalar(sp.dust ? 1 - night * 0.7 : 1.6)
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
