import { atom } from '@einfach/core'
import { normalizeViewportMetrics, setViewportMetricsAtom, viewportMetricsAtom } from './metrics'
import { viewportGeometrySizesAtom } from './geometry-sizes'
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
  const sizes = get(viewportGeometrySizesAtom)
  const max = normalizeViewportMetrics({
    ...metrics, scrollTop: Number.MAX_VALUE, scrollLeft: Number.MAX_VALUE,
  }, metrics.sheetId ? sizes.rowHeightsBySheet[metrics.sheetId] : undefined,
  metrics.sheetId ? sizes.colWidthsBySheet[metrics.sheetId] : undefined)
  // 已贴边时随可见面积变化保持贴边；普通中途浏览不因底栏换行或窗口缩放而跳动。
  set(setViewportMetricsAtom, {
    ...metrics, ...input,
    scrollTop: metrics.scrollTop > 0 && Math.abs(max.scrollTop - metrics.scrollTop) <= 1
      ? max.scrollTop + metrics.viewportHeight - input.viewportHeight : metrics.scrollTop,
    scrollLeft: metrics.scrollLeft > 0 && Math.abs(max.scrollLeft - metrics.scrollLeft) <= 1
      ? max.scrollLeft + metrics.viewportWidth - input.viewportWidth : metrics.scrollLeft,
  })
})
setViewportSizeAtom.debugLabel = 'spreadsheet.viewport.setSize'
