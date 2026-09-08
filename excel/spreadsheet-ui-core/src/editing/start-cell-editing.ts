import { atom } from '@einfach/core'
import { getSourceTextFromProjection } from '../projection/editable-source-text'
import { projectionSnapshotAtom } from '../projection'
import type { CellCoord } from '../shared'
import { startEditingAtom } from './session-atoms'
import type { EditingInputSource } from './types'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'

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
    if (get(selectionStructureFeedbackAtom).busy) return false
    const sizes = get(viewportGeometrySizesAtom)
    if (
      sizes.rowHeightsBySheet[input.sheetId]?.[input.cell.row] === 0 ||
      sizes.colWidthsBySheet[input.sheetId]?.[input.cell.col] === 0
    )
      return false
    const result = get(projectionSnapshotAtom).result
    const sourceText =
      result?.kind === 'visible-window'
        ? getSourceTextFromProjection(result, input.cell, input.sheetId)
        : undefined
    if (sourceText === undefined) return false

    set(startEditingAtom, {
      sheetId: input.sheetId,
      cell: input.cell,
      draft: input.initialDraft ?? sourceText,
      source: input.source ?? 'cell',
    })
    return true
  },
)

startCellEditingFromProjectionAtom.debugLabel = 'spreadsheet.editing.startCellFromProjection'
