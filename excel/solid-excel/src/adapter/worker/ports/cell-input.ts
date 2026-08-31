// 一句话：单元格写入端口。

import type {
  BackendMutationResult,
  CellRange,
  ClearRangeRequest,
  ImportCellChunksRequest,
  ImportCellsRequest,
  SetCellInputRequest,
} from '@einfach/spreadsheet-ui-core'
import { toA1 } from '@einfach/spreadsheet-ui-core'
import { createBackendError } from '../backend-error'
import { runtimeSupports } from '../capabilities'
import { boundingRangeOfImportCells, toCellWire } from '../cell-input-wire'
import { importChunks } from '../import'
import { recordCellMutation } from '../record-cell-mutation'
import { bumpRevision } from '../revision'
import { resolveSheet } from '../sheet-ops'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import { toSparseRange } from '../wire-range'
import type { WorkerBackendState } from '../state'

export function createCellInputPorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'setCellInput' | 'importCells' | 'importCellChunks' | 'clearRange'
> {
  return {
    async setCellInput(request: SetCellInputRequest): Promise<BackendMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const addr = toA1(request.row, request.col)
      const trimmed = request.input.trim()
      const cellRange: CellRange = {
        rowStart: request.row,
        rowEnd: request.row,
        colStart: request.col,
        colEnd: request.col,
      }

      return recordCellMutation(state, {
        kind: 'cell.set-input',
        sheet,
        range: cellRange,
        captureValues: true,
        captureFormats: false,
        execute: async () => {
          if (trimmed === '') {
            await state.client.clearCell(sheet.idx, addr)
          } else if (trimmed.startsWith('=')) {
            const result = await state.client.setFormulaDetailed(sheet.idx, addr, trimmed)
            if (!result.ok) throw createBackendError(result.code, result.message)
          } else {
            await state.client.setCell(sheet.idx, addr, toCellWire(request.input))
          }

          const nextRevision = bumpRevision(state)
          return {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision: request.revision ?? nextRevision,
            affectedRange: { ...cellRange },
          }
        },
      })
    },

    async importCells(request: ImportCellsRequest): Promise<BackendMutationResult> {
      return importChunks(state, {
        ...request,
        // The concrete cell list is in hand, so a missing range can be
        // derived instead of degrading the undo record to not-undoable.
        range: request.range ?? boundingRangeOfImportCells(request.cells) ?? undefined,
        kind: 'import-cell-chunks',
        chunks: [request.cells],
      })
    },

    async importCellChunks(request: ImportCellChunksRequest): Promise<BackendMutationResult> {
      return importChunks(state, request)
    },

    async clearRange(request: ClearRangeRequest): Promise<BackendMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const target = request.target ?? 'all'
      const sparseRange = toSparseRange(sheet.idx, request.range)
      const touchesValues = target === 'values' || target === 'all'
      // Runtimes that declare `formats: false` model no formats, so the
      // clear is vacuously complete and the mutation never touches them.
      const touchesFormats =
        (target === 'formats' || target === 'all') && runtimeSupports(state, 'formats')

      return recordCellMutation(state, {
        kind: 'range.clear',
        sheet,
        range: { ...request.range },
        captureValues: touchesValues,
        captureFormats: touchesFormats,
        execute: async () => {
          if (touchesValues) {
            await state.client.clearRange(sparseRange)
          }
          if (touchesFormats) {
            // Rust set_format_range drops per-cell overrides inside the range and a
            // null/default layer makes the rectangle read back as unformatted,
            // which is the contract for 'formats'/'all' clearing.
            await state.client.setFormatRange(sparseRange, null)
          }
          const nextRevision = bumpRevision(state)

          return {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision: request.revision ?? nextRevision,
            affectedRange: {
              rowStart: request.range.rowStart,
              rowEnd: request.range.rowEnd,
              colStart: request.range.colStart,
              colEnd: request.range.colEnd,
            },
          }
        },
      })
    },
  }
}
