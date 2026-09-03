import { atom } from '@einfach/core'
import { setViewportMetricsAtom, viewportMetricsAtom } from './metrics'

export interface SetViewportScrollInput {
  readonly scrollTop: number
  readonly scrollLeft: number
}

export interface SetViewportSizeInput {
  readonly viewportHeight: number
  readonly viewportWidth: number
}

/** Merges the browser's physical scroll position into current viewport metrics. */
export const setViewportScrollAtom = atom(
  null,
  (get, set, input: SetViewportScrollInput) => {
    const metrics = get(viewportMetricsAtom)
    if (metrics.scrollTop === input.scrollTop && metrics.scrollLeft === input.scrollLeft) return
    set(setViewportMetricsAtom, { ...metrics, ...input })
  },
)
setViewportScrollAtom.debugLabel = 'spreadsheet.viewport.setScroll'

/** Merges the browser's measured content area into current viewport metrics. */
export const setViewportSizeAtom = atom(null, (get, set, input: SetViewportSizeInput) => {
  const metrics = get(viewportMetricsAtom)
  if (
    metrics.viewportHeight === input.viewportHeight &&
    metrics.viewportWidth === input.viewportWidth
  ) {
    return
  }
  set(setViewportMetricsAtom, { ...metrics, ...input })
})
setViewportSizeAtom.debugLabel = 'spreadsheet.viewport.setSize'
