import type { CellRange } from '../shared'
import type { DisplayCell } from '../backend/projection-primitives'
import type { SpreadsheetBorderSpec, SpreadsheetCellFormat } from '../backend/cell-format'
import type { VisibleProjectionResult } from '../backend/projection-contracts'

const WEIGHT = { none: 100, thin: 10, dotted: 8, dashed: 9, medium: 20, thick: 30, double: 31 }

/** 旧数据没有先后顺序：明确清除优先，其次线宽，同档由上／左格确定。新写入由 Rust 同步。 */
export function sharedBorder(a?: SpreadsheetBorderSpec, b?: SpreadsheetBorderSpec) {
  if (!a) return b
  if (!b) return a
  return WEIGHT[a.style] >= WEIGHT[b.style] ? a : b
}

/** 只拼同一投影的可见数据，避免冻结接缝两边各自画线；不保留工作簿状态。 */
export function createCellBorderResolver({
  cells, window: cellWindow, rowHeights, columnWidths, projection, scrollTop, scrollLeft,
  isCellVisible,
}: {
  cells: readonly DisplayCell[]; window: CellRange
  rowHeights?: readonly number[]; columnWidths?: readonly number[]
  projection?: VisibleProjectionResult; scrollTop: number; scrollLeft: number
  /** 渲染端的裁剪结果；缓存中存在的格不一定仍能画出共边。 */
  isCellVisible?: (row: number, col: number) => boolean
}) {
  const ownProjection = projection && (projection.cells === cells ||
    projection.frozen?.regions.some((region) => region.cells === cells)) ? projection : undefined
  const all = new Map((ownProjection
    ? [
      ...ownProjection.cells,
      ...ownProjection.mergeBorderCells ?? [],
      ...ownProjection.frozen?.regions.flatMap((region) => region.cells) ?? [],
      ...ownProjection.frozen?.regions.flatMap((region) => region.mergeBorderCells ?? []) ?? [],
    ]
    : cells).map((cell) => [`${cell.row}:${cell.col}`, cell.format]))
  const rows = Array.from(
    { length: Math.max(0, cellWindow.rowEnd - cellWindow.rowStart + 1) }, (_, i) => i,
  )
    .filter((i) => rowHeights?.[i] !== 0).map((i) => i + cellWindow.rowStart)
  const cols = Array.from(
    { length: Math.max(0, cellWindow.colEnd - cellWindow.colStart + 1) }, (_, i) => i,
  )
    .filter((i) => columnWidths?.[i] !== 0).map((i) => i + cellWindow.colStart)
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
  const merges = ownProjection?.mergedRanges?.map((range) => ({
    range,
    firstRow: after(range.rowStart, range.rowEnd, hiddenRows),
    lastRow: before(range.rowEnd, hiddenRows),
    firstCol: after(range.colStart, range.colEnd, hiddenCols),
    lastCol: before(range.colEnd, hiddenCols),
  }))
  const format = (
    row: number | undefined, col: number | undefined, current?: SpreadsheetCellFormat,
  ): SpreadsheetCellFormat | undefined => {
    if (row === undefined || col === undefined) return undefined
    const raw = current ?? all.get(`${row}:${col}`)
    const visible = merges?.find(({ range: m }) =>
      row >= m.rowStart && row <= m.rowEnd && col >= m.colStart && col <= m.colEnd)
    if (!visible) return raw
    const merge = visible.range
    const anchor = anchors.get(`${merge.rowStart}:${merge.colStart}`)?.borders
    const edge = (r: number, c: number, side: 'top' | 'bottom' | 'left' | 'right') =>
      (r === row && c === col ? raw : all.get(`${r}:${c}`))?.borders?.[side] ?? anchor?.[side]
    // 锚点是旧合并格式的默认值；原生边段（包括显式 none）优先，不把内侧画成外沿。
    return { ...raw, borders: {
      top: row === merge.rowStart || row === visible.firstRow ? edge(merge.rowStart, col, 'top') : undefined,
      bottom: row === merge.rowEnd || row === visible.lastRow ? edge(merge.rowEnd, col, 'bottom') : undefined,
      left: col === merge.colStart || col === visible.firstCol ? edge(row, merge.colStart, 'left') : undefined,
      right: col === merge.colEnd || col === visible.lastCol
        ? edge(row, merge.colEnd, 'right') : undefined,
    } }
  }

  return (row: number, col: number, current?: SpreadsheetCellFormat) => {
    current = format(row, col, current)
    const ri = rowPosition.get(row)!, ci = colPosition.get(col)!
    // 合并外沿可在隐藏轴上；普通格保持索引查找，仅这类外沿查相邻可见坐标。
    const top = (ri === undefined ? rows.findLast((r) => r < row) : rows[ri - 1]) ??
      (scrollTop === 0 && after(row, cellWindow.rowEnd, hiddenRows) === bodyRow
        ? frozenRow : undefined)
    const left = (ci === undefined ? cols.findLast((c) => c < col) : cols[ci - 1]) ??
      (scrollLeft === 0 && after(col, cellWindow.colEnd, hiddenCols) === bodyCol
        ? frozenCol : undefined)
    const bottom = (ri === undefined ? rows.find((r) => r > row) : rows[ri + 1]) ??
      (scrollTop === 0 && row === frozenRow ? bodyRow : undefined)
    const right = (ci === undefined ? cols.find((c) => c > col) : cols[ci + 1]) ??
      (scrollLeft === 0 && col === frozenCol ? bodyCol : undefined)
    const borders = {
      top: sharedBorder(format(top, col)?.borders?.bottom, current?.borders?.top),
      left: sharedBorder(format(row, left)?.borders?.right, current?.borders?.left),
      bottom: sharedBorder(current?.borders?.bottom, format(bottom, col)?.borders?.top),
      right: sharedBorder(current?.borders?.right, format(row, right)?.borders?.left),
    }
    return {
      borders,
      suppressTop: top !== undefined && (isCellVisible?.(top, col) ?? true),
      suppressLeft: left !== undefined && (isCellVisible?.(row, left) ?? true),
    }
  }
}
