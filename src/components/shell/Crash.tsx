import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { buttonClass } from '@/lib/button'
import { Panel } from './Panel'

/**
 * If a page breaks, the map stays and the panel says so plainly, with a way back.
 * The boundary is keyed by path, so moving to another page starts fresh.
 */
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Panel label="Something went wrong" rest={0.42}>
        <div className="px-5 pt-6 pb-10 lg:px-6 lg:pt-8">
          <p className="label">This page tripped</p>
          <h1 className="mt-2 text-h2">Something on this page didn’t draw.</h1>
          <p className="mt-3 text-[14.5px] text-ink-2">The map and everything else are fine. Try the page again, or head back to the Atlas.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={() => this.setState({ error: null })} className={buttonClass('ink', 'md')}>
              <RotateCcw className="size-4" /> Try again
            </button>
            <Link to="/" onClick={() => this.setState({ error: null })} className={buttonClass('ghost', 'md')}>
              Back to the Atlas
            </Link>
          </div>
          <p className="mt-6 truncate font-mono text-[11px] text-ink-3">{this.state.error.message}</p>
        </div>
      </Panel>
    )
  }
}
