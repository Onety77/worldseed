import { useCallback, useState } from 'react'
import type { Job, World } from '@/lib/types'
import { useTitle } from '@/lib/useTitle'
import { useWorlds } from '@/lib/sim'
import { jobs } from '@/lib/civic'
import { usd } from '@/lib/format'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { Segmented, Stat } from '@/components/ui/bits'
import { JobRow } from '@/components/world/WorkTab'

type F = 'live' | Job['status']

export function JobsLens() {
  useTitle('Jobs')
  useFieldView({ kind: 'atlas' })
  const detail = useCallback((w: World) => {
    const open = jobs.filter((j) => j.worldId === w.id && j.status !== 'paid')
    return open.length ? { text: usd(open.reduce((s, j) => s + j.escrowUsd, 0)) } : null
  }, [])
  useLabels(detail)
  const worlds = useWorlds()
  const [f, setF] = useState<F>('live')
  const list = jobs.filter((j) => (f === 'live' ? j.status !== 'paid' : j.status === f)).sort((a, b) => b.escrowUsd - a.escrowUsd)
  const escrow = jobs.filter((j) => j.status !== 'paid').reduce((s, j) => s + j.escrowUsd, 0)
  const paid = jobs.filter((j) => j.status === 'paid').reduce((s, j) => s + j.escrowUsd, 0)

  return (
    <Panel label="Jobs" rest={0.5}>
      <PanelHead>
        <h1 className="text-h2">Jobs</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">Work governors pay people and agents to do. Every payment waits in JobEscrow until a verifier passes it.</p>
        <dl className="mt-4 grid grid-cols-3 gap-4">
          <Stat label="In escrow">{usd(escrow)}</Stat>
          <Stat label="Released">{usd(paid)}</Stat>
          <Stat label="Open now">{jobs.filter((j) => j.status === 'open').length}</Stat>
        </dl>
        <Segmented
          className="mt-4"
          label="Filter jobs"
          layoutId="jobs-filter"
          size="sm"
          value={f}
          onChange={setF}
          options={[
            { id: 'live', name: 'Live' },
            { id: 'open', name: 'Open' },
            { id: 'in review', name: 'Review' },
            { id: 'challenge window', name: 'Window' },
            { id: 'paid', name: 'Paid' },
          ]}
        />
      </PanelHead>
      <ul className="grid gap-2 px-4 pt-4 pb-8 lg:px-5">
        {list.map((j) => (
          <JobRow key={j.id} j={j} world={worlds.find((w) => w.id === j.worldId)} />
        ))}
      </ul>
    </Panel>
  )
}
