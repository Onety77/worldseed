/**
 * Motion tokens. One personality: exact, calm, a little cinematic at the edges (the intro
 * and the way in). Things arrive quickly and settle without bounce; only live things keep
 * moving. Everything respects reduced motion via <MotionConfig>.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const // entrances (expo-out)
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const // things that travel
export const SPRING_UI = { type: 'spring', stiffness: 520, damping: 42 } as const // indicators that slide
