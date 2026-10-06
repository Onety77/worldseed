import { useEffect, useRef, useState } from 'react'
import type { Evidence, World } from './types'
import { preset } from './templates'
import { useNow } from './clock'
import { publishProof } from './sim'

/*
  A world's governor, working while you watch. It walks the loop one step at a time, on
  one item of its plan; when it reaches "Publish proof" a bundle lands in the log and the
  Field pings. The plan and the details are written from the world's own template.
*/

export const STEPS: Evidence['step'][] = ['Observe', 'Propose', 'Simulate', 'Approve', 'Execute', 'Publish proof', 'Evaluate']
const STEP_MS = 3600

export function planFor(w: World) {
  const p = preset(w.template)
  if (w.stage === 'seed')
    return [`Deploy ${p.modules[0]} from the template registry`, `Fund a job: ${p.jobs[0].toLowerCase()}`, 'Publish the first weekly operations report']
  return [`Tune ${p.modules[0]} parameters against last week's usage`, `Review and pay the ${p.jobs[1].toLowerCase()} job`, `Ship ${p.modules[Math.min(2, p.modules.length - 1)]} upgrade behind a timelock`]
}

function detail(w: World, step: Evidence['step'], task: string, cycle: number) {
  const n = 2 + (cycle % 3)
  switch (step) {
    case 'Observe':
      return `Reading ${w.apps.length || 1} ${w.apps.length === 1 ? 'app' : 'apps'}, the treasury and ${8 + (cycle % 7)} new holder messages.`
    case 'Propose':
      return `Drafting the plan: ${task.charAt(0).toLowerCase() + task.slice(1)}.`
    case 'Simulate':
      return `Forked chain state: fees ${cycle % 2 ? '+' : '+'}${(1.2 + (cycle % 5) * 0.6).toFixed(1)}%, no solvency breach, ${(180 + (cycle % 9) * 37).toLocaleString()}k gas.`
    case 'Approve':
      return 'PolicyEngine: within the build budget cap and the charter. No vote needed.'
    case 'Execute':
      return `Submitting ${n} transactions to Robinhood Chain.`
    case 'Publish proof':
      return 'Bundling inputs, model, cost, simulation and onchain references.'
    case 'Evaluate':
      return `Measuring the result against the ${w.stage === 'seed' ? 'Genesis' : 'current'} milestone.`
  }
}

export function useGovernorLive(w: World) {
  const now = useNow()
  const [born] = useState(() => Date.now())
  const elapsed = Math.max(0, now - born)
  const cycle = Math.floor(elapsed / (STEP_MS * STEPS.length))
  const i = Math.floor(elapsed / STEP_MS) % STEPS.length
  const plan = planFor(w)
  const task = plan[cycle % plan.length]
  const role = i === 2 || i === 3 ? 'Security review' : i === 4 ? 'Coding' : 'Planning'
  const model = w.governor.roles.find((r) => r.role === role)?.model ?? w.governor.fallback

  // each completed loop publishes its proof, once
  const published = useRef(0)
  useEffect(() => {
    if (cycle > published.current) {
      published.current = cycle
      const done = plan[(cycle - 1) % plan.length]
      publishProof(w.id, done, model, done.startsWith('Deploy') || done.startsWith('Ship') ? 'deploy' : done.includes('job') ? 'job' : 'ops')
    }
  }, [cycle, plan, w.id, model])

  return {
    step: STEPS[i],
    index: i,
    task,
    taskIndex: cycle % plan.length,
    plan,
    detail: detail(w, STEPS[i], task, cycle),
    model,
    progress: (elapsed % STEP_MS) / STEP_MS,
    spent: w.treasury.modelSpentTodayUsd + cycle * 0.84 + i * 0.12,
  }
}
