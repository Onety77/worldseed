import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import { Shell } from '@/components/shell/Shell'
import { WorldsLens } from '@/pages/Worlds'
import { SovereigntyLens } from '@/pages/Sovereignty'
import { JobsLens } from '@/pages/Jobs'
import { EvidenceLens } from '@/pages/Evidence'
import { GovernanceLens } from '@/pages/Governance'
import { WorldPage } from '@/pages/World'
import { SeedPage } from '@/pages/Seed'
import { HowPage } from '@/pages/How'
import { NotFound } from '@/pages/NotFound'
import { YouPage } from '@/pages/You'
import { ProposalPage } from '@/pages/Proposal'
import { ChallengePage } from '@/pages/Challenge'
import { JobPage } from '@/pages/Job'

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
              <Route path="w/:id" element={<WorldPage />} />
              <Route path="seed" element={<SeedPage />} />
              <Route path="how" element={<HowPage />} />
              <Route path="you" element={<YouPage />} />
              <Route path="p/:id" element={<ProposalPage />} />
              <Route path="c/:id" element={<ChallengePage />} />
              <Route path="j/:id" element={<JobPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MotionConfig>
    </LazyMotion>
  )
}
