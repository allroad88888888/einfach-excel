// 一句话：单元格写入端口。

import type { ImportCellChunksRequest, ImportCellsRequest } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { updateCell, updateCellRichValue } from '../cell-update'
import { applyStateDelta } from '../history-apply'
import { beginUndoableMutation, recordCellBefore } from '../history-record'
import { applyClearRange } from '../range-clear'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import { getOrCreateSheetCells } from '../state'

export function createCellInputPorts(
  state: StaticBackendState,
): Pick<
  StaticSpreadsheetBackend,
  'setCellInput' | 'setCellRichValue' | 'importCells' | 'importCellChunks' | 'clearRange'
> {
  return {
    async setCellInput(request) {
      beginUndoableMutation(state)
      recordCellBefore(state, request.sheetId, keyFor(request.row, request.col))
      updateCell(getOrCreateSheetCells(state, request.sheetId), request)
      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: {
          rowStart: request.row,
          rowEnd: request.row,
          colStart: request.col,
          colEnd: request.col,
        },
      }
    },
    async setCellRichValue(request) {
      beginUndoableMutation(state)
      recordCellBefore(state, request.sheetId, keyFor(request.row, request.col))
      updateCellRichValue(getOrCreateSheetCells(state, request.sheetId), request)
      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: {
          rowStart: request.row,
          rowEnd: request.row,
          colStart: request.col,
          colEnd: request.col,
        },
      }
    },
    async importCells(request: ImportCellsRequest) {
      if (request.cells.length === 0) {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: state.revision,
          affectedRange: request.range,
        }
      }

      beginUndoableMutation(state)
      const cells = getOrCreateSheetCells(state, request.sheetId)
      for (const cell of request.cells) {
        recordCellBefore(state, request.sheetId, keyFor(cell.row, cell.col))
        updateCell(
          cells,
          {
            kind: 'set-cell-input',
            sheetId: request.sheetId,
            row: cell.row,
            col: cell.col,
            input: cell.input,
          },
          { preserveAsText: cell.preserveAsText },
        )
      }
      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: request.range,
      }
    },
    async importCellChunks(request: ImportCellChunksRequest) {
      const revisionBefore = state.revision
      const undoStackBefore = [...state.undoStack]
      const redoStackBefore = [...state.redoStack]
      const pendingDeltaBefore = state.pendingDelta
      let transactionStarted = false

      try {
        for await (const chunk of request.chunks) {
          for (const cell of chunk) {
            if (!transactionStarted) {
              // Keep the import streaming: defer history allocation until the
              // first actual cell instead of materializing the whole source.
              beginUndoableMutation(state)
              transactionStarted = true
            }

            recordCellBefore(state, request.sheetId, keyFor(cell.row, cell.col))
            updateCell(
              getOrCreateSheetCells(state, request.sheetId),
              {
                kind: 'set-cell-input',
                sheetId: request.sheetId,
                row: cell.row,
                col: cell.col,
                input: cell.input,
              },
              { preserveAsText: cell.preserveAsText },
            )
          }
        }
      } catch (error) {
        if (transactionStarted) {
          const rollbackDelta = state.pendingDelta
          try {
            if (rollbackDelta) applyStateDelta(state, rollbackDelta)
          } finally {
            state.undoStack = undoStackBefore
            state.redoStack = redoStackBefore
            state.pendingDelta = pendingDeltaBefore
            state.revision = revisionBefore
          }
        }
        throw error
      }

      if (!transactionStarted) {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: state.revision,
          affectedRange: request.range,
        }
      }

      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: request.range,
      }
    },
    async clearRange(request) {
      beginUndoableMutation(state)
      applyClearRange(state, request)
      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: {
          rowStart: request.range.rowStart,
          rowEnd: request.range.rowEnd,
          colStart: request.range.colStart,
          colEnd: request.range.colEnd,
        },
      }
    },
  }
}
