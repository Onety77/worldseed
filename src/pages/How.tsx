import { useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTitle } from '@/lib/useTitle'
import { eras, presets, profiles } from '@/lib/templates'
import { SOVEREIGNTY } from '@/lib/rules'
import { usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'
import { StageGlyph } from '@/components/ui/StageGlyph'
import { Split } from '@/components/charts/Split'
import { Loop, LOOP } from '@/components/world/GovernorLog'
import { FAILURE } from '@/components/world/CharterTab'

const loopText: Record<string, string> = {
  Observe: 'Reads the charter, the treasury, its apps and what holders said.',
  Propose: 'Writes a plan: the next deliverable, its cost and how it will be verified.',
  Simulate: 'Runs the change against forked chain state before anything is real.',
  Approve: 'The PolicyEngine checks caps and prohibitions; big changes wait for a vote.',
  Execute: 'Deploys from the template registry, funds jobs, pays grants.',
  'Publish proof': 'Ships an evidence bundle: inputs, model, cost and an onchain reference.',
  Evaluate: 'Measures the result against the milestone and starts again.',
}

const contracts = [
  ['WorldFactory', 'Creates a world: token link, treasury, registry entries'],
  ['WorldRegistry', 'Every world, its stage and its chain'],
  ['CharterRegistry', 'Charter hashes and every amendment'],
  ['WorldTreasury', 'Holds fees and pays only through policy'],
  ['PolicyEngine', 'Caps, prohibitions and timelocks on every action'],
  ['JobEscrow', 'Holds job payments until verified and unchallenged'],
  ['TemplateRegistry', 'Audited modules governors may deploy'],
  ['ObjectiveVerifier', 'Checks milestones against hard evidence'],
  ['GraduationController', 'Runs the sovereignty vote and the chain launch'],
  ['EmergencyExit', 'Recovery, re-election, takeover and wind-down'],
]

export function HowPage() {
  useTitle('How it works')
  useFieldView({ kind: 'backdrop' })
  const none = useCallback(() => null, [])
  useLabels(none, null, true)

  return (
    <Panel label="How it works" width="xl" rest={0.62}>
      <article className="px-5 pt-6 pb-12 lg:px-10 lg:pt-10">
        <p className="label">How it works</p>
        <h1 className="mt-2 max-w-[18ch] font-display text-h1">Every token gets a world. Every world gets an AI.</h1>
        <p className="mt-4 max-w-[60ch] text-[16px] text-ink-2">
          WORLDSEED is a launchpad on Robinhood Chain where a token is the start of something, not the whole of it. Each one gets a charter, a treasury and an AI governor that builds in public. Only the worlds that grow earn their own chain.
        </p>

        <Part n="1" title="Three stages, earned in order">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { s: 'seed' as const, name: 'Seed', text: 'A token on pons and a charter. The governor has 7 days of Genesis to deliver a first, usable product.' },
              { s: 'realm' as const, name: 'Realm', text: 'A working ecosystem inside the shared environment: apps, jobs, revenue and holders who steer it.' },
              { s: 'sovereign' as const, name: 'Sovereign', text: 'Its own Orbit L3, settling to Robinhood Chain, with its token as gas. Earned, never granted.' },
            ].map((x) => (
              <div key={x.s} className="rounded-[12px] bg-raised/80 p-4 ring-1 ring-line ring-inset">
                <StageGlyph stage={x.s} className="size-5" />
                <p className="mt-2 text-[15px] font-semibold">{x.name}</p>
                <p className="mt-1 text-[13px] text-ink-2">{x.text}</p>
              </div>
            ))}
          </div>
          <ol className="mt-3 grid gap-1.5 text-[13.5px]">
            {eras.map((e) => (
              <li key={e.id} className="grid grid-cols-[96px_1fr] gap-x-3 sm:grid-cols-[96px_112px_1fr]">
                <span className="font-semibold">{e.name}</span>
                <span className="font-mono text-[12px] text-ink-3">{e.days}</span>
                <span className="col-span-2 text-ink-2 sm:col-span-1">{e.blurb}</span>
              </li>
            ))}
          </ol>
        </Part>

        <Part n="2" title="Seeding a world sets six things">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Def term="Identity">Name, ticker and a line for the Atlas. The token launches on pons.</Def>
            <Def term="World type">One of {presets.length} templates: {presets.map((p) => p.short).join(', ')}.</Def>
            <Def term="Charter">The mission, milestones and what is never allowed. The Charter Compiler turns plain words into checkable milestones.</Def>
            <Def term="AI profile">{profiles.map((p) => `${p.name} (${usd(p.capUsd)} a day)`).join(', ')}. Approved models only, metered.</Def>
            <Def term="Treasury policy">How creator fees split between building, reserves and grants.</Def>
            <Def term="Genesis objectives">The first milestone and its budget. Seven days to prove it.</Def>
          </dl>
          <Link to="/seed" className={buttonClass('primary', 'md', 'mt-5')}>
            Seed a world <ArrowRight className="size-4" />
          </Link>
        </Part>

        <Part n="3" title="The governor loop">
          <div className="grid items-center gap-6 sm:grid-cols-[176px_1fr]">
            <Loop step="Publish proof" />
            <ol className="grid gap-2">
              {LOOP.map((s, i) => (
                <li key={s} className="grid grid-cols-[22px_110px_1fr] gap-2 text-[13.5px]">
                  <span className="font-mono text-[11px] text-ink-3">{i + 1}</span>
                  <span className="font-semibold">{s}</span>
                  <span className="text-ink-2">{loopText[s]}</span>
                </li>
              ))}
            </ol>
          </div>
        </Part>

        <Part n="4" title="Proof, and the right to challenge it">
          <p className="max-w-[62ch] text-[14.5px] text-ink-2">
            Every action ships as an evidence bundle: the charter version it acted under, the policy check, the model and its cost, a simulation result and an onchain reference. Anyone can post a bond against a bundle. If a verifier panel upholds the challenge, the bond returns with a reward and the payout is clawed back. If not, the bond goes to the challenge reserve.
          </p>
        </Part>

        <Part n="5" title="The treasury">
          <p className="mb-4 max-w-[62ch] text-[14.5px] text-ink-2">Creator fees from every trade fund the World Treasury. This is the starting split; holders can amend it.</p>
          <Split />
        </Part>

        <Part n="6" title="Earning a chain">
          <ul className="grid gap-1.5 text-[14px]">
            <li>· {SOVEREIGNTY.retained30d.toLocaleString()} retained users over 30 days</li>
            <li>· {usd(SOVEREIGNTY.revenue30dUsd)} of protocol revenue over 30 days</li>
            <li>· A published, independent security review</li>
            <li>· {SOVEREIGNTY.uptime90d}% uptime over 90 days</li>
            <li>· {SOVEREIGNTY.runwayMonths} months of chain costs in the infrastructure reserve</li>
          </ul>
          <p className="mt-3 max-w-[62ch] text-[14.5px] text-ink-2">Then holders vote, a timelock runs, and the GraduationController launches an Orbit L3. A paymaster lets the world's token pay for gas from day one.</p>
        </Part>

        <Part n="7" title="When things go wrong">
          <div className="grid gap-2 sm:grid-cols-2">
            {FAILURE.map((f) => (
              <div key={f.name} className="rounded-[12px] bg-raised/80 p-3.5 ring-1 ring-line ring-inset">
                <p className="text-[14px] font-semibold">{f.name}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{f.text}</p>
              </div>
            ))}
          </div>
        </Part>

        <Part n="8" title="The contracts">
          <dl className="grid gap-px overflow-hidden rounded-[12px] bg-line ring-1 ring-line sm:grid-cols-2">
            {contracts.map(([k, v]) => (
              <div key={k} className="bg-raised px-3.5 py-2.5">
                <dt className="font-mono text-[12.5px] font-medium">{k}</dt>
                <dd className="text-[12.5px] text-ink-3">{v}</dd>
              </div>
            ))}
          </dl>
        </Part>

        <div className="ink-card mt-12 rounded-[16px] p-6">
          <p className="font-display text-[26px] leading-tight font-[560] tracking-[-0.02em]">Only the worlds that grow earn their own chain.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/seed" className={buttonClass('primary', 'md')}>
              Seed a world <ArrowRight className="size-4" />
            </Link>
            <Link to="/" className={buttonClass('outline', 'md', 'bg-transparent text-paper ring-paper/30 hover-device:hover:bg-paper/10')}>
              Explore the Atlas
            </Link>
          </div>
        </div>
      </article>
    </Panel>
  )
}

function Part({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-12 border-t border-line pt-6">
      <p className="font-mono text-[11px] text-ink-3">{n.padStart(2, '0')}</p>
      <h2 className="mt-1 mb-4 text-h2">{title}</h2>
      {children}
    </section>
  )
}

function Def({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[14px] font-semibold">{term}</dt>
      <dd className="mt-0.5 text-[13px] text-ink-2">{children}</dd>
    </div>
  )
}
