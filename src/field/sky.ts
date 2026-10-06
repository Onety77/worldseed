import * as THREE from 'three'

/*
  The sky over the Field and the light it gives.

  By day: a high soft sun from the north-west, warm, casting shadows from everything that
  stands on the land; a bright sky-blue fill from above and a green bounce from below.
  By night: the same direction becomes a cool moon, the fill drops to deep blue, and the
  windows and lamps carry the scene. The two crossfade, so switching is a dusk, not a cut.

  The sun's shadow follows the camera, tight around what you are looking at, so a
  close view of one world gets crisp shadows and the whole Atlas still gets some.
*/

const glsl = String.raw

const SKY = {
  day: { top: '#7fb9df', horizon: '#d9ecf2', sun: '#fff1d6', sunI: 2.15, skyLight: '#cfe6f5', groundLight: '#7e9a5a', hemiI: 1.15, fog: '#cfe3ea' },
  night: { top: '#08101f', horizon: '#20324f', sun: '#a9c4f2', sunI: 1.0, skyLight: '#48649c', groundLight: '#141c18', hemiI: 1.0, fog: '#172540' },
}

const domeVS = glsl`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  gl_Position = p.xyww;
}`
const domeFS = glsl`
uniform vec3 uTop, uHorizon;
varying vec3 vDir;
void main() {
  float y = clamp(vDir.y, 0., 1.);
  vec3 c = mix(uHorizon, uTop, pow(y, .55));
  gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`

const C = (hex: string) => new THREE.Color(hex)

export class Sky {
  readonly sun: THREE.DirectionalLight
  readonly hemi: THREE.HemisphereLight
  readonly dome: THREE.Mesh
  /** the direction light comes from (towards the sun), shared with the water's glints */
  readonly dir = new THREE.Vector3(-0.66, 0.62, -0.2).normalize()
  readonly fogColor = new THREE.Color()
  private domeU = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } }

  constructor(scene: THREE.Scene, shadowSize: number) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2)
    this.sun.castShadow = shadowSize > 0
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize)
      this.sun.shadow.bias = -0.0004
      this.sun.shadow.normalBias = 0.04
      this.sun.shadow.radius = 2.5
      const cam = this.sun.shadow.camera
      cam.near = 1
      cam.far = 420
    }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1)
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(800, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: domeVS, fragmentShader: domeFS, uniforms: this.domeU, side: THREE.BackSide, depthWrite: false, fog: false }),
    )
    this.dome.renderOrder = -1
    this.dome.frustumCulled = false
    scene.add(this.sun, this.sun.target, this.hemi, this.dome)
    this.setNight(0)
  }

  /** 0 day … 1 night */
  setNight(k: number) {
    const d = SKY.day, n = SKY.night
    const mix = (a: string, b: string, out: THREE.Color) => out.copy(C(a)).lerp(C(b), k)
    mix(d.sun, n.sun, this.sun.color)
    this.sun.intensity = d.sunI + (n.sunI - d.sunI) * k
    mix(d.skyLight, n.skyLight, this.hemi.color)
    mix(d.groundLight, n.groundLight, this.hemi.groundColor)
    this.hemi.intensity = d.hemiI + (n.hemiI - d.hemiI) * k
    mix(d.top, n.top, this.domeU.uTop.value)
    mix(d.horizon, n.horizon, this.domeU.uHorizon.value)
    mix(d.fog, n.fog, this.fogColor)
  }

  /** keep the shadow around what the camera is looking at, sized to how much is in view */
  follow(x: number, z: number, camDist: number, camPos: THREE.Vector3) {
    const extent = Math.min(110, Math.max(22, camDist * 0.62))
    const cam = this.sun.shadow.camera
    // snap to whole shadow texels as it moves, so shadow edges don't shimmer
    const texel = (extent * 2) / this.sun.shadow.mapSize.x
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel
    this.sun.target.position.set(sx, 0, sz)
    this.sun.position.set(sx + this.dir.x * 160, this.dir.y * 160, sz + this.dir.z * 160)
    if (cam.right !== extent) {
      cam.left = -extent
      cam.right = extent
      cam.top = extent
      cam.bottom = -extent
      cam.updateProjectionMatrix()
    }
    this.sun.target.updateMatrixWorld()
    this.dome.position.copy(camPos)
  }
}
