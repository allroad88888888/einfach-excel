// 一句话：把单元格流分块导入 worker 工作簿。

import type { BackendMutationResult, ImportCellChunksRequest } from '@einfach/spreadsheet-ui-core'
import type { ImportCellWire } from '../worker-protocol'
import { toImportCellWire } from './cell-input-wire'
import { assertImportStatsOk, normalizeImportCellsPerChunk } from './import-chunking'
import { recordCellMutation } from './record-cell-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import type { WorkerBackendState } from './state'

export async function importChunks(
  state: WorkerBackendState,
  request: ImportCellChunksRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)

  return recordCellMutation(state, {
    kind: 'cells.import',
    sheet,
    range: request.range ? { ...request.range } : null,
    captureValues: true,
    captureFormats: false,
    missingRangeDiagnostic:
      'import request carried no affected range; the undo snapshot cannot be bounded',
    execute: async () => {
      const cellsPerChunk = normalizeImportCellsPerChunk(request.cellsPerChunk)
      const sessionId = await state.client.beginImport({ mode: 'direct' })
      const wireChunk: ImportCellWire[] = []
      let committed = false

      async function flush() {
        if (wireChunk.length === 0) return
        await state.client.importChunk(sessionId, wireChunk.splice(0, wireChunk.length))
      }

      try {
        for await (const sourceChunk of request.chunks) {
          for (const cell of sourceChunk) {
            wireChunk.push(
              toImportCellWire(sheet.idx, cell.row, cell.col, cell.input, cell.preserveAsText),
            )
            if (wireChunk.length >= cellsPerChunk) await flush()
          }
        }
        await flush()
        const stats = await state.client.commitImport(sessionId)
        committed = true
        assertImportStatsOk(stats)
      } finally {
        if (!committed) await state.client.cancelImport(sessionId).catch(() => {})
      }

      const nextRevision = bumpRevision(state)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? nextRevision,
        affectedRange: request.range,
      }
    },
  })
}
