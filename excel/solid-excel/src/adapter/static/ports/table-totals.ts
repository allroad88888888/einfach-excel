// 一句话：Excel Table 汇总行端口。

import type {
  SetTableTotalFunctionRequest,
  SetTableTotalsRowRequest,
  TableMutationResult,
} from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { beginUndoableMutation, recordCellBefore } from '../history-record'
import { tableRejected } from '../mutation-result'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import { getOrCreateSheetCells } from '../state'
import {
  TOTALS_DEFAULT_SUBTOTAL_CODE,
  TOTALS_SUBTOTAL_CODES,
  rangeHasContent,
  writeTotalsCell,
} from '../tables/totals'

export function createTableTotalsPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'setTableTotalsRow' | 'setTableTotalFunction'> {
  return {
    // --- Totals row (design-excel-table.md §7, parity #32 T6) -------------
    //
    // Semantics are the engine's, method for method: enabling grows the range
    // one row and seeds the LAST column with `=SUBTOTAL(109, Table[Col])`;
    // the row below must be empty or the call rejects `totals-row-blocked`
    // with nothing changed; disabling clears every totals cell (including
    // hand-edited ones) and shrinks back. Both are idempotent per state.
    //
    // Unlike the registry CRUD above, the CELL writes here do participate in
    // the undo timeline (the engine routes them through `set_formula` /
    // `clear_cell` for the same reason) — but the geometry/`hasTotals` flip
    // rides on the registry, which the undo delta still does not carry, so an
    // undo restores the totals cells without restoring the range. Same known
    // gap as the worker (design §11/§12).
    async setTableTotalsRow(request: SetTableTotalsRowRequest): Promise<TableMutationResult> {
      const entry = state.tablesByKey.get(request.name.toUpperCase())
      if (!entry) return tableRejected(state, request, 'not-found')

      const applied = (): TableMutationResult => ({
        kind: 'table-mutation',
        applied: true,
        name: entry.canonicalName,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      })
      // Idempotent no-op: nothing written, no revision bump.
      if (entry.hasTotals === request.enabled) return applied()

      if (request.enabled) {
        const totalsRow = entry.range.rowEnd + 1
        if (
          rangeHasContent(state, entry.sheetId, {
            rowStart: totalsRow,
            rowEnd: totalsRow,
            colStart: entry.range.colStart,
            colEnd: entry.range.colEnd,
          })
        ) {
          return tableRejected(state, request, 'totals-row-blocked')
        }
        beginUndoableMutation(state)
        // Publish the new geometry BEFORE writing the SUBTOTAL so its
        // `Table[Col]` (the `#Data` band, which now EXCLUDES the totals row)
        // resolves against current geometry on first evaluation.
        entry.range = { ...entry.range, rowEnd: totalsRow }
        entry.hasTotals = true
        if (entry.columns.length > 0) {
          writeTotalsCell(state, entry, entry.columns.length - 1, TOTALS_DEFAULT_SUBTOTAL_CODE)
        }
      } else {
        beginUndoableMutation(state)
        const cells = getOrCreateSheetCells(state, entry.sheetId)
        const totalsRow = entry.range.rowEnd
        for (let col = entry.range.colStart; col <= entry.range.colEnd; col += 1) {
          recordCellBefore(state, entry.sheetId, keyFor(totalsRow, col))
          cells.delete(keyFor(totalsRow, col))
        }
        entry.range = { ...entry.range, rowEnd: totalsRow - 1 }
        entry.hasTotals = false
      }
      state.revision = bumpRevision(state.revision)
      return applied()
    },
    async setTableTotalFunction(
      request: SetTableTotalFunctionRequest,
    ): Promise<TableMutationResult> {
      // Gate order mirrors the WASM binding: the aggregate id is parsed before
      // the engine call, so an unknown id outranks every other rejection.
      const code = TOTALS_SUBTOTAL_CODES[request.func]
      if (code === undefined) return tableRejected(state, request, 'invalid-totals-function')
      const entry = state.tablesByKey.get(request.name.toUpperCase())
      if (!entry) return tableRejected(state, request, 'not-found')
      if (!entry.hasTotals) return tableRejected(state, request, 'no-totals-row')
      const columnIndex = entry.columns.findIndex(
        (c) => c.toLowerCase() === request.column.toLowerCase(),
      )
      if (columnIndex < 0) return tableRejected(state, request, 'column-not-found')

      beginUndoableMutation(state)
      writeTotalsCell(state, entry, columnIndex, code)
      state.revision = bumpRevision(state.revision)
      return {
        kind: 'table-mutation',
        applied: true,
        name: entry.canonicalName,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
  }
}
