import * as THREE from 'three'
import { HALF } from './ground'
import { heightAt, type Hill } from './height'
import { hillPath, rand } from './settlement'

/*
  What people have made of the ground itself, painted into one texture the terrain reads:
    red    roads and paths (dirt): between neighbouring worlds, and up each hill
    green  fields: strips of crops around the foot of grown worlds (the value is the
           direction the furrows run)
    blue   paved squares: each world's summit
  Painting once into a canvas is far cheaper than drawing any of it as geometry, and it
  lies exactly on the ground at every zoom.
*/

const SIZE = 1024
const px = (v: number) => ((v + HALF) / (HALF * 2)) * SIZE

export interface PaintWorld {
  id: string
  hill: Hill
  stage: 'seed' | 'realm' | 'sovereign'
}

export interface Road {
  a: string
  b: string
  pts: { x: number; y: number; z: number }[]
}

export class GroundPaint {
  readonly texture: THREE.CanvasTexture
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private key = ''
  /** footpaths up each hill, for the label layer and for walkers */
  paths = new Map<string, { x: number; z: number }[]>()

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.canvas.height = SIZE
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.NoColorSpace
    // canvas rows run with z, as the terrain samples them
    this.texture.flipY = false
    this.texture.minFilter = THREE.LinearMipmapLinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.anisotropy = 4
  }

  update(worlds: PaintWorld[], roads: Road[], hills: Hill[]) {
    const key = worlds.map((w) => `${w.id}:${w.stage}:${w.hill.radius.toFixed(1)}:${w.hill.tiers}`).join('|') + roads.length
    if (key === this.key) return
    this.key = key
    const c = this.ctx
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = '#000'
    c.fillRect(0, 0, SIZE, SIZE)
    c.globalCompositeOperation = 'lighter'
    c.lineCap = 'round'
    c.lineJoin = 'round'
    const r = rand(4411)

    // fields: bands of strips around the foot of each grown world, furrows set by the ground's slope
    for (const w of worlds) {
      if (w.stage === 'seed') continue
      const n = w.stage === 'sovereign' ? 5 : 7
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2
        const d = w.hill.radius * (1.18 + r() * 0.35)
        const x = w.hill.x + Math.cos(a) * d, z = w.hill.z + Math.sin(a) * d
        const y = heightAt(x, z, hills)
        // fields only on gentle dry land, not in the sea or a moat
        if (y < 0.5 || Math.abs(heightAt(x + 1, z, hills) - heightAt(x - 1, z, hills)) > 0.6) continue
        const L = 2.4 + r() * 2.4, W = 1.4 + r() * 1.4
        const rot = a + Math.PI / 2 + (r() - 0.5) * 0.5
        // furrow direction, stored in the green value
        const dir = 0.25 + ((((rot % Math.PI) + Math.PI) % Math.PI) / Math.PI) * 0.75
        c.save()
        c.translate(px(x), px(z))
        c.rotate(rot)
        c.fillStyle = `rgb(0, ${Math.round(dir * 255)}, 0)`
        const sx = (L / (HALF * 2)) * SIZE, sz = (W / (HALF * 2)) * SIZE
        c.fillRect(-sx / 2, -sz / 2, sx, sz)
        c.restore()
      }
    }

    // roads between worlds: a worn band of dirt with a softer edge
    const stroke = (pts: { x: number; z: number }[], width: number, value: number) => {
      if (pts.length < 2) return
      c.strokeStyle = `rgb(${value}, 0, 0)`
      c.lineWidth = (width / (HALF * 2)) * SIZE
      c.beginPath()
      c.moveTo(px(pts[0].x), px(pts[0].z))
      for (const p of pts.slice(1)) c.lineTo(px(p.x), px(p.z))
      c.stroke()
    }
    c.globalCompositeOperation = 'lighten'
    for (const road of roads) {
      stroke(road.pts, 1.5, 110)
      stroke(road.pts, 0.85, 255)
    }

    // a footpath climbing each world in a loose spiral, from the foot to the summit square
    this.paths.clear()
    for (const w of worlds) {
      const pts = hillPath(w.id, w.hill, w.stage === 'seed')
      this.paths.set(w.id, pts)
      stroke(pts, w.stage === 'seed' ? 0.5 : 0.7, 210)
      // a road around the foot of every grown world, where the roads from its neighbours arrive
      if (w.stage !== 'seed') {
        const ring = Array.from({ length: 65 }, (_, i) => {
          const a = (i / 64) * Math.PI * 2
          const d = w.hill.radius * 1.12 * (1 + 0.1 * Math.sin(a * 3 + w.hill.x) + 0.06 * Math.sin(a * 5 + w.hill.z * 0.7))
          return { x: w.hill.x + Math.cos(a) * d, z: w.hill.z + Math.sin(a) * d }
        }).filter((p) => heightAt(p.x, p.z, hills) > 0.25)
        // draw it in pieces, so it breaks where the ring would run into water
        let run: { x: number; z: number }[] = []
        for (const p of ring) {
          if (run.length && Math.hypot(p.x - run[run.length - 1].x, p.z - run[run.length - 1].z) > 1.5) {
            stroke(run, 0.75, 200)
            run = []
          }
          run.push(p)
        }
        stroke(run, 0.75, 200)
      }
      // the summit square, paved
      if (w.stage !== 'seed') {
        c.fillStyle = 'rgb(0, 0, 255)'
        c.beginPath()
        c.arc(px(w.hill.x), px(w.hill.z), (w.hill.radius * 0.12 * SIZE) / (HALF * 2), 0, Math.PI * 2)
        c.fill()
      }
    }
    this.texture.needsUpdate = true
  }

  dispose() {
    this.texture.dispose()
  }
}
