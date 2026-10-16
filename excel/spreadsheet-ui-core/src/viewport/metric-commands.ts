import { atom } from '@einfach/core'
import {
  getCellViewportRect, getViewportScrollForCell,
  normalizeViewportMetrics, setViewportMetricsAtom, viewportMetricsAtom,
} from './metrics'
import { viewportGeometrySizesAtom } from './geometry-sizes'
import { projectedFreezeAtom } from './projected-freeze'
import { selectionSnapshotAtom } from '../selection'
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
  /** 切表首次测量只裁剪恢复位置，不继承上一张表的贴边状态。 */
  readonly preserveEdges?: boolean
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
  if (input.preserveEdges !== false &&
    metrics.viewportHeight === input.viewportHeight &&
    metrics.viewportWidth === input.viewportWidth
  ) {
    return
  }
  const sizes = get(viewportGeometrySizesAtom)
  const { viewportHeight, viewportWidth } = input
  const rows = metrics.sheetId ? sizes.rowHeightsBySheet[metrics.sheetId] : undefined
  const cols = metrics.sheetId ? sizes.colWidthsBySheet[metrics.sheetId] : undefined
  const max = normalizeViewportMetrics({
    ...metrics, scrollTop: Number.MAX_VALUE, scrollLeft: Number.MAX_VALUE,
  }, rows, cols)
  const pinBottom = input.preserveEdges !== false && metrics.scrollTop > 0 &&
    Math.abs(max.scrollTop - metrics.scrollTop) <= 1
  const pinRight = input.preserveEdges !== false && metrics.scrollLeft > 0 &&
    Math.abs(max.scrollLeft - metrics.scrollLeft) <= 1
  // 已贴边时随可见面积变化保持贴边；普通中途浏览不因底栏换行或窗口缩放而跳动。
  const next = {
    ...metrics, viewportHeight, viewportWidth,
    scrollTop: pinBottom
      ? max.scrollTop + metrics.viewportHeight - viewportHeight : metrics.scrollTop,
    scrollLeft: pinRight
      ? max.scrollLeft + metrics.viewportWidth - viewportWidth : metrics.scrollLeft,
  }
  const selection = get(selectionSnapshotAtom)
  const projectedFreeze = get(projectedFreezeAtom)
  const freeze = projectedFreeze && projectedFreeze.sheetId === metrics.sheetId
    ? projectedFreeze : undefined
  const coord = selection.activeCell
  const rect = getCellViewportRect(coord, metrics, rows, cols)
  const visibleRow = freeze && coord.row < freeze.rows ||
    rect.top < metrics.viewportHeight && rect.top + rect.height > (freeze?.height ?? 0)
  const visibleCol = freeze && coord.col < freeze.cols ||
    rect.left < metrics.viewportWidth && rect.left + rect.width > (freeze?.width ?? 0)
  // 多行公式栏增高不能把当前格挤出投影，否则公式栏失去值又缩回，形成布局循环。
  // 只保住原本可见的格；手动滚离它、切表首次测量或扩大窗口都不追踪选区。
  if (input.preserveEdges !== false && selection.selection.sheetId === metrics.sheetId &&
    coord.row < metrics.rowCount && coord.col < metrics.colCount &&
    rect.height > 0 && rect.width > 0 && visibleRow && visibleCol) {
    const nearest = getViewportScrollForCell(next, { coord }, rows, cols, freeze)
    if (!pinBottom && viewportHeight < metrics.viewportHeight) next.scrollTop = nearest.scrollTop
    if (!pinRight && viewportWidth < metrics.viewportWidth) next.scrollLeft = nearest.scrollLeft
  }
  set(setViewportMetricsAtom, next)
})
setViewportSizeAtom.debugLabel = 'spreadsheet.viewport.setSize'
