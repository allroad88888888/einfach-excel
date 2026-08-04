import { sparseRangeToTSV } from './range-tsv'
import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import { assertMethod, assertSheet, normalizeSparseCell } from './worker-wire-guards'
import type { SparseCellWire, SparseRangeWire } from './worker-protocol'

/**
 * 把一个区间按行切成块读出来：TSV 文本（导出）与稀疏单元格（快照）两种投影。
 * 会话对象只记"读到哪一行了"，真正的游标推进发生在这里。
 */

const DEFAULT_EXPORT_ROWS_PER_CHUNK = 2048
const MIN_EXPORT_ROWS_PER_CHUNK = 1
const MAX_EXPORT_ROWS_PER_CHUNK = 10_000

export type ExportSession = {
  range: SparseRangeWire
  rowsPerChunk: number
  totalRows: number
  nextRow: number
}

export type SnapshotSession = {
  range: SparseRangeWire
  rowsPerChunk: number
  totalRows: number
  nextRow: number
}

export function clampRowsPerChunk(
  rowsPerChunk: unknown,
  fallback = DEFAULT_EXPORT_ROWS_PER_CHUNK,
): number {
  const normalized = Math.floor(Number(rowsPerChunk))
  if (!Number.isFinite(normalized)) return fallback
  if (normalized < MIN_EXPORT_ROWS_PER_CHUNK) return MIN_EXPORT_ROWS_PER_CHUNK
  if (normalized > MAX_EXPORT_ROWS_PER_CHUNK) return MAX_EXPORT_ROWS_PER_CHUNK
  return normalized
}

export function rangeTotalRows(range: SparseRangeWire): number {
  return Math.max(0, range.endRow - range.startRow + 1)
}

export function exportRangeTsv(wb: WasmWorkbookRuntime, range: SparseRangeWire): string {
  assertSheet(wb, range.sheet)
  const snapshotRangeSparse = assertMethod(wb, 'snapshot_range_sparse')
  const cells = snapshotRangeSparse
    .call(wb, range.sheet, range.startRow, range.startCol, range.endRow, range.endCol)
    .map(normalizeSparseCell)
  return sparseRangeToTSV(cells, range)
}

export function exportRangeTsvChunk(
  wb: WasmWorkbookRuntime,
  session: ExportSession,
): { startRow: number; endRow: number; chunk: string; done: boolean } {
  const range = session.range
  if (session.totalRows === 0 || session.nextRow > range.endRow) {
    return {
      startRow: range.startRow,
      endRow: range.startRow - 1,
      chunk: '',
      done: true,
    }
  }

  const startRow = session.nextRow
  const endRow = Math.min(range.endRow, startRow + session.rowsPerChunk - 1)
  const snapshotRangeSparse = assertMethod(wb, 'snapshot_range_sparse')
  const chunkCells = snapshotRangeSparse
    .call(wb, range.sheet, startRow, range.startCol, endRow, range.endCol)
    .map(normalizeSparseCell)
  session.nextRow = endRow + 1

  return {
    startRow,
    endRow,
    chunk: sparseRangeToTSV(chunkCells, {
      startRow,
      startCol: range.startCol,
      endRow,
      endCol: range.endCol,
    }),
    done: session.nextRow > range.endRow,
  }
}

export function snapshotRangeSparseChunk(
  wb: WasmWorkbookRuntime,
  session: SnapshotSession,
): { startRow: number; endRow: number; cells: SparseCellWire[]; done: boolean } {
  const range = session.range
  if (session.totalRows === 0 || session.nextRow > range.endRow) {
    return {
      startRow: range.startRow,
      endRow: range.startRow - 1,
      cells: [],
      done: true,
    }
  }

  const startRow = session.nextRow
  const endRow = Math.min(range.endRow, startRow + session.rowsPerChunk - 1)
  const snapshotRangeSparse = assertMethod(wb, 'snapshot_range_sparse')
  const cells = snapshotRangeSparse
    .call(wb, range.sheet, startRow, range.startCol, endRow, range.endCol)
    .map(normalizeSparseCell)
  session.nextRow = endRow + 1

  return {
    startRow,
    endRow,
    cells,
    done: session.nextRow > range.endRow,
  }
}
