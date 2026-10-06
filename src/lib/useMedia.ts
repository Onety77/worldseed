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
