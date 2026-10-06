import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import { Shell } from '@/components/shell/Shell'
import { PanelSkeleton } from '@/components/shell/Skeleton'
import { WorldsLens } from '@/pages/Worlds'
import { SovereigntyLens } from '@/pages/Sovereignty'
import { JobsLens } from '@/pages/Jobs'
import { EvidenceLens } from '@/pages/Evidence'
import { GovernanceLens } from '@/pages/Governance'
import { WorldPage } from '@/pages/World'
import { NotFound } from '@/pages/NotFound'

// the pages you reach second arrive on demand, so the Atlas opens faster
const SeedPage = lazy(() => import('@/pages/Seed').then((m) => ({ default: m.SeedPage })))
const HowPage = lazy(() => import('@/pages/How').then((m) => ({ default: m.HowPage })))
const YouPage = lazy(() => import('@/pages/You').then((m) => ({ default: m.YouPage })))
const ProposalPage = lazy(() => import('@/pages/Proposal').then((m) => ({ default: m.ProposalPage })))
const ChallengePage = lazy(() => import('@/pages/Challenge').then((m) => ({ default: m.ChallengePage })))
const JobPage = lazy(() => import('@/pages/Job').then((m) => ({ default: m.JobPage })))
const ProfilePage = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.ProfilePage })))
const RankingsLens = lazy(() => import('@/pages/Rankings').then((m) => ({ default: m.RankingsLens })))

export default function App() {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<WorldsLens />} />
              <Route path="sovereignty" element={<SovereigntyLens />} />
              <Route path="jobs" element={<JobsLens />} />
              <Route path="evidence" element={<EvidenceLens />} />
              <Route path="governance" element={<GovernanceLens />} />
              <Route path="rankings" element={<Suspense fallback={<PanelSkeleton />}><RankingsLens /></Suspense>} />
              <Route path="w/:id" element={<WorldPage />} />
              <Route path="seed" element={<Suspense fallback={<PanelSkeleton />}><SeedPage /></Suspense>} />
              <Route path="how" element={<Suspense fallback={<PanelSkeleton />}><HowPage /></Suspense>} />
              <Route path="you" element={<Suspense fallback={<PanelSkeleton />}><YouPage /></Suspense>} />
              <Route path="p/:id" element={<Suspense fallback={<PanelSkeleton />}><ProposalPage /></Suspense>} />
              <Route path="c/:id" element={<Suspense fallback={<PanelSkeleton />}><ChallengePage /></Suspense>} />
              <Route path="j/:id" element={<Suspense fallback={<PanelSkeleton />}><JobPage /></Suspense>} />
              <Route path="u/:handle" element={<Suspense fallback={<PanelSkeleton />}><ProfilePage /></Suspense>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MotionConfig>
    </LazyMotion>
  )
}
