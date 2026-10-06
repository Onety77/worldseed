/*
  Motion. One personality for the whole site: exact and calm. Things arrive quickly and
  settle without bounce, leave faster than they came, and only live things keep moving.
  The map is the slowest thing on screen; the interface never competes with it.

  Every animation picks from these, and the CSS mirrors them (--dur-*, --ease-*). If
  something needs a value that is not here, the value is probably wrong. Reduced motion
  is honoured through <MotionConfig> and the CSS media query; the map snaps instead.
*/

/** Durations, in seconds. */
export const T = {
  /** presses, hovers, tiny state changes */
  micro: 0.14,
  /** anything leaving; small swaps in place */
  quick: 0.2,
  /** small things arriving: toasts, menus, dialogs, rows, reveals */
  base: 0.3,
  /** surfaces: panels, sheets, page content */
  calm: 0.45,
  /** values settling: bars, meters, counters */
  data: 0.7,
  /** whole-scene changes: the first load lifting, a district standing up */
  scene: 0.8,
  /** a ring spreading from a live event */
  pulse: 1.4,
} as const

/** Arriving: fast start, long soft landing (expo out). */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
/** Leaving: gathers pace as it goes. */
const EASE_IN = [0.5, 0, 0.75, 0] as const
/** Travelling from one place to another. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const

/** Indicators that slide under a choice (tabs, segmented controls). */
export const SPRING_UI = { type: 'spring', stiffness: 520, damping: 42 } as const

/** Ready-made transitions. */
export const enter = { duration: T.base, ease: EASE_OUT }
export const exit = { duration: T.quick, ease: EASE_IN }
export const surface = { duration: T.calm, ease: EASE_OUT }
export const grow = { duration: T.data, ease: EASE_OUT }
export const travel = { duration: T.data, ease: EASE_IN_OUT }

/** How far things move as they come and go, in px: small, so they read as settling. */
export const RISE = 6

/** Fade up into place; leave quicker, slightly upward. For content that swaps in place. */
export const fadeUp = {
  initial: { opacity: 0, y: RISE },
  animate: { opacity: 1, y: 0, transition: enter },
  exit: { opacity: 0, y: -RISE / 2, transition: exit },
}

/** Open to natural height and close again (disclosures, expanding rows). */
export const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: enter },
  exit: { opacity: 0, height: 0, transition: exit },
}
