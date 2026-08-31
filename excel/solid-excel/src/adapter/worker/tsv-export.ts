// 一句话：把一块区域导出成 TSV（单发或分块）。

import type {
  RangeTsvChunkConsumer,
  RangeTsvChunkExportResult,
  RangeTsvExportRequest,
  RangeTsvExportResult,
} from '@einfach/spreadsheet-ui-core'
import { estimateUtf8Bytes, normalizeCopyAsHiddenRows, toA1 } from '@einfach/spreadsheet-ui-core'
import { filterTsvBandRows } from '../filter-hidden-rows'
import { runtimeSupports } from './capabilities'
import { resolveSheet } from './sheet-ops'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

export async function consumeExportRangeTsvChunks(
  state: WorkerBackendState,
  request: RangeTsvExportRequest,
  onChunk: RangeTsvChunkConsumer,
): Promise<RangeTsvChunkExportResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const sparseRange = toSparseRange(sheet.idx, request.range)
  let chunkCount = 0
  let estimatedBytes = 0

  // Filter-hidden rows are dropped HERE, on the main thread, from the
  // already-serialised band each chunk carries (§8.2). This one insertion
  // point covers all three ways TSV leaves this adapter — the streaming
  // session, the single-shot fallback below, and `exportRangeTsv`, which
  // delegates to this function — so no path can be forgotten.
  //
  // The set never crosses `postMessage`: it is a UI-core view fact and the
  // worker owns data facts. That also makes the fix runtime-agnostic (WASM,
  // TS runtime, any wasm-pkg version) instead of gated on an engine export
  // an older build might not have.
  const hidden = normalizeCopyAsHiddenRows(request.hiddenRows)
  let firstEmittedRow: number | null = null

  async function emitBand(startRow: number, endRow: number, text: string): Promise<void> {
    const band = filterTsvBandRows(text, startRow, endRow, hidden)
    // A band that FILTERING emptied must not be emitted: callers join chunk
    // texts with '\n', so an empty chunk would inject a blank line — exactly
    // the artefact this guard exists to prevent.
    //
    // Conditioned on `hidden.size > 0` on purpose. The WASM runtime's
    // exhausted-session sentinel is a legitimately zero-row band
    // (`endRow = startRow - 1`, `chunk: ''`) that today IS forwarded; with
    // no filter active this branch must not start swallowing it, or the
    // change would not be the identity it claims to be.
    if (hidden.size > 0 && band.rowCount === 0) return
    if (firstEmittedRow === null) firstEmittedRow = band.firstVisibleRow
    if (chunkCount > 0) estimatedBytes += 1
    estimatedBytes += estimateUtf8Bytes(band.text)
    chunkCount += 1
    await onChunk({ startRow, endRow, text: band.text })
  }

  // Chunked sessions are only used when the runtime really streams
  // them (`tsvChunkExport`); otherwise fall back to the single-shot
  // 'exportRangeTsv' command, which honest runtimes DO implement —
  // the old TS-runtime chunk stub silently exported empty strings.
  if (
    typeof state.client.consumeExportRangeTsvChunks === 'function' &&
    runtimeSupports(state, 'tsvChunkExport')
  ) {
    await state.client.consumeExportRangeTsvChunks(
      sparseRange,
      async (chunk) => {
        await emitBand(chunk.startRow, chunk.endRow, chunk.chunk)
      },
      request.rowsPerChunk,
    )
  } else {
    const text = await state.client.exportRangeTsv(sparseRange)
    await emitBand(request.range.rowStart, request.range.rowEnd, text)
  }

  return {
    kind: 'range-tsv-chunks',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
    range: { ...request.range },
    // First EMITTED row, not `range.rowStart` — the marker anchors relative
    // reference shifting on paste, so naming a filtered-away row would
    // offset every pasted formula.
    originAddr: toA1(firstEmittedRow ?? request.range.rowStart, request.range.colStart),
    estimatedBytes,
  }
}

export async function exportRangeTsv(
  state: WorkerBackendState,
  request: RangeTsvExportRequest,
): Promise<RangeTsvExportResult> {
  const chunks: string[] = []
  const result = await consumeExportRangeTsvChunks(state, request, (chunk) => {
    chunks.push(chunk.text)
  })
  const text = chunks.join('\n')

  return {
    kind: 'range-tsv',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: result.revision,
    range: result.range,
    originAddr: result.originAddr,
    text,
    estimatedBytes: result.estimatedBytes ?? estimateUtf8Bytes(text),
  }
}
