import { createStore } from '@/lib/store'
import type { World } from '@/lib/types'
import type { LabelDetail } from './Labels'

/** What the name tags on the Field say right now; set by whichever page is open. */
export const labelMode = createStore<{ detail?: (w: World) => LabelDetail | null; focus?: string | null; dim?: boolean }>({})
