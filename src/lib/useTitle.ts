import { useEffect } from 'react'

/** Sets the browser tab title for a page: "Lattice · WORLDSEED". */
export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · WORLDSEED` : 'WORLDSEED · Launch a token. Grow a world.'
  }, [title])
}

const set = (sel: string, value: string) => document.querySelector(sel)?.setAttribute('content', value)

/**
 * What a shared link should say about this page: its own line and picture, for apps that
 * read the page as it is now. Put back the site's own when the page closes.
 */
export function useMeta(title: string, description: string, image: string) {
  useEffect(() => {
    const keep = ['og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image'].map((k) => [k, document.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.getAttribute('content') ?? ''] as const)
    const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    const full = `${title} · WORLDSEED`
    set('meta[property="og:title"]', full)
    set('meta[name="twitter:title"]', full)
    set('meta[name="description"]', description)
    set('meta[property="og:description"]', description)
    set('meta[name="twitter:description"]', description)
    set('meta[property="og:image"]', image)
    set('meta[name="twitter:image"]', image)
    return () => {
      for (const [k, v] of keep) set(`meta[property="${k}"], meta[name="${k}"]`, v)
      set('meta[name="description"]', desc)
    }
  }, [title, description, image])
}
