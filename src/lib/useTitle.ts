import { useEffect } from 'react'

/** Sets the browser tab title for a page: "Lattice · WORLDSEED". */
export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · WORLDSEED` : 'WORLDSEED · Launch a token. Grow a world.'
  }, [title])
}
