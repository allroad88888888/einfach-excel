import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { projectionSnapshotAtom } from '../projection/state'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { CellRange } from '../shared'
import { runSelectionSizeAtom, selectionSizePanelAtom } from '../toolbar/selection-size-command'
import { viewportGeometrySizesAtom } from './geometry-sizes'
import { viewportMetricsAtom } from './metrics'
import {
  getViewportColumnWidth,
  getViewportRowHeight,
  MIN_VIEWPORT_ROW_HEIGHT,
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_COL_WIDTH,
  MAX_VIEWPORT_COL_WIDTH,
  viewportMetadataProjectionIdentityAtom,
} from './size-overrides'

interface ResizeDrag {
  readonly sheetId: string
  readonly axis: 'row' | 'column'
  readonly index: number
  readonly pointerId: number
  readonly origin: number
  readonly initial: number
  readonly pixels: number
  readonly range: CellRange
  readonly metadata: Readonly<object>
}

/** 仅供参考线显示的手势草稿，不是第二份行列尺寸。 */
export const resizeDragAtom = atom<ResizeDrag | null>(null)
resizeDragAtom.debugLabel = 'spreadsheet.viewport.resizeDrag'
type ResizeGesture =
  | { phase: 'start'; axis: 'row' | 'column'; index: number; pointerId: number; position: number }
  | { phase: 'move'; pointerId: number; position: number }
  | { phase: 'commit' | 'cancel'; pointerId: number }

/** 拖动不写工作簿；松手只复用一次尺寸命令，取消／原位点击零写入。 */
export const runResizeDragAtom = atom(
  null,
  (get, set, input: ResizeGesture): boolean | Promise<boolean> => {
    const sheet = get(activeWorkbookSheetAtom)
    const current = get(resizeDragAtom)
    if (input.phase === 'start') {
      const projection = get(projectionSnapshotAtom)
      if (
        !sheet ||
        current ||
        get(editingSessionAtom).source ||
        get(selectionSizePanelAtom).busy ||
        get(selectionSizePanelAtom).target ||
        projection.status !== 'ready' ||
        projection.request?.sheetId !== sheet.id ||
        !Number.isFinite(input.position) ||
        !Number.isInteger(input.index) ||
        input.index < 0 ||
        input.index >= (input.axis === 'row' ? sheet.rowCount : sheet.colCount)
      )
        return false
      const selected = get(selectionSnapshotAtom)
      const inRange =
        input.axis === 'row'
          ? input.index >= selected.range.rowStart && input.index <= selected.range.rowEnd
          : input.index >= selected.range.colStart && input.index <= selected.range.colEnd
      const range =
        selected.selection.sheetId === sheet.id &&
        inRange &&
        (selected.selection.kind === input.axis || selected.selection.kind === 'all')
          ? { ...selected.range }
          : input.axis === 'row'
            ? {
                rowStart: input.index,
                rowEnd: input.index,
                colStart: 0,
                colEnd: sheet.colCount - 1,
              }
            : {
                rowStart: 0,
                rowEnd: sheet.rowCount - 1,
                colStart: input.index,
                colEnd: input.index,
              }
      const metrics = get(viewportMetricsAtom)
      const sizes = get(viewportGeometrySizesAtom)
      const initial =
        input.axis === 'row'
          ? getViewportRowHeight(sizes, sheet.id, input.index, metrics.rowHeight)
          : getViewportColumnWidth(sizes, sheet.id, input.index, metrics.colWidth)
      if (initial <= 0) return false
      set(resizeDragAtom, {
        sheetId: sheet.id,
        axis: input.axis,
        index: input.index,
        pointerId: input.pointerId,
        origin: input.position,
        initial,
        pixels: initial,
        range,
        metadata: get(viewportMetadataProjectionIdentityAtom),
      })
      return true
    }
    if (!current || current.pointerId !== input.pointerId) return false
    if (
      input.phase === 'cancel' ||
      current.sheetId !== sheet?.id ||
      current.metadata !== get(viewportMetadataProjectionIdentityAtom)
    ) {
      set(resizeDragAtom, null)
      return false
    }
    if (input.phase === 'move') {
      if (!Number.isFinite(input.position)) return false
      const min = current.axis === 'row' ? MIN_VIEWPORT_ROW_HEIGHT : MIN_VIEWPORT_COL_WIDTH
      const max = current.axis === 'row' ? MAX_VIEWPORT_ROW_HEIGHT : MAX_VIEWPORT_COL_WIDTH
      const pixels = Math.max(
        min,
        Math.min(max, Math.round(current.initial + input.position - current.origin)),
      )
      if (pixels !== current.pixels) set(resizeDragAtom, { ...current, pixels })
      return true
    }
    set(resizeDragAtom, null)
    if (current.pixels === current.initial) return false
    return set(runSelectionSizeAtom, {
      axis: current.axis,
      pixels: current.pixels,
      target: { sheetId: current.sheetId, range: current.range },
    })
  },
)
runResizeDragAtom.debugLabel = 'spreadsheet.viewport.runResizeDrag'
