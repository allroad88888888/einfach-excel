import type { Getter, Setter } from '@einfach/core'
import { setPrimaryRegionAtom } from '../selection'
import { scrollToCellAtom, setViewportMetricsAtom, viewportMetricsAtom } from '../viewport'
import type { MoveSelectionIntent } from './types'
import { getAxisOffsetForIndex } from '../viewport/axis-geometry'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'

/** Applies one keyboard move as a single selection-and-viewport transition. */
export function applyKeyboardMove(get: Getter, set: Setter, intent: MoveSelectionIntent): void {
  set(setPrimaryRegionAtom, intent.selection)
  if (intent.reason !== 'page') {
    set(scrollToCellAtom, { coord: intent.scroll.target })
    return
  }

  const metrics = get(viewportMetricsAtom)
  const sizes = get(viewportGeometrySizesAtom)
  const rows = sizes.rowHeightsBySheet[intent.selection.sheetId]
  const cols = sizes.colWidthsBySheet[intent.selection.sheetId]
  set(setViewportMetricsAtom, {
    ...metrics,
    scrollTop:
      metrics.scrollTop +
      getAxisOffsetForIndex(intent.to.row, metrics.rowCount, metrics.rowHeight, rows) -
      getAxisOffsetForIndex(intent.from.row, metrics.rowCount, metrics.rowHeight, rows),
    scrollLeft:
      metrics.scrollLeft +
      getAxisOffsetForIndex(intent.to.col, metrics.colCount, metrics.colWidth, cols) -
      getAxisOffsetForIndex(intent.from.col, metrics.colCount, metrics.colWidth, cols),
  })
}
