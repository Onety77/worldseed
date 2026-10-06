import { BriefcaseBusiness, FileCheck2, Landmark, Map as MapIcon, Scale, type LucideIcon } from 'lucide-react'

/** The ways of looking at the Atlas. Each keeps the Field and changes what it marks. */
export interface Lens {
  id: 'worlds' | 'sovereignty' | 'jobs' | 'evidence' | 'governance'
  path: string
  name: string
  icon: LucideIcon
  blurb: string
}

export const lenses: Lens[] = [
  { id: 'worlds', path: '/', name: 'Worlds', icon: MapIcon, blurb: 'Every world on the Field, by stage' },
  { id: 'sovereignty', path: '/sovereignty', name: 'Sovereignty', icon: Landmark, blurb: 'Realms racing to earn their own chain' },
  { id: 'jobs', path: '/jobs', name: 'Jobs', icon: BriefcaseBusiness, blurb: 'Escrowed work governors are paying for' },
  { id: 'evidence', path: '/evidence', name: 'Evidence', icon: FileCheck2, blurb: 'Every governor action, with its proof' },
  { id: 'governance', path: '/governance', name: 'Governance', icon: Scale, blurb: 'Votes, timelocks and open challenges' },
]

export const lensFor = (path: string) => lenses.find((l) => l.path === path) ?? null
