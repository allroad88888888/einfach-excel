// 一句话：核对原生 AutoFill 的回执并在不符时回滚验像。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import type { AutoFillRangeWire, AutoFillReportWire, SparseRangeWire } from '../worker-protocol'
import { captureUndoImage } from './transaction-log'
import type { WorkerUndoImage } from './transaction-record'
import type { WorkerBackendState } from './state'

export function sameAutoFillReportRange(
  actual: AutoFillRangeWire | null | undefined,
  expected: CellRange,
): boolean {
  return (
    actual !== null &&
    actual !== undefined &&
    actual.startRow === expected.rowStart &&
    actual.endRow === expected.rowEnd &&
    actual.startCol === expected.colStart &&
    actual.endCol === expected.colEnd
  )
}

export function autoFillRangeArea(range: CellRange): number {
  return (
    (range.rowEnd - range.rowStart + 1) *
    (range.colEnd - range.colStart + 1)
  )
}

export function isExpectedAutoFillReport(
  report: AutoFillReportWire | null | undefined,
  writeRange: CellRange | null,
): boolean {
  if (writeRange === null) {
    return report?.writeRange === null && report.written === 0
  }
  return (
    report !== null &&
    report !== undefined &&
    sameAutoFillReportRange(report.writeRange, writeRange) &&
    report.written === autoFillRangeArea(writeRange)
  )
}

export function comparableAutoFillImage(image: WorkerUndoImage): string {
  const cells =
    image.cells === null
      ? null
      : [...image.cells].sort(
          (left, right) =>
            left.sheet - right.sheet ||
            left.row - right.row ||
            left.col - right.col ||
            left.kind.localeCompare(right.kind),
        )
  const format =
    image.format === null
      ? null
      : {
          ...image.format,
          cellFormats: [...image.format.cellFormats].sort((left, right) =>
            left.addr.localeCompare(right.addr),
          ),
          rangeFormats: [...image.format.rangeFormats].sort(
            (left, right) =>
              left.startRow - right.startRow ||
              left.startCol - right.startCol ||
              left.endRow - right.endRow ||
              left.endCol - right.endCol,
          ),
        }
  return JSON.stringify({ cells, format })
}

export async function restoreAndVerifyAutoFillImage(
  state: WorkerBackendState,
  range: SparseRangeWire,
  before: WorkerUndoImage,
): Promise<boolean> {
  if (before.cells === null || before.format === null) return false
  await state.client.clearRange(range)
  if (before.cells.length > 0) {
    await state.client.restoreSparse(before.cells)
  }
  await state.client.restoreFormatSnapshot(before.format)
  const restored = await captureUndoImage(state, range, { values: true, formats: true })
  return comparableAutoFillImage(restored) === comparableAutoFillImage(before)
}
