import { useCallback, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import type { Verdict, World } from '@/lib/types'
import { useNow } from '@/lib/clock'
import { useTitle } from '@/lib/useTitle'
import { useEvidence, useWorlds } from '@/lib/sim'
import { ago, usd } from '@/lib/format'
import { buttonClass } from '@/lib/button'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel, PanelHead } from '@/components/shell/Panel'
import { Segmented, Stat } from '@/components/ui/bits'
import { EvidenceRow } from '@/components/evidence/EvidenceRow'
import { getState } from '@/lib/sim'

export function EvidenceLens() {
  useTitle('Evidence')
  useFieldView({ kind: 'atlas' })
  const ev = useEvidence()
  // the tags show how long since each governor last published; refreshed with each new proof
  const detail = useCallback(
    (w: World) => {
      const last = getState().evidence.find((e) => e.worldId === w.id)
      return last ? { text: ago(last.at, Date.now()), tone: Date.now() - last.at < 60_000 ? ('green' as const) : undefined } : null
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [ev[0]?.id],
  )
  useLabels(detail)
  const worlds = useWorlds()
  const now = useNow()
  const [f, setF] = useState<'all' | Verdict>('all')
  const [limit, setLimit] = useState(30)
  const day = ev.filter((e) => now - e.at < 86_400_000)
  const list = ev.filter((e) => f === 'all' || e.verdict === f)

  return (
    <Panel label="Evidence" rest={0.5}>
      <PanelHead>
        <div className="flex items-center justify-between">
          <h1 className="text-h2">Evidence</h1>
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-green uppercase">
            <span className="ping relative size-1.5 rounded-full bg-green" /> Live
          </span>
        </div>
        <p className="mt-1 text-[13.5px] text-ink-2">Every governor action ships as a bundle: inputs, model, cost, policy check and an onchain reference. Watch the rings on the Field as they land.</p>
        <dl className="mt-4 grid grid-cols-3 gap-4">
          <Stat label="Bundles, 24h">{day.length}</Stat>
          <Stat label="Compute, 24h">{usd(day.reduce((s, e) => s + e.costUsd, 0))}</Stat>
          <Stat label="Challenged">{ev.filter((e) => e.verdict === 'challenged').length}</Stat>
        </dl>
        <Segmented
          className="mt-4"
          label="Filter bundles"
          layoutId="ev-filter"
          size="sm"
          value={f}
          onChange={setF}
          options={[
            { id: 'all', name: 'All' },
            { id: 'passed', name: 'Verified' },
            { id: 'pending', name: 'In window' },
            { id: 'challenged', name: 'Challenged' },
            { id: 'failed', name: 'Failed' },
          ]}
        />
      </PanelHead>
      <ul className="grid gap-0.5 px-2 pt-2 pb-4 lg:px-3">
        <AnimatePresence initial={false}>
          {list.slice(0, limit).map((e) => {
            const w = worlds.find((x) => x.id === e.worldId)
            if (!w) return null
            return (
              <EvidenceRow key={e.id} e={e} world={w} showWorld arrive />
            )
          })}
        </AnimatePresence>
      </ul>
      {list.length > limit && (
        <div className="px-5 pb-8">
          <button onClick={() => setLimit((l) => l + 30)} className={buttonClass('outline', 'md', 'w-full')}>
            Show older bundles
          </button>
        </div>
      )}
    </Panel>
  )
}
