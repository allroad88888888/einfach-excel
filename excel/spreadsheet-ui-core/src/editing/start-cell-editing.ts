import { atom } from '@einfach/core'
import { getSourceTextFromProjection } from '../projection/editable-source-text'
import { projectionSnapshotAtom } from '../projection'
import type { CellCoord } from '../shared'
import { startEditingAtom } from './session-atoms'
import type { EditingInputSource } from './types'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { mergeRangeAt } from '../shared/merge'
import { getAxisSpanSize } from '../viewport/axis-geometry'

export interface StartCellEditingFromProjectionInput {
  readonly sheetId: string
  readonly cell: CellCoord
  readonly source?: EditingInputSource
  readonly initialDraft?: string
}

/** Starts a cell draft from the source text owned by the current projection. */
export const startCellEditingFromProjectionAtom = atom(
  null,
  (get, set, input: StartCellEditingFromProjectionInput): boolean => {
    if (get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy)
      return false
    const result = get(projectionSnapshotAtom).result
    const merge =
      result?.kind === 'visible-window' && result.sheetId === input.sheetId
        ? mergeRangeAt(result.mergedRanges ?? [], input.cell)
        : undefined
    const cell = merge ? { row: merge.rowStart, col: merge.colStart } : input.cell
    const sizes = get(viewportGeometrySizesAtom)
    // 可点击的是整个合并框；锚点行/列隐藏，不代表剩余部分也不可编辑。
    // 这里只判断尺寸是否为零，未设置尺寸的索引用任意正数即可。
    const rowStart = merge?.rowStart ?? cell.row
    const rowEnd = merge?.rowEnd ?? cell.row
    const colStart = merge?.colStart ?? cell.col
    const colEnd = merge?.colEnd ?? cell.col
    if (
      getAxisSpanSize(rowStart, rowEnd, rowEnd + 1, 1, sizes.rowHeightsBySheet[input.sheetId]) ===
        0 ||
      getAxisSpanSize(colStart, colEnd, colEnd + 1, 1, sizes.colWidthsBySheet[input.sheetId]) === 0
    )
      return false
    const sourceText =
      result?.kind === 'visible-window'
        ? getSourceTextFromProjection(result, cell, input.sheetId)
        : undefined
    if (sourceText === undefined) return false

    set(startEditingAtom, {
      sheetId: input.sheetId,
      cell,
      draft: input.initialDraft ?? sourceText,
      source: input.source ?? 'cell',
    })
    return true
  },
)

startCellEditingFromProjectionAtom.debugLabel = 'spreadsheet.editing.startCellFromProjection'
