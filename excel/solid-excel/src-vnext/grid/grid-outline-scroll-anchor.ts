import {
  getAxisOffsetForIndex,
  getAxisStartIndexAtOffset,
  viewportMetricsAtom,
  type OutlineAxis,
} from '@einfach/spreadsheet-ui-core'
import type { GridRuntime } from './grid-runtime'

type OutlineScrollAnchorRuntime = Pick<
  GridRuntime,
  | 'store'
  | 'viewportMetrics'
  | 'getRowOverridesForSheet'
  | 'getColOverridesForSheet'
  | 'getHiddenRowSet'
  | 'getHiddenColSet'
  | 'syncScrollElementToViewport'
  | 'refreshViewportProjection'
>

interface AxisAnchor {
  index: number
  offsetPx: number
}

function getAxisAnchor(runtime: OutlineScrollAnchorRuntime, axis: OutlineAxis): AxisAnchor {
  const metrics = runtime.viewportMetrics()
  const isRow = axis === 'row'
  const scrollPx = isRow ? metrics.scrollTop : metrics.scrollLeft
  const count = isRow ? metrics.rowCount : metrics.colCount
  const size = isRow ? metrics.rowHeight : metrics.colWidth
  const overrides = isRow ? runtime.getRowOverridesForSheet() : runtime.getColOverridesForSheet()
  const hidden = isRow ? runtime.getHiddenRowSet() : runtime.getHiddenColSet()
  const index = getAxisStartIndexAtOffset(scrollPx, count, size, overrides, hidden)
  const startPx = getAxisOffsetForIndex(index, count, size, overrides, hidden)
  return { index, offsetPx: Math.max(0, scrollPx - startPx) }
}

function restoreAxisAnchor(
  runtime: OutlineScrollAnchorRuntime,
  axis: OutlineAxis,
  anchor: AxisAnchor,
) {
  const metrics = runtime.viewportMetrics()
  const isRow = axis === 'row'
  const count = isRow ? metrics.rowCount : metrics.colCount
  const size = isRow ? metrics.rowHeight : metrics.colWidth
  const viewportSize = isRow ? metrics.viewportHeight : metrics.viewportWidth
  const overrides = isRow ? runtime.getRowOverridesForSheet() : runtime.getColOverridesForSheet()
  const hidden = isRow ? runtime.getHiddenRowSet() : runtime.getHiddenColSet()
  const anchorPx = getAxisOffsetForIndex(anchor.index, count, size, overrides, hidden)
  const totalPx = getAxisOffsetForIndex(count, count, size, overrides, hidden)
  const scrollPx = Math.min(
    Math.max(0, anchorPx + anchor.offsetPx),
    Math.max(0, totalPx - viewportSize),
  )
  const currentPx = isRow ? metrics.scrollTop : metrics.scrollLeft
  if (Math.abs(scrollPx - currentPx) < 0.5) return
  runtime.store.setter(
    viewportMetricsAtom,
    isRow ? { ...metrics, scrollTop: scrollPx } : { ...metrics, scrollLeft: scrollPx },
  )
  runtime.syncScrollElementToViewport(true)
  runtime.refreshViewportProjection()
}

/** Keeps the same leading visible row or column after an outline action changes axis geometry. */
export function preserveOutlineScrollAnchor(
  runtime: OutlineScrollAnchorRuntime,
  axis: OutlineAxis,
  action: () => void,
) {
  const anchor = getAxisAnchor(runtime, axis)
  action()
  restoreAxisAnchor(runtime, axis, anchor)
}
