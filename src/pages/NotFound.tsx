import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useTitle } from '@/lib/useTitle'
import { buttonClass } from '@/lib/button'
import { useFieldView } from '@/field/Field'
import { useLabels } from '@/components/shell/Shell'
import { Panel } from '@/components/shell/Panel'

export function NotFound() {
  useTitle('Off the map')
  useFieldView({ kind: 'coast' })
  const none = useCallback(() => null, [])
  useLabels(none, null, true)
  return (
    <Panel label="Not found" rest={0.42}>
      <div className="px-5 pt-6 pb-10 lg:px-6 lg:pt-8">
        <p className="label">404 · off the map</p>
        <h1 className="mt-2 text-h1">Nothing has been planted here.</h1>
        <p className="mt-3 text-[15px] text-ink-2">This page doesn't exist, or the world it pointed to was never seeded. The Atlas shows every world there is.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/" className={buttonClass('ink', 'md')}>
            Back to the Atlas <ArrowRight className="size-4" />
          </Link>
          <Link to="/seed" className={buttonClass('primary', 'md')}>
            Seed one here
          </Link>
        </div>
      </div>
    </Panel>
  )
}
