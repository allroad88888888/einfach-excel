import type { CSSProperties } from 'react'
import type {
  CellRange, DisplayCell, SpreadsheetBorderSpec, SpreadsheetCellFormat, VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { cellFormatStyle } from './cell-format-style'

const WEIGHT = { none: 100, thin: 10, dotted: 8, dashed: 9, medium: 20, thick: 30, double: 31 }

/** 旧数据没有先后顺序：明确清除优先，其次线宽，同档由上／左格确定。新写入由 Rust 同步。 */
export function sharedBorder(a?: SpreadsheetBorderSpec, b?: SpreadsheetBorderSpec) {
  if (!a) return b
  if (!b) return a
  return WEIGHT[a.style] >= WEIGHT[b.style] ? a : b
}

/** 只拼同一投影的可见数据，避免冻结接缝两边各自画线；不保留工作簿状态。 */
export function createGridBorderStyles({
  cells, window, rowHeights, columnWidths, projection, scrollTop, scrollLeft,
}: {
  cells: readonly DisplayCell[]; window: CellRange
  rowHeights?: readonly number[]; columnWidths?: readonly number[]
  projection?: VisibleProjectionResult; scrollTop: number; scrollLeft: number
}) {
  const ownProjection = projection && (projection.cells === cells ||
    projection.frozen?.regions.some((region) => region.cells === cells)) ? projection : undefined
  const all = new Map((ownProjection
    ? [
      ...ownProjection.cells,
      ...ownProjection.frozen?.regions.flatMap((region) => region.cells) ?? [],
    ]
    : cells).map((cell) => [`${cell.row}:${cell.col}`, cell.format]))
  const rows = Array.from({ length: Math.max(0, window.rowEnd - window.rowStart + 1) }, (_, i) => i)
    .filter((i) => rowHeights?.[i] !== 0).map((i) => i + window.rowStart)
  const cols = Array.from({ length: Math.max(0, window.colEnd - window.colStart + 1) }, (_, i) => i)
    .filter((i) => columnWidths?.[i] !== 0).map((i) => i + window.colStart)
  const rowPosition = new Map(rows.map((row, i) => [row, i]))
  const colPosition = new Map(cols.map((col, i) => [col, i]))
  const freeze = ownProjection?.freeze
  const hiddenRows = new Set([
    ...ownProjection?.visibility?.manualRows ?? [], ...ownProjection?.visibility?.filterRows ?? [],
  ])
  const hiddenCols = new Set(ownProjection?.visibility?.manualColumns ?? [])
  const before = (index: number, hidden: ReadonlySet<number>) => {
    while (index >= 0 && hidden.has(index)) index--
    return index >= 0 ? index : undefined
  }
  const after = (index: number, end: number, hidden: ReadonlySet<number>) => {
    while (index <= end && hidden.has(index)) index++
    return index <= end ? index : undefined
  }
  const frozenRow = freeze ? before(freeze.rows - 1, hiddenRows) : undefined
  const frozenCol = freeze ? before(freeze.cols - 1, hiddenCols) : undefined
  const bodyRow = freeze && ownProjection
    ? after(freeze.rows, ownProjection.window.rowEnd, hiddenRows) : undefined
  const bodyCol = freeze && ownProjection
    ? after(freeze.cols, ownProjection.window.colEnd, hiddenCols) : undefined
  const anchors = new Map([
    ...ownProjection?.mergeAnchors ?? [],
    ...ownProjection?.frozen?.regions.flatMap((region) => region.mergeAnchors ?? []) ?? [],
  ].map((cell) => [`${cell.row}:${cell.col}`, cell.format]))
  const format = (
    row: number | undefined, col: number | undefined, current?: SpreadsheetCellFormat,
  ): SpreadsheetCellFormat | undefined => {
    if (row === undefined || col === undefined) return undefined
    const raw = current ?? all.get(`${row}:${col}`)
    const merge = ownProjection?.mergedRanges?.find((m) =>
      row >= m.rowStart && row <= m.rowEnd && col >= m.colStart && col <= m.colEnd)
    if (!merge) return raw
    const anchor = anchors.get(`${merge.rowStart}:${merge.colStart}`)?.borders
    // 锚点是旧合并格式的默认值；原生边段（包括显式 none）优先，不把内侧画成外沿。
    return { ...raw, borders: {
      top: row === merge.rowStart ? raw?.borders?.top ?? anchor?.top : undefined,
      bottom: row === merge.rowEnd ? raw?.borders?.bottom ?? anchor?.bottom : undefined,
      left: col === merge.colStart ? raw?.borders?.left ?? anchor?.left : undefined,
      right: col === merge.colEnd ? raw?.borders?.right ?? anchor?.right : undefined,
    } }
  }

  return (row: number, col: number, current?: SpreadsheetCellFormat): CSSProperties => {
    current = format(row, col, current)
    const ri = rowPosition.get(row)!, ci = colPosition.get(col)!
    const top = rows[ri - 1] ?? (scrollTop === 0 && row === bodyRow ? frozenRow : undefined)
    const left = cols[ci - 1] ?? (scrollLeft === 0 && col === bodyCol ? frozenCol : undefined)
    const bottom = rows[ri + 1] ?? (scrollTop === 0 && row === frozenRow ? bodyRow : undefined)
    const right = cols[ci + 1] ?? (scrollLeft === 0 && col === frozenCol ? bodyCol : undefined)
    const borders = {
      top: sharedBorder(format(top, col)?.borders?.bottom, current?.borders?.top),
      left: sharedBorder(format(row, left)?.borders?.right, current?.borders?.left),
      bottom: sharedBorder(current?.borders?.bottom, format(bottom, col)?.borders?.top),
      right: sharedBorder(current?.borders?.right, format(row, right)?.borders?.left),
    }
    return {
      ...cellFormatStyle({ borders }),
      // 相邻格存在但没有数据也同样占据一个绘制位置；不靠 style 是否非空判断。
      ...(top !== undefined ? { borderTopWidth: '0px' } : {}),
      ...(left !== undefined ? { borderLeftWidth: '0px' } : {}),
    }
  }
}
