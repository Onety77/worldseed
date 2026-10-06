import { useCallback, useState } from 'react'
import type { World } from '@/lib/types'
import { useTitle } from '@/lib/useTitle'
import { useWorlds } from '@/lib/sim'
import { useChallenges, useProposals } from '@/lib/civic'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { Segmented } from '@/components/ui/bits'
import { ProposalCard } from '@/components/civic/ProposalCard'
import { ChallengeCard } from '@/components/civic/ChallengeCard'
import { Empty } from '@/components/ui/bits'

export function GovernanceLens() {
  useTitle('Governance')
  useFieldView({ kind: 'atlas' })
  const proposals = useProposals()
  const challenges = useChallenges().filter((c) => c.status === 'open')
  const detail = useCallback(
    (w: World) => {
      const c = challenges.filter((x) => x.worldId === w.id).length
      const p = proposals.filter((x) => x.worldId === w.id).length
      if (c) return { text: `${c} challenged`, tone: 'red' as const }
      return p ? { text: `${p} ${p === 1 ? 'vote' : 'votes'}` } : null
    },
    [challenges, proposals],
  )
  useLabels(detail)
  const worlds = useWorlds()
  const [tab, setTab] = useState<'votes' | 'challenges'>('votes')
  const find = (id: string) => worlds.find((w) => w.id === id)

  return (
    <Panel label="Governance" rest={0.5}>
      <PanelHead>
        <h1 className="text-h2">Governance</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">Holders steer every world. Large changes need a vote and a timelock; anyone can bond a challenge against a governor's proof.</p>
        <Segmented
          className="mt-4"
          label="Show"
          layoutId="gov-tab"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'votes', name: <>Votes <span className="font-mono text-[10.5px] text-ink-3">{proposals.length}</span></> },
            { id: 'challenges', name: <>Challenges <span className="font-mono text-[10.5px] text-ink-3">{challenges.length}</span></> },
          ]}
        />
      </PanelHead>
      <ul className="grid gap-2 px-4 pt-4 pb-8 lg:px-5">
        {tab === 'votes'
          ? [...proposals].sort((a, b) => a.endsAt - b.endsAt).map((p) => <ProposalCard key={p.id} p={p} world={find(p.worldId)} />)
          : challenges.map((c) => <ChallengeCard key={c.id} c={c} world={find(c.worldId)} />)}
        {!(tab === 'votes' ? proposals : challenges).length && (
          <li>
            <Empty title={tab === 'votes' ? 'No votes open' : 'Nothing challenged'}>{tab === 'votes' ? 'Every governor is working inside its charter.' : 'Open any proof in a governor log to challenge it.'}</Empty>
          </li>
        )}
      </ul>
    </Panel>
  )
}
