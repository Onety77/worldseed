import { useEffect, useState } from 'react'

/** True while the media query matches (e.g. '(min-width: 640px)'). */
export function useMedia(query: string, initial = true) {
  const [on, setOn] = useState(() => (typeof window === 'undefined' ? initial : window.matchMedia(query).matches))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const change = () => setOn(mq.matches)
    mq.addEventListener('change', change)
    return () => mq.removeEventListener('change', change)
  }, [query])
  return on
}

/** Screens wide enough for the rail on the left. */
export const RAIL = '(min-width: 1024px)'
/** Screens where a page docks to the side: wide ones, and phones or small tablets held sideways. */
const DOCK = '(min-width: 1024px), (min-width: 600px) and (orientation: landscape) and (max-height: 640px)'
export const useDocked = () => useMedia(DOCK)
