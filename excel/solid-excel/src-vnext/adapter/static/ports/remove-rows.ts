// 一句话：按行号列表删除行的端口。

import type {
  RemoveRowsExactRequest,
  RemoveRowsExactResult,
  RemoveRowsRequest,
  RemoveRowsResult,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { applyStaticRowsRemoval, planStaticRemoveRowsExact } from '../remove-rows'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'

export function createRemoveRowsPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'removeRows' | 'removeRowsExact'> {
  return {
    async removeRows(request: RemoveRowsRequest): Promise<RemoveRowsResult> {
      // Reference implementation for Wave 7.5 Remove Duplicates. The dialog
      // computes `request.rows` from `findDuplicateRows`; we accept an
      // arbitrarily ordered (possibly empty, possibly duplicated) list and
      // apply each row deletion from the bottom up so earlier deletions do
      // not shift the indices of later ones.
      //
      // Empty input is a no-op (no snapshot recorded, no revision bump) so
      // that an accidental "no duplicates found → confirm" round-trip does
      // not pollute the undo stack.
      const unique = Array.from(new Set(request.rows)).filter((r) => Number.isInteger(r) && r >= 0)
      if (unique.length === 0) {
        return {
          sheetId: request.sheetId,
          removedRows: 0,
          revision: request.revision ?? state.revision,
        }
      }

      // Descending so each shift step keeps remaining row indices valid.
      unique.sort((a, b) => b - a)
      const minRow = unique[unique.length - 1]
      const maxRow = unique[0]
      const mutation = applyStaticRowsRemoval(
        state,
        request.sheetId,
        unique,
        bumpRevision(state.revision),
      )

      // Span of touched rows for callers that want to invalidate a
      // contiguous projection window. We don't know the workbook's true
      // column extent, so report the union of any existing column range:
      // `findDuplicateRows` only ever ran across the dialog's range, so
      // every column in the spreadsheet is potentially affected by the
      // upward shift of rows below `minRow`.
      let maxCol = -1
      for (const cell of mutation.cells.values()) {
        if (cell.col > maxCol) maxCol = cell.col
      }
      const affectedRange =
        maxCol >= 0
          ? {
              startRow: minRow,
              // Bottom shifts up — cells previously at maxRow.. now at
              // `maxRow - removed`. Report up to the prior bottom so the
              // host invalidates a generous slice.
              endRow: Math.max(minRow, maxRow),
              startCol: 0,
              endCol: maxCol,
            }
          : undefined

      return {
        sheetId: request.sheetId,
        removedRows: unique.length,
        affectedRange,
        revision: request.revision ?? mutation.revision,
      }
    },
    async removeRowsExact(request: RemoveRowsExactRequest): Promise<RemoveRowsExactResult> {
      const plan = planStaticRemoveRowsExact(state, request)
      const mutation = applyStaticRowsRemoval(
        state,
        plan.sheetId,
        plan.descendingRows,
        plan.nextRevision,
      )

      return {
        requestId: plan.requestId,
        sheetId: plan.sheetId,
        targetRange: { ...plan.targetRange },
        removedRowIndices: [...plan.ascendingRows],
        removedRows: plan.ascendingRows.length,
        affectedRange: {
          startRow: plan.ascendingRows[0],
          endRow: plan.targetRange.rowEnd,
          startCol: plan.targetRange.colStart,
          endCol: plan.targetRange.colEnd,
        },
        revision: mutation.revision,
      }
    },
  }
}
