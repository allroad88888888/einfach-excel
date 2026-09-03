import type { Getter, Setter } from '@einfach/core'
import { setPrimaryRegionAtom } from '../selection'
import {
  scrollToCellAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
} from '../viewport'
import type { MoveSelectionIntent } from './types'

/** Applies one keyboard move as a single selection-and-viewport transition. */
export function applyKeyboardMove(get: Getter, set: Setter, intent: MoveSelectionIntent): void {
  set(setPrimaryRegionAtom, intent.selection)
  if (intent.reason !== 'page') {
    set(scrollToCellAtom, { coord: intent.scroll.target })
    return
  }

  const metrics = get(viewportMetricsAtom)
  set(setViewportMetricsAtom, {
    ...metrics,
    scrollTop: metrics.scrollTop + (intent.to.row - intent.from.row) * metrics.rowHeight,
    scrollLeft: metrics.scrollLeft + (intent.to.col - intent.from.col) * metrics.colWidth,
  })
}
