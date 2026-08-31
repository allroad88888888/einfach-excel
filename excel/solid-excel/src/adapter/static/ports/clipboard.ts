// 一句话：剪贴板复制粘贴端口。

import type { PasteRangeRequest, PasteRangeResult } from '@einfach/spreadsheet-ui-core'
import { getEffectiveFormat, keyFor } from '@einfach/spreadsheet-ui-core'
import {
  applyPasteArithmetic,
  isPasteSourceBlank,
  pasteRangeGeometry,
  pasteSourceCoord,
} from '../../paste-range-plan'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { updateCell } from '../cell-update'
import { beginUndoableMutation, recordCellBefore, recordCellFormatBefore } from '../history-record'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import { getOrCreateCellFormats, getOrCreateRangeFormats, getOrCreateSheetCells } from '../state'
import { exportRangeTsvFromState } from '../tsv-export'

export function createClipboardPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'exportRangeTsv' | 'pasteRange'> {
  return {
    async exportRangeTsv(request) {
      return exportRangeTsvFromState(state, request)
    },

    async pasteRange(request: PasteRangeRequest): Promise<PasteRangeResult> {
      // Reference implementation for Wave 7.3 Paste Special. Walks the
      // source range (read straight from this backend's in-memory state),
      // applies the requested kind/op/transpose/skipBlanks flags via the
      // shared pure helpers in `paste-range-plan.ts` (one semantic shared
      // with the worker adapter), and writes back via the same maps that
      // `setCellInput` / `setFormatRange` mutate. Designed to be easy to
      // reason about, not to handle every Excel edge case.
      beginUndoableMutation(state)

      const sourceSheetCells = getOrCreateSheetCells(state, request.source.sheetId)
      const sourceCellFormats = getOrCreateCellFormats(state, request.source.sheetId)
      const sourceRangeFormats = getOrCreateRangeFormats(state, request.source.sheetId)
      const targetSheetCells = getOrCreateSheetCells(state, request.sheetId)
      const targetCellFormats = getOrCreateCellFormats(state, request.sheetId)

      const src = request.source.range
      const tgt = request.target
      const geometry = pasteRangeGeometry(request)

      for (let dr = 0; dr < geometry.patchRows; dr += 1) {
        for (let dc = 0; dc < geometry.patchCols; dc += 1) {
          const srcCoord = pasteSourceCoord(src, geometry.transpose, dr, dc)
          const tgtRow = tgt.rowStart + dr
          const tgtCol = tgt.colStart + dc
          const srcKey = keyFor(srcCoord.row, srcCoord.col)
          const tgtKey = keyFor(tgtRow, tgtCol)
          const srcCell = sourceSheetCells.get(srcKey)
          const srcDisplay = srcCell?.displayValue ?? ''

          // Skip-blanks: if the source cell is empty, leave the target alone.
          if (request.skipBlanks && isPasteSourceBlank(srcDisplay, srcCell?.formula)) {
            continue
          }

          if (geometry.writeValues) {
            const baseInput = srcCell?.formula ?? srcDisplay
            const targetCell = targetSheetCells.get(tgtKey)
            const finalInput = applyPasteArithmetic(request.op, baseInput, targetCell?.displayValue)
            // `applyPasteArithmetic` returns `null` when arithmetic
            // coercion would be ill-defined (text/error sides) — preserve
            // the target verbatim. Otherwise reuse the in-place
            // setCellInput helper so revision/value-kind invariants stay
            // consistent.
            if (finalInput !== null) {
              recordCellBefore(state, request.sheetId, tgtKey)
              updateCell(targetSheetCells, {
                kind: 'set-cell-input',
                sheetId: request.sheetId,
                row: tgtRow,
                col: tgtCol,
                input: finalInput,
              })
            }
          }

          if (geometry.writeFormats) {
            recordCellFormatBefore(state, request.sheetId, tgtKey)
            const effectiveFormat = getEffectiveFormat(
              srcCoord.row,
              srcCoord.col,
              sourceCellFormats,
              sourceRangeFormats,
            )
            if (effectiveFormat) {
              targetCellFormats.set(tgtKey, { ...effectiveFormat })
            } else {
              targetCellFormats.delete(tgtKey)
            }
          }
        }
      }

      state.revision = bumpRevision(state.revision)
      return {
        kind: 'paste-range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: { ...geometry.affectedRange },
      }
    },
  }
}
