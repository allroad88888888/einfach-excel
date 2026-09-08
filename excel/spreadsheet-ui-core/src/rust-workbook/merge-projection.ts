import type { DisplayCell, VisibleProjectionResult } from '../backend'
import { toA1 } from '../backend'
import type { CellRange } from '../shared'
import { displayCell } from './cell-io'
import { applyVisibleFormats } from './format-projection'
import type { WasmWorkbook } from './wasm-types'

/** 合并只投影矩形及相交锚点，不枚举合并区域内的全部覆盖格。 */
export function readMergeProjection(
  workbook: WasmWorkbook,
  sheet: number,
  window: CellRange,
): Pick<VisibleProjectionResult, 'mergedRanges' | 'mergeAnchors'> {
  if (!workbook.merged_ranges) return {}
  const coordinates = workbook.merged_ranges(sheet)
  if (coordinates.length % 4 !== 0) throw new Error('Invalid Rust merge geometry.')
  const mergedRanges: CellRange[] = []
  const mergeAnchors: DisplayCell[] = []
  for (let i = 0; i < coordinates.length; i += 4) {
    const [rowStart, colStart, rowEnd, colEnd] = Array.from(
      { length: 4 },
      (_, offset) => coordinates[i + offset],
    )
    if (
      ![rowStart, colStart, rowEnd, colEnd].every(Number.isSafeInteger) ||
      rowStart < 0 ||
      colStart < 0 ||
      rowEnd < rowStart ||
      colEnd < colStart ||
      rowEnd >= 1_048_576 ||
      colEnd >= 16_384 ||
      (rowStart === rowEnd && colStart === colEnd)
    )
      throw new Error('Invalid Rust merge geometry.')
    const range = { rowStart, colStart, rowEnd, colEnd }
    mergedRanges.push(range)
    if (
      rowStart > window.rowEnd ||
      rowEnd < window.rowStart ||
      colStart > window.colEnd ||
      colEnd < window.colStart
    )
      continue
    const cell = displayCell(workbook.snapshotCell(sheet, toA1(rowStart, colStart))) ?? {
      row: rowStart,
      col: colStart,
      displayValue: '',
      valueKind: 'blank' as const,
    }
    if (!workbook.snapshot_format_range) throw new Error('Rust format snapshot is unavailable.')
    const point = { rowStart, colStart, rowEnd: rowStart, colEnd: colStart }
    const formats = workbook.snapshot_format_range(sheet, rowStart, colStart, rowStart, colStart)
    mergeAnchors.push({
      ...applyVisibleFormats([cell], point, formats)[0],
      mergedSpan: { rows: rowEnd - rowStart + 1, cols: colEnd - colStart + 1 },
    })
  }
  return { mergedRanges, mergeAnchors }
}
