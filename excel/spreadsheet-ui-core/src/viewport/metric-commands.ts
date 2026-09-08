import { atom } from '@einfach/core'
import { setViewportMetricsAtom, viewportMetricsAtom } from './metrics'
import type { ViewportMetrics } from './types'

/** 换表重置位置，不重置浏览器已测量的可见面积；同表结构变动保留位置。 */
export const initializeViewportMetricsAtom = atom(
  null,
  (get, set, input: ViewportMetrics): void => {
    const current = get(viewportMetricsAtom)
    if (current.sheetId !== input.sheetId)
      set(setViewportMetricsAtom, {
        ...input,
        viewportHeight: current.viewportHeight > 0 ? current.viewportHeight : input.viewportHeight,
        viewportWidth: current.viewportWidth > 0 ? current.viewportWidth : input.viewportWidth,
      })
    else if (current.rowCount !== input.rowCount || current.colCount !== input.colCount)
      set(setViewportMetricsAtom, {
        ...current,
        rowCount: input.rowCount,
        colCount: input.colCount,
      })
  },
)

export interface SetViewportScrollInput {
  readonly scrollTop: number
  readonly scrollLeft: number
}

export interface SetViewportSizeInput {
  readonly viewportHeight: number
  readonly viewportWidth: number
}

/** Merges the browser's physical scroll position into current viewport metrics. */
export const setViewportScrollAtom = atom(null, (get, set, input: SetViewportScrollInput) => {
  const metrics = get(viewportMetricsAtom)
  if (metrics.scrollTop === input.scrollTop && metrics.scrollLeft === input.scrollLeft) return
  set(setViewportMetricsAtom, { ...metrics, ...input })
})
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
