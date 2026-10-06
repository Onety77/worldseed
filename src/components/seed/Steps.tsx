import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Check, Lock, Minus, Plus, Sparkles, X } from 'lucide-react'
import type { Profile, Template } from '@/lib/types'
import { cn } from '@/lib/cn'
import { presets, profiles, preset, eras } from '@/lib/templates'
import { usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { EASE_OUT } from '@/lib/motion'
import { draft, tickerFrom, compile, POLICIES, DEFAULT_PROHIBITED, type Draft, type Policy } from '@/lib/draft'
import { Split } from '@/components/charts/Split'
import { WorldMark } from '@/components/ui/WorldMark'
import { StageTag } from '@/components/ui/bits'

const set = (patch: Partial<Draft>) => draft.set((d) => ({ ...d, ...patch }))

const inputClass = 'w-full rounded-control bg-raised px-3.5 py-2.5 text-[15px] ring-1 ring-line-2 ring-inset outline-none transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-ink'

function Field({ label, hint, children, count }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; count?: string }) {
  const id = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13.5px] font-semibold">
          {label}
        </label>
        {count && <span className="font-mono text-[11px] text-ink-3">{count}</span>}
      </div>
      <div className="mt-1.5">{children(id)}</div>
      {hint && <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  )
}

// ── 1. Identity ──
export function Identity({ d }: { d: Draft }) {
  const [tickerTouched, setTouched] = useState(Boolean(d.ticker) && d.ticker !== tickerFrom(d.name))
  return (
    <div className="grid gap-5">
      <Field label="Name" count={`${d.name.length}/24`}>
        {(id) => <input id={id} className={inputClass} value={d.name} maxLength={24} placeholder="Saltmarsh" autoComplete="off" onChange={(e) => set({ name: e.target.value, ticker: tickerTouched ? d.ticker : tickerFrom(e.target.value) })} />}
      </Field>
      <Field label="Ticker" hint="2 to 6 letters. The token launches on pons; its creator fees fund the World Treasury from the first trade.">
        {(id) => (
          <input
            id={id}
            className={cn(inputClass, 'font-mono tracking-wider uppercase')}
            value={d.ticker}
            maxLength={6}
            placeholder="SALT"
            autoComplete="off"
            onChange={(e) => {
              setTouched(true)
              set({ ticker: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
            }}
          />
        )}
      </Field>
      <Field label="One line about it" count={`${d.lore.length}/90`} hint="Optional. Shown on the Atlas and the world's page.">
        {(id) => <input id={id} className={inputClass} value={d.lore} maxLength={90} placeholder="A marsh town where fishers sell their catch before it lands." onChange={(e) => set({ lore: e.target.value })} />}
      </Field>
      <Preview d={d} />
    </div>
  )
}

export function Preview({ d }: { d: Draft }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-paper/70 p-3 ring-1 ring-line ring-inset">
      <WorldMark world={{ id: d.name || 'draft', stage: 'seed', charter: { objectives: [], mission: '', prohibited: [], versions: [] } }} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{d.name || 'Your world'}</p>
        <p className="font-mono text-[11px] tracking-wide text-ink-3">{d.ticker || 'TICKER'}</p>
      </div>
      <StageTag stage="seed" />
    </div>
  )
}

// ── 2. World type ──
export function WorldType({ d }: { d: Draft }) {
  return (
    <div role="radiogroup" aria-label="World type" className="grid gap-2 sm:grid-cols-2">
      {presets.map((p) => {
        const on = d.template === p.id
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={on}
            onClick={() => set({ template: p.id as Template, compiled: null })}
            className={cn('relative rounded-[12px] p-3.5 text-left transition-[box-shadow,background-color]', on ? 'bg-raised shadow-[0_0_0_2px_var(--ink)]' : 'bg-raised/60 ring-1 ring-line ring-inset hover-device:hover:bg-raised')}
          >
            <span className={cn('absolute top-3 right-3 grid size-5 place-items-center rounded-full transition-colors', on ? 'bg-sprout text-on-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.25)]' : 'ring-1 ring-line-2')}>{on && <Check className="size-3" strokeWidth={3} />}</span>
            <span className="block pr-7 text-[15px] font-semibold">{p.name}</span>
            <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">{p.pitch}</span>
            <span className="mt-2.5 flex flex-wrap gap-1">
              {p.modules.slice(0, 3).map((m) => (
                <span key={m} className="rounded-[6px] bg-ink/[0.05] px-1.5 py-0.5 text-[11px] text-ink-2">
                  {m}
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── 3. Charter ──
const examples: Record<Template, string> = {
  defi: 'Launch a savings pool with 300 retained users and $5k of monthly fee revenue within 30 days, with an $8k budget.',
  agents: 'Run a bounty board where agents complete 100 paid data-cleaning jobs within 3 weeks, $6k budget.',
  game: 'Ship a playable tactics demo and keep 200 players coming back weekly within 21 days.',
  creator: 'Open a co-op storefront where 50 makers earn their first paid sale within 14 days, $5k budget.',
  prediction: 'Publish a research desk that resolves 40 markets against named sources within 30 days.',
  frontier: 'Build an open map of local repair shops with 500 retained users and publish it within 30 days, $9k budget.',
}

export function CharterStep({ d }: { d: Draft }) {
  const t = d.template ?? 'frontier'
  const [busy, setBusy] = useState(false)
  const [extra, setExtra] = useState('')
  const run = () => {
    if (!d.custom.trim()) return
    setBusy(true)
    set({ compiled: null })
    window.setTimeout(() => {
      set({ compiled: compile(d.custom, t) })
      setBusy(false)
    }, 650)
  }
  return (
    <div className="grid gap-6">
      <Field label="Mission" count={`${d.mission.length}/240`} hint="What this world is for, in a sentence or two. It goes into the charter word for word.">
        {(id) => <textarea id={id} rows={3} className={cn(inputClass, 'resize-none leading-relaxed')} value={d.mission} maxLength={240} placeholder={`e.g. ${preset(t).pitch}`} onChange={(e) => set({ mission: e.target.value })} />}
      </Field>

      <div className="rounded-[14px] bg-paper/70 p-4 ring-1 ring-line ring-inset">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-green" />
          <h2 className="text-[14.5px] font-semibold">Charter Compiler</h2>
          <span className="text-[12px] text-ink-3">optional</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-2">Describe a milestone in your own words. The compiler turns it into something the ObjectiveVerifier can check: deliverable, verification, deadline, budget, limits.</p>
        <textarea rows={3} aria-label="Describe a custom milestone" className={cn(inputClass, 'mt-3 resize-none text-[14px] leading-relaxed')} value={d.custom} maxLength={300} placeholder={examples[t]} onChange={(e) => set({ custom: e.target.value })} />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => set({ custom: examples[t], compiled: null })} className="text-[12.5px] font-semibold text-ink-2 underline decoration-ink-4 underline-offset-4 hover-device:hover:text-ink">
            Use an example
          </button>
          <button onClick={run} disabled={!d.custom.trim() || busy} className={buttonClass('ink', 'sm')}>
            {busy ? 'Compiling…' : d.compiled ? 'Compile again' : 'Compile'}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {(busy || d.compiled) && (
            <m.div key="out" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE_OUT }} className="overflow-hidden">
              <Compiled d={d} busy={busy} />
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <fieldset>
        <legend className="text-[13.5px] font-semibold">Never allowed</legend>
        <p className="mt-0.5 text-[12.5px] text-ink-3">The PolicyEngine blocks these. Two can't be switched off.</p>
        <div className="mt-2 grid gap-1">
          {[...DEFAULT_PROHIBITED, ...d.prohibited.filter((p) => !DEFAULT_PROHIBITED.includes(p))].map((p) => {
            const locked = p === DEFAULT_PROHIBITED[0] || p === DEFAULT_PROHIBITED[2]
            const on = d.prohibited.includes(p)
            return (
              <label key={p} className={cn('flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-[13.5px]', locked ? 'text-ink-2' : 'cursor-pointer hover-device:hover:bg-hover')}>
                <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={on} disabled={locked} onChange={() => set({ prohibited: on ? d.prohibited.filter((x) => x !== p) : [...d.prohibited, p] })} />
                <span className="flex-1">{p}</span>
                {locked && <Lock className="size-3.5 text-ink-3" aria-label="Always on" />}
              </label>
            )
          })}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = extra.trim()
            if (v && !d.prohibited.includes(v)) set({ prohibited: [...d.prohibited, v] })
            setExtra('')
          }}
        >
          <input aria-label="Add a prohibited action" className={cn(inputClass, 'py-2 text-[14px]')} value={extra} maxLength={80} placeholder="Add one, e.g. Mint new tokens" onChange={(e) => setExtra(e.target.value)} />
          <button type="submit" className={buttonClass('outline', 'md')} disabled={!extra.trim()}>
            Add
          </button>
        </form>
      </fieldset>
    </div>
  )
}

/** "You wrote" against "Compiled": the compiler's output, appearing line by line. */
function Compiled({ d, busy }: { d: Draft; busy: boolean }) {
  const c = d.compiled
  const rows: [string, ReactNode][] = c
    ? [
        ['Deliverable', c.deliverable],
        ['Verified by', <ul key="v" className="grid gap-1">{c.verification.map((v) => <li key={v}>{v}</li>)}</ul>],
        ['Deadline', `${c.deadlineDays} days from launch`],
        ['Budget', usd(c.budgetUsd)],
        ['May', <ul key="a" className="grid gap-1">{c.allowed.map((v) => <li key={v}>{v}</li>)}</ul>],
        ['May not', <ul key="p" className="grid gap-1">{c.prohibited.map((v) => <li key={v}>{v}</li>)}</ul>],
        ['If missed', c.failure],
      ]
    : []
  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4">
      <div>
        <p className="label">You wrote</p>
        <p className="mt-1 text-[13.5px] text-ink-2">“{d.custom}”</p>
      </div>
      <div>
        <p className="label flex items-center gap-2">
          Compiled
          {busy && <span className="breathe size-1.5 rounded-full bg-green" />}
        </p>
        {busy ? (
          <div className="mt-2 grid gap-2" aria-live="polite" aria-label="Compiling">
            {[0.9, 0.7, 0.5].map((w, i) => (
              <span key={i} className="breathe block h-3 rounded-full bg-ink/[0.08]" style={{ width: `${w * 100}%`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        ) : (
          <dl className="mt-2 grid gap-px overflow-hidden rounded-[10px] bg-line ring-1 ring-line">
            {rows.map(([k, v], i) => (
              <m.div key={k} className="grid grid-cols-[88px_1fr] gap-3 bg-raised px-3 py-2 text-[13px]" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.05, ease: EASE_OUT }}>
                <dt className="text-ink-3">{k}</dt>
                <dd>{v}</dd>
              </m.div>
            ))}
          </dl>
        )}
        {c && c.notes.length > 0 && (
          <ul className="mt-2 grid gap-1">
            {c.notes.map((n) => (
              <li key={n} className="text-[12px] text-ink-3">
                · {n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── 4. Governor ──
export function GovernorStep({ d }: { d: Draft }) {
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="AI profile" className="grid gap-2">
        {profiles.map((p) => {
          const on = d.profile === p.id
          return (
            <button key={p.id} role="radio" aria-checked={on} onClick={() => set({ profile: p.id as Profile })} className={cn('rounded-[12px] p-3.5 text-left transition-[box-shadow,background-color]', on ? 'bg-raised shadow-[0_0_0_2px_var(--ink)]' : 'bg-raised/60 ring-1 ring-line ring-inset hover-device:hover:bg-raised')}>
              <span className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">{p.name}</span>
                <span className="font-mono text-[12px] text-ink-2">{usd(p.capUsd)}/day cap</span>
              </span>
              <span className="mt-1 block text-[12.5px] text-ink-2">{p.blurb}</span>
              <span className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(p.roles).map(([role, model]) => (
                  <span key={role} className="flex justify-between gap-2 text-[11.5px]">
                    <span className="text-ink-3">{role}</span>
                    <span className="truncate font-mono">{model}</span>
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[12.5px] text-ink-3">Approved providers only. Every call is metered against the daily cap; holders can change the profile with a vote.</p>
    </div>
  )
}

// ── 5. Treasury ──
export function TreasuryStep({ d }: { d: Draft }) {
  return (
    <div className="grid gap-5">
      <div role="radiogroup" aria-label="Treasury policy" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(POLICIES) as Policy[]).map((k) => {
          const p = POLICIES[k]
          const on = d.policy === k
          return (
            <button key={k} role="radio" aria-checked={on} onClick={() => set({ policy: k })} className={cn('rounded-[12px] p-3 text-left transition-[box-shadow,background-color]', on ? 'bg-raised shadow-[0_0_0_2px_var(--ink)]' : 'bg-raised/60 ring-1 ring-line ring-inset hover-device:hover:bg-raised')}>
              <span className="block text-[14.5px] font-semibold">{p.name}</span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-2">{p.note}</span>
            </button>
          )
        })}
      </div>
      <Split shares={[...POLICIES[d.policy].shares]} />
      <p className="text-[12.5px] text-ink-3">The protocol fee and the challenge reserve are the same for every world.</p>
    </div>
  )
}

// ── 6. Objectives ──
export function ObjectivesStep({ d }: { d: Draft }) {
  const p = preset(d.template ?? 'frontier')
  const budget = d.genesisBudget ?? p.objectives.genesis.budgetUsd
  const nudge = (k: number) => set({ genesisBudget: Math.min(15_000, Math.max(2000, budget + k)) })
  return (
    <div className="grid gap-2">
      {eras.map((e, i) => {
        const o = p.objectives[e.id]
        return (
          <div key={e.id} className={cn('rounded-[12px] p-3.5 ring-1 ring-line ring-inset', i === 0 ? 'bg-raised' : 'bg-raised/50')}>
            <p className="label flex justify-between">
              <span>
                {e.name} · {e.days}
              </span>
              {i > 0 && <span>Locked until {eras[i - 1].name} passes</span>}
            </p>
            <p className="mt-1.5 text-[14.5px] leading-snug font-semibold">{o.title}</p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              <span className="text-ink-3">Verified by </span>
              {o.verify}
            </p>
            {i === 0 ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-ink-3">Genesis budget</span>
                <div className="flex items-center gap-1">
                  <button aria-label="Lower the budget" onClick={() => nudge(-500)} className={buttonClass('outline', 'sm', 'size-8 px-0')}>
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-20 text-center font-mono text-[13px] tabular" aria-live="polite">
                    {usd(budget)}
                  </span>
                  <button aria-label="Raise the budget" onClick={() => nudge(500)} className={buttonClass('outline', 'sm', 'size-8 px-0')}>
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 font-mono text-[11.5px] text-ink-3">Budget {usd(o.budgetUsd)}</p>
            )}
          </div>
        )
      })}
      {d.compiled ? (
        <div className="rounded-[12px] bg-sprout-soft p-3.5 ring-1 ring-green/30 ring-inset">
          <p className="label">Custom · compiled · {d.compiled.deadlineDays} days</p>
          <p className="mt-1.5 text-[14.5px] leading-snug font-semibold">{d.compiled.deliverable}</p>
          <p className="mt-1 text-[12.5px] text-ink-2">{d.compiled.verification.join('; ')}</p>
        </div>
      ) : (
        <p className="flex items-center gap-2 px-1 pt-1 text-[12.5px] text-ink-3">
          <X className="size-3.5" /> No custom milestone. Add one with the Charter Compiler.
        </p>
      )}
    </div>
  )
}
