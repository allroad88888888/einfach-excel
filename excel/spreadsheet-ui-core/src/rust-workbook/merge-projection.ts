import type { DisplayCell, VisibleProjectionResult } from '../backend'
import { toA1 } from '../backend'
import type { CellRange } from '../shared'
import { displayCell } from './cell-io'
import { applyVisibleFormats, readDisplayFormats } from './format-projection'
import type { WasmWorkbook } from './wasm-types'
import type { SheetVisibilityProjection } from '../viewport/hidden-state'
import { isCollapsedOutside } from '../projection/merge-border-cells'

/** 合并只投影矩形及相交锚点，不枚举合并区域内的全部覆盖格。 */
export function readMergeProjection(
  workbook: WasmWorkbook,
  sheet: number,
  window: CellRange,
  visibility?: SheetVisibilityProjection,
): Pick<VisibleProjectionResult, 'mergedRanges' | 'mergeAnchors' | 'mergeBorderCells'> {
  if (!workbook.merged_ranges) return {}
  const coordinates = workbook.merged_ranges(sheet)
  if (coordinates.length % 4 !== 0) throw new Error('Invalid Rust merge geometry.')
  const mergedRanges: CellRange[] = []
  const mergeAnchors: DisplayCell[] = []
  const mergeBorderCells = new Map<string, DisplayCell>()
  const hiddenRows = new Set([
    ...visibility?.manualRows ?? [],
    ...visibility?.filterRows ?? [],
    ...visibility?.outlineRows ?? [],
  ])
  const hiddenColumns = new Set([
    ...visibility?.manualColumns ?? [], ...visibility?.outlineColumns ?? [],
  ])
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
    const formats = readDisplayFormats(workbook, sheet, point)
    mergeAnchors.push({
      ...applyVisibleFormats([cell], point, formats)[0],
      mergedSpan: { rows: rowEnd - rowStart + 1, cols: colEnd - colStart + 1 },
    })
    // 逻辑外沿可能落在窗口外的隐藏轴上。只取压缩到窗口边缘的那一行／列样式，
    // 不读隐藏区域内容，也不扩大普通 cells 的窗口契约。
    const strips: CellRange[] = []
    for (const row of new Set([rowStart, rowEnd])) {
      if (isCollapsedOutside(row, window.rowStart, window.rowEnd, hiddenRows)) strips.push({
        rowStart: row, rowEnd: row,
        colStart: Math.max(colStart, window.colStart), colEnd: Math.min(colEnd, window.colEnd),
      })
    }
    for (const col of new Set([colStart, colEnd])) {
      if (isCollapsedOutside(col, window.colStart, window.colEnd, hiddenColumns)) strips.push({
        colStart: col, colEnd: col,
        rowStart: Math.max(rowStart, window.rowStart), rowEnd: Math.min(rowEnd, window.rowEnd),
      })
    }
    for (const strip of strips) {
      const edgeFormats = readDisplayFormats(workbook, sheet, strip)
      for (const edgeCell of applyVisibleFormats([], strip, edgeFormats)) {
        if (edgeCell.format?.borders) mergeBorderCells.set(`${edgeCell.row}:${edgeCell.col}`, {
          row: edgeCell.row, col: edgeCell.col, displayValue: '',
          format: { borders: edgeCell.format.borders },
        })
      }
    }
  }
  return { mergedRanges, mergeAnchors,
    ...(mergeBorderCells.size ? { mergeBorderCells: [...mergeBorderCells.values()] } : {}),
  }
}
