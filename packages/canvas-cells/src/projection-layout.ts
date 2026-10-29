import type { Store } from '@einfach/core'
import {
  getViewportRangeRectangle, projectionSnapshotAtom, viewportMetricsAtom, viewportGeometrySizesAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { createLayout } from './layout'
import type { CanvasCellsInput } from './types'

function sameSizes(a: readonly number[] | undefined, b: readonly number[] | undefined) {
  return a === b || Boolean(a && b && a.length === b.length && a.every((n, i) => n === b[i]))
}
function sameInput(a: CanvasCellsInput, b: CanvasCellsInput) {
  return a.cells === b.cells && a.mergeAnchors === b.mergeAnchors
    && a.mergedRanges === b.mergedRanges
    && a.window.rowStart === b.window.rowStart && a.window.rowEnd === b.window.rowEnd
    && a.window.colStart === b.window.colStart && a.window.colEnd === b.window.colEnd
    && sameSizes(a.rowHeights, b.rowHeights) && sameSizes(a.columnWidths, b.columnWidths)
}

/** Cache geometry independently of pixel scrolling; place cells at stable sheet coordinates. */
export function createProjectionLayout(store: Store) {
  let previous: CanvasCellsInput | undefined
  let previousSizes: unknown, previousProjection: unknown, previousGeometry = ''
  let layout: ReturnType<typeof createLayout>
  return (input: CanvasCellsInput) => {
    const metrics = store.getter(viewportMetricsAtom)
    const sizes = store.getter(viewportGeometrySizesAtom)
    const result = store.getter(projectionSnapshotAtom).result
    const projection = result?.kind === 'visible-window' ? result : undefined
    // Scroll position only affects borders where frozen panes touch at the sheet origin.
    const geometry = [metrics.sheetId, metrics.rowCount, metrics.colCount,
      metrics.rowHeight, metrics.colWidth,
      projection?.freeze?.rows ? metrics.scrollTop === 0 : false,
      projection?.freeze?.cols ? metrics.scrollLeft === 0 : false].join(':')
    if (previous && sameInput(previous, input) && previousSizes === sizes
      && previousProjection === projection && previousGeometry === geometry) return layout
    const ownsProjection = projection && (projection.cells === input.cells ||
      projection.frozen?.regions.some(region => region.cells === input.cells))
    const rect = getViewportRangeRectangle(metrics, sizes, input.window)
    const origin = ownsProjection ? { x: rect.left, y: rect.top }
      : { x: input.window.colStart * 120, y: input.window.rowStart * 28 }
    layout = createLayout(input, { origin, projection,
      scrollTop: metrics.scrollTop, scrollLeft: metrics.scrollLeft,
      rectangle: ownsProjection ? range => {
        const box = getViewportRangeRectangle(metrics, sizes, range)
        return { x: box.left, y: box.top, width: box.width, height: box.height }
      } : undefined,
    })
    previous = input; previousSizes = sizes
    previousProjection = projection; previousGeometry = geometry
    return layout
  }
}
