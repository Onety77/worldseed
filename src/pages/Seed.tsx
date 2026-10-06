import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, MapPin, Shuffle } from 'lucide-react'
import type { World } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useMedia } from '@/lib/useMedia'
import { useTitle } from '@/lib/useTitle'
import { plant, useWorlds } from '@/lib/sim'
import { preset, profiles } from '@/lib/templates'
import { hash, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { EASE_OUT, SPRING_UI } from '@/lib/motion'
import { blank, draft, draftHash, toWorld, POLICIES, type Draft } from '@/lib/draft'
import { continent } from '@/field/height'
import { listToken } from '@/lib/market'
import { notify } from '@/lib/inbox'
import { hillFor } from '@/field/fromWorld'
import { draftHill, useCover, useField, useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { Identity, WorldType, CharterStep, GovernorStep, TreasuryStep, ObjectivesStep, Preview } from '@/components/seed/Steps'
import { Split } from '@/components/charts/Split'

const steps = [
  { id: 'identity', name: 'Identity', title: 'Name the world', note: 'A name, a ticker and one line people will see on the Atlas.' },
  { id: 'world', name: 'World', title: 'Choose what kind of world', note: 'The template sets its modules, job categories and starting milestones.' },
  { id: 'charter', name: 'Charter', title: 'Write the charter', note: 'The mission, any custom milestone and what the governor may never do.' },
  { id: 'governor', name: 'Governor', title: 'Pick the AI profile', note: 'Which approved models run each role, and the daily compute cap.' },
  { id: 'treasury', name: 'Treasury', title: 'Set the treasury policy', note: 'How creator fees split across building, reserves and grants.' },
  { id: 'objectives', name: 'Objectives', title: 'Check the milestones', note: 'Three eras, each with hard verification. Adjust the Genesis budget.' },
  { id: 'review', name: 'Review', title: 'Review and plant', note: 'This charter is hashed and stored onchain the moment you plant.' },
] as const

const valid = (d: Draft, i: number) => {
  if (i === 0) return d.name.trim().length >= 2 && d.ticker.length >= 2
  if (i === 1) return d.template !== null
  if (i === 2) return d.mission.trim().length >= 12
  return true
}

/** Open ground on the continent, away from every world, spread out. */
function usePlots(worlds: World[]) {
  return useMemo(() => {
    const free: { x: number; z: number }[] = []
    for (let x = -36; x <= 36; x += 2)
      for (let z = -32; z <= 34; z += 2) {
        if (continent(x, z) < 1.2) continue
        if (worlds.some((w) => Math.hypot(w.x - x, w.z - z) < hillFor(w).radius + 6.5)) continue
        free.push({ x, z })
      }
    // farthest-point picks, so each "survey another plot" moves somewhere new
    const out: { x: number; z: number }[] = []
    if (free.length) out.push(free.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b)))
    while (out.length < Math.min(6, free.length)) {
      let best = free[0]
      let bd = -1
      for (const f of free) {
        const d = Math.min(...out.map((o) => Math.hypot(o.x - f.x, o.z - f.z)))
        if (d > bd) {
          bd = d
          best = f
        }
      }
      out.push(best)
    }
    return out.length ? out : [{ x: 0, z: 0 }]
    // plots are surveyed once per visit to the page
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [worlds.length])
}

export function SeedPage() {
  useTitle('Seed a world')
  const d = draft.use()
  const worlds = useWorlds()
  const plots = usePlots(worlds)
  const plot = plots[d.plot % plots.length]
  const [step, setStep] = useState(0)
  const [planting, setPlanting] = useState(false)
  const nav = useNavigate()
  const engine = useField()
  const wide = useMedia('(min-width: 1024px)')
  const roomy = useMedia('(min-width: 1280px)')
  const top = useRef<HTMLDivElement>(null)

  useFieldView({ kind: 'plot', x: plot.x, z: plot.z }, 'draft')
  const none = useCallback(() => null, [])
  useLabels(none, null, true)

  // the plot on the Field: a survey stake that rises as the charter fills in
  const done = steps.filter((_, i) => i < step && valid(d, i)).length
  useEffect(() => {
    draftHill.set({ id: 'draft', x: plot.x, z: plot.z, radius: 3.6, height: planting ? 2.2 : 0.35 + done * 0.16 })
  }, [plot.x, plot.z, done, planting])
  useEffect(() => () => draftHill.set(null), [])

  const go = (i: number) => {
    setStep(i)
    top.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const canNext = valid(d, step)
  const s = steps[step]

  const doPlant = () => {
    if (planting) return
    setPlanting(true)
    window.setTimeout(
      () => {
        const w = toWorld(d, plot, worlds.map((x) => x.id))
        engine?.adopt('draft', w.id)
        listToken(w.id, w.priceUsd)
        plant(w)
        notify({ kind: 'planted', title: `${w.name} is planted`, body: `Charter stored, ${w.ticker} trading on its pons curve, governor started on Genesis.`, worldId: w.id, href: `/w/${w.id}` })
        draftHill.set(null)
        draft.set(blank)
        nav(`/w/${w.id}`, { state: { planted: true } })
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400,
    )
  }

  return (
    <>
      {roomy && <LiveCharter d={d} />}
      <Panel label="Seed a world" width="lg" rest={0.56}>
        <div ref={top} className="sticky top-0 z-[6] border-b border-line bg-panel/95 px-5 pt-4 pb-3 backdrop-blur-md docked:top-0 lg:top-0 lg:px-6 lg:pt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="label">
              Seed a world · step {step + 1} of {steps.length}
            </p>
            <button onClick={() => draft.set((x) => ({ ...x, plot: x.plot + 1 }))} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2 hover-device:hover:text-ink">
              <Shuffle className="size-3.5" /> Survey another plot
            </button>
          </div>
          <ol className="mt-3 flex gap-1" aria-label="Steps">
            {steps.map((x, i) => {
              const reachable = i <= step || steps.slice(0, i).every((_, k) => valid(d, k))
              return (
                <li key={x.id} className="flex-1">
                  <button
                    onClick={() => reachable && go(i)}
                    disabled={!reachable}
                    aria-current={i === step ? 'step' : undefined}
                    aria-label={`${i + 1}. ${x.name}${i < step && valid(d, i) ? ', done' : ''}`}
                    className="group block w-full text-left disabled:cursor-not-allowed"
                  >
                    <span className="relative block h-1 overflow-hidden rounded-full bg-ink/[0.1]">
                      {i < step && <span className="absolute inset-0 bg-ink" />}
                      {i === step && <m.span layoutId="seed-step" transition={SPRING_UI} className="absolute inset-0 bg-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.3)]" />}
                    </span>
                    <span className={cn('mt-1.5 hidden truncate text-[11.5px] font-medium sm:block', i === step ? 'text-ink' : 'text-ink-3 group-enabled:group-hover:text-ink')}>{x.name}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <m.div key={step} className="px-5 pt-5 pb-6 lg:px-6" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
            <h1 className="text-h2">{s.title}</h1>
            <p className="mt-1 mb-5 text-[13.5px] text-ink-2">{s.note}</p>
            {step === 0 && <Identity d={d} />}
            {step === 1 && <WorldType d={d} />}
            {step === 2 && <CharterStep d={d} />}
            {step === 3 && <GovernorStep d={d} />}
            {step === 4 && <TreasuryStep d={d} />}
            {step === 5 && <ObjectivesStep d={d} />}
            {step === 6 && <Review d={d} plot={plot} />}
          </m.div>
        </AnimatePresence>

        <div className="sticky bottom-0 z-[6] flex items-center justify-between gap-3 border-t border-line bg-panel/95 px-5 py-3 backdrop-blur-md lg:px-6">
          <button onClick={() => (step ? go(step - 1) : nav(-1))} className={buttonClass('ghost', 'md', '-ml-2')}>
            <ArrowLeft className="size-4" /> {step ? 'Back' : 'Cancel'}
          </button>
          {step < steps.length - 1 ? (
            <button onClick={() => go(step + 1)} disabled={!canNext} className={buttonClass('ink', 'md')}>
              Next: {steps[step + 1].name} <ArrowRight className="size-4" />
            </button>
          ) : (
            <button onClick={doPlant} disabled={planting || !steps.slice(0, 6).every((_, i) => valid(d, i))} className={buttonClass('primary', 'md', 'min-w-[160px]')}>
              {planting ? (
                <>
                  <span className="breathe size-2 rounded-full bg-ink" /> Planting…
                </>
              ) : (
                <>
                  Plant {d.name || 'world'} <Check className="size-4" />
                </>
              )}
            </button>
          )}
        </div>
        {!wide && <div className="h-[env(safe-area-inset-bottom,0px)]" />}
      </Panel>
    </>
  )
}

/** The last step: the whole charter as it will be stored, with its hash. */
function Review({ d, plot }: { d: Draft; plot: { x: number; z: number } }) {
  const p = d.template ? preset(d.template) : null
  const prof = profiles.find((x) => x.id === d.profile)!
  return (
    <div className="grid gap-4">
      <Preview d={d} />
      <div className="rounded-[12px] bg-ink px-3.5 py-3 text-paper">
        <p className="label text-paper/65">Charter hash</p>
        <p className="mt-1 font-mono text-[12.5px] break-all">{draftHash(d)}</p>
      </div>
      <Doc d={d} />
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] bg-line ring-1 ring-line">
        {[
          ['World type', p?.name ?? '—'],
          ['Governor', `${prof.name} · ${usd(prof.capUsd)}/day`],
          ['Treasury policy', POLICIES[d.policy].name],
          ['Plot', `${plot.x}, ${plot.z} on the Field`],
        ].map(([k, v]) => (
          <div key={k} className="bg-raised px-3.5 py-3">
            <dt className="label">{k}</dt>
            <dd className="mt-1 text-[14px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        Planting launches {d.ticker || 'the token'} on pons, stores this charter in the CharterRegistry, and starts the governor on its Genesis era: 7 days to prove the first milestone.
      </p>
    </div>
  )
}

/** The charter as a document. Used live beside the composer and in the review step. */
function Doc({ d, compact = false }: { d: Draft; compact?: boolean }) {
  const p = d.template ? preset(d.template) : null
  return (
    <article className={cn('rounded-[12px] bg-raised ring-1 ring-line', compact ? 'p-4' : 'p-4')}>
      <p className="label">Charter of {d.name || '…'}</p>
      <p className={cn('mt-2 font-display leading-snug tracking-[-0.01em]', compact ? 'text-[16px]' : 'text-[18px]')}>{d.mission || <span className="text-ink-3">The mission goes here.</span>}</p>
      <h2 className="label mt-4">Milestones</h2>
      <ol className="mt-1.5 grid gap-1.5 text-[13px]">
        {p ? (
          <>
            <li>
              <span className="text-ink-3">Genesis · </span>
              {p.objectives.genesis.title}
            </li>
            <li>
              <span className="text-ink-3">Growth · </span>
              {p.objectives.growth.title}
            </li>
            <li>
              <span className="text-ink-3">Sovereignty · </span>
              {p.objectives.sovereignty.title}
            </li>
            {d.compiled && (
              <li className="text-green">
                <span>Custom · </span>
                {d.compiled.deliverable}
              </li>
            )}
          </>
        ) : (
          <li className="text-ink-3">Choose a world type.</li>
        )}
      </ol>
      <h2 className="label mt-4">Never allowed</h2>
      <ul className="mt-1.5 grid gap-1 text-[13px] text-ink-2">
        {d.prohibited.map((x) => (
          <li key={x}>· {x}</li>
        ))}
      </ul>
      {!compact && (
        <>
          <h2 className="label mt-4">Fees</h2>
          <Split shares={[...POLICIES[d.policy].shares]} className="mt-2" />
        </>
      )}
    </article>
  )
}

/** On roomy screens, the charter writes itself beside the composer as you go. */
function LiveCharter({ d }: { d: Draft }) {
  const ref = useRef<HTMLDivElement>(null)
  useCover(ref, 'bottom')
  return (
    <m.aside
      ref={ref}
      aria-label="Charter so far"
      className="sheet fixed bottom-3 left-[288px] z-[5] flex max-h-[44vh] w-[340px] flex-col overflow-hidden rounded-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.1 }}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-[13px] font-semibold">Charter so far</p>
        <p className="font-mono text-[10.5px] text-ink-3">{hash(draftHash(d), 6, 4)}</p>
      </div>
      <div tabIndex={0} aria-label="Charter so far, scrollable" className="no-scrollbar overflow-y-auto p-2 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset">
        <Doc d={d} compact />
      </div>
    </m.aside>
  )
}
