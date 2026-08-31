// 一句话：剪贴板复制粘贴端口。

import type {
  PasteRangeRequest,
  PasteRangeResult,
  RangeTsvChunkConsumer,
  RangeTsvChunkExportResult,
  RangeTsvExportRequest,
  RangeTsvExportResult,
} from '@einfach/spreadsheet-ui-core'
import { pasteRangeThroughWorker, workerPasteRangeSupportedKinds } from '../paste'
import { consumeExportRangeTsvChunks, exportRangeTsv } from '../tsv-export'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createClipboardPorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'exportRangeTsv' | 'consumeExportRangeTsvChunks' | 'pasteRange' | 'pasteRangeSupportedKinds'
> {
  return {
    async exportRangeTsv(request: RangeTsvExportRequest): Promise<RangeTsvExportResult> {
      return exportRangeTsv(state, request)
    },

    async consumeExportRangeTsvChunks(
      request: RangeTsvExportRequest,
      onChunk: RangeTsvChunkConsumer,
    ): Promise<RangeTsvChunkExportResult> {
      return consumeExportRangeTsvChunks(state, request, onChunk)
    },

    /**
     * Parity #11 — Paste Special (see `pasteRangeThroughWorker`). The
     * exact ACK echoes kind/sheetId/requestId plus revision and the
     * clamped affectedRange so UI-core's strict acknowledgement chain
     * (`acknowledgementMatches` → history → refresh) can complete, and
     * each call records ONE before/after transaction on the
     * host-orchestrated undo log (values and, on format-capable
     * runtimes, formats).
     */
    async pasteRange(request: PasteRangeRequest): Promise<PasteRangeResult> {
      return pasteRangeThroughWorker(state, request)
    },

    get pasteRangeSupportedKinds() {
      return workerPasteRangeSupportedKinds(state)
    },
  }
}
