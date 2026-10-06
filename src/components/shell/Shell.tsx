import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMedia } from '@/lib/useMedia'
import { useGraduations, useWorlds } from '@/lib/sim'
import { useNow } from '@/lib/clock'
import { FieldProvider, useField } from '@/field/Field'
import { Labels } from '@/field/Labels'
import { labelMode } from '@/field/labels'
import type { LabelDetail } from '@/field/Labels'
import type { World } from '@/lib/types'
import { Rail } from './Rail'
import { TopBar } from './TopBar'
import { MomentNotice } from './Notice'
import { MapControls } from './MapControls'
import { SearchPalette } from './Search'
import { InboxPanel, useInboxFeed } from './Inbox'
import { ConnectDialog } from '@/components/wallet/Connect'
import { Toaster } from './Toaster'
import { Keys } from './Keys'
import { Crash } from './Crash'
import { Arrive } from './Arrive'
import { startMarket } from '@/lib/market'
import { getState } from '@/lib/sim'

/**
 * The frame every page shares: the Field behind everything, the name tags standing on it,
 * the rail (wide) or the top bar (narrow), and the page's own panel.
 */
export function Shell() {
  const wide = useMedia('(min-width: 1024px)')
  const { pathname } = useLocation()
  useInboxFeed()
  useEffect(() => startMarket(() => getState().worlds.map((w) => w.id)), [])
  return (
    <FieldProvider>
      <a href="#content" className="sr-only z-50 rounded-control bg-ink px-3 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <OpenOnTap />
      {wide ? <Rail /> : <TopBar />}
      <MomentNotice />
      <MapControls />
      <main id="content" tabIndex={-1} className="outline-none">
        <Crash key={pathname}>
          <Outlet />
        </Crash>
      </main>
      {/* after the page in reading order; drawn under the panels */}
      <FieldLabels />
      <SearchPalette />
      <InboxPanel />
      <ConnectDialog />
      <Toaster />
      <Keys />
      <Arrive />
    </FieldProvider>
  )
}

function FieldLabels() {
  const worlds = useWorlds()
  const mode = labelMode.use()
  const grads = useGraduations()
  const now = useNow()
  const fresh = useMemo(() => new Set(grads.filter((g) => now - g.at < 45_000).map((g) => g.worldId)), [grads, now])
  return <Labels worlds={worlds} detail={mode.detail} focus={mode.focus} dim={mode.dim} hide={mode.hide} fresh={fresh} />
}

/** A tap on a hill opens that world. */
function OpenOnTap() {
  const engine = useField()
  const nav = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => engine?.onSelect((id) => nav(`/w/${id}`)), [engine, nav])
  // whatever was hovered on the last page is no longer under the pointer
  useEffect(() => engine?.setHover(null), [engine, pathname])
  return null
}

/** Set what the name tags say while a page is open. */
export function useLabels(detail?: (w: World) => LabelDetail | null, focus: string | null = null, dim = false, hide: string | null = null) {
  useLayoutEffect(() => {
    labelMode.set({ detail, focus, dim, hide })
  }, [detail, focus, dim, hide])
}
