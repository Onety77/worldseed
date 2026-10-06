import { useSyncExternalStore } from 'react'

/*
  Shared clocks, so every countdown, observation window and oracle heartbeat on the page
  moves together. The coarse clock ticks each second; the fine one (for the oracle age,
  which reads in tenths) ticks ten times a second and only the cells that show it subscribe.
*/

function makeClock(ms: number) {
  let now = Date.now()
  const subs = new Set<() => void>()
  let timer: number | undefined
  const subscribe = (cb: () => void) => {
    subs.add(cb)
    if (timer === undefined) {
      now = Date.now()
      timer = window.setInterval(() => {
        // pause work while the tab is hidden; catch up on return
        if (document.hidden) return
        now = Date.now()
        subs.forEach((f) => f())
      }, ms)
    }
    return () => {
      subs.delete(cb)
      if (!subs.size && timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
  }
  return () => useSyncExternalStore(subscribe, () => now)
}

/** Now, ticking once a second. */
export const useNow = makeClock(1000)
