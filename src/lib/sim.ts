import { useSyncExternalStore } from 'react'
import type { Evidence, World } from './types'
import { worlds as sampleWorlds, loadedAt, hex } from '@/data/worlds'
import { evidence as sampleEvidence, makeEvidence } from '@/data/activity'
import { seeded } from './seeded'

/*
  The live world. Every few seconds one governor publishes an evidence bundle (a ping on
  the Field). Harrow's infrastructure runway climbs as its revenue lands; when it crosses
  twelve months its holders' sovereignty vote clears, and it graduates into its own chain
  while you watch. Swap this module for an indexer feed.
*/

export const HARROW_GRADUATES_AT = loadedAt + 190_000
const HARROW_START = 412_000
const HARROW_END = 430_000

interface Ping {
  id: string
  worldId: string
  at: number
}

interface State {
  worlds: World[]
  evidence: Evidence[]
  pings: Ping[]
  graduated: { worldId: string; at: number }[]
}

let state: State = { worlds: sampleWorlds, evidence: sampleEvidence, pings: [], graduated: [] }
const subs = new Set<() => void>()
let timer: number | undefined
let n = 0
const rand = seeded('live')

const set = (next: State) => {
  state = next
  subs.forEach((f) => f())
}

function harrow(now: number, s: State): State {
  const w = s.worlds.find((x) => x.id === 'harrow')
  if (!w || w.stage === 'sovereign') return s
  const k = Math.min(1, (now - loadedAt) / (HARROW_GRADUATES_AT - loadedAt - 15_000))
  let next: World = { ...w, treasury: { ...w.treasury, balanceUsd: HARROW_START + (HARROW_END - HARROW_START) * k } }
  let ev = s.evidence
  let grad = s.graduated
  if (now >= HARROW_GRADUATES_AT) {
    next = {
      ...next,
      stage: 'sovereign',
      chain: { chainId: 724_150, launchedAt: now },
      charter: { ...next.charter, objectives: next.charter.objectives.map((o) => ({ ...o, status: 'passed' })) },
    }
    ev = [
      { id: `harrow-grad-${now}`, worldId: 'harrow', at: now, kind: 'proposal', title: 'Sovereignty timelock cleared. Orbit L3 launched; HRW is now native gas', model: 'Meridian M', costUsd: 0, ref: hex(rand, 64), verdict: 'passed', step: 'Publish proof' },
      ...ev,
    ]
    grad = [...grad, { worldId: 'harrow', at: now }]
  }
  const pings = grad.length > s.graduated.length ? [...s.pings, { id: `harrow-grad-${now}`, worldId: 'harrow', at: now }] : s.pings
  return { ...s, worlds: s.worlds.map((x) => (x.id === 'harrow' ? next : x)), evidence: ev, graduated: grad, pings }
}

function tick() {
  if (document.hidden) return
  const now = Date.now()
  // a governor somewhere publishes a proof; busier worlds publish more often
  const pool = state.worlds.flatMap((w) => Array(w.stage === 'seed' ? 1 : w.stage === 'realm' ? 2 : 3).fill(w) as World[])
  const w = pool[Math.floor(rand() * pool.length)]
  const e = { ...makeEvidence(w, rand, now, ++n), verdict: rand() > 0.9 ? 'pending' : 'passed' } as Evidence
  let s: State = {
    ...state,
    evidence: [e, ...state.evidence].slice(0, 400),
    pings: [...state.pings.filter((p) => now - p.at < 6000), { id: e.id, worldId: w.id, at: now }],
  }
  s = harrow(now, s)
  set(s)
}

function subscribe(cb: () => void) {
  subs.add(cb)
  if (timer === undefined) {
    const loop = () => {
      tick()
      timer = window.setTimeout(loop, 2600 + Math.random() * 2600)
    }
    timer = window.setTimeout(loop, 1800)
  }
  return () => {
    subs.delete(cb)
    if (!subs.size && timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
  }
}

const use = <T,>(pick: (s: State) => T) => useSyncExternalStore(subscribe, () => pick(state))

export const useWorlds = () => use((s) => s.worlds)
export const useWorld = (id?: string) => use((s) => s.worlds.find((w) => w.id === id))
export const useEvidence = () => use((s) => s.evidence)
export const usePings = () => use((s) => s.pings)
export const useGraduations = () => use((s) => s.graduated)
export const getState = () => state

/** A governor finished a loop: its proof lands in the log and pings the Field. */
export function publishProof(worldId: string, title: string, model: string, kind: Evidence['kind'] = 'deploy') {
  const now = Date.now()
  const e: Evidence = { id: `${worldId}-live-${now}`, worldId, at: now, kind, title, model, costUsd: Math.round((0.2 + Math.random() * 3) * 100) / 100, ref: hex(rand, 64), verdict: 'pending', step: 'Publish proof' }
  set({ ...state, evidence: [e, ...state.evidence].slice(0, 400), pings: [...state.pings.filter((p) => now - p.at < 6000), { id: e.id, worldId, at: now }] })
}

export function plant(w: World) {
  const now = Date.now()
  const first: Evidence = {
    id: `${w.id}-genesis`,
    worldId: w.id,
    at: now,
    kind: 'proposal',
    title: `Charter v1 accepted and stored; Genesis era opened for ${w.ticker}`,
    model: w.governor.roles[0].model,
    costUsd: 0.04,
    ref: w.charter.versions[0].hash,
    verdict: 'passed',
    step: 'Publish proof',
  }
  set({ ...state, worlds: [...state.worlds, w], evidence: [first, ...state.evidence], pings: [...state.pings, { id: `plant-${w.id}`, worldId: w.id, at: now }] })
}
