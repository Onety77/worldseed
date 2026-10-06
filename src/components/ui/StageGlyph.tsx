import type { Stage } from '@/lib/types'

/**
 * The three stages as map symbols, matching what the Field draws: a survey stake for a
 * seed, terraces for a realm, a planet in its orbit for a sovereign world.
 */
export function StageGlyph({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {stage === 'seed' && (
        <>
          <path d="M5 14V2.5" />
          <path d="M5 2.8 12 5 5 7.2Z" fill="currentColor" stroke="none" />
          <path d="M2.5 14h6" />
        </>
      )}
      {stage === 'realm' && (
        <>
          <path d="M1.5 13.5h13" />
          <path d="M3.5 13.5V10h9v3.5" />
          <path d="M5.5 10V6.5h5V10" />
          <path d="M7 6.5V3.5h2v3" />
        </>
      )}
      {stage === 'sovereign' && (
        <>
          <circle cx="8" cy="8" r="6.3" strokeDasharray="1.6 1.8" />
          <circle cx="8" cy="8" r="3.4" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}
