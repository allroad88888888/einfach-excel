import type { VisibleProjectionResult } from '../backend'

/** 窗口外逻辑边只有在中间全为隐藏轴时才与窗口边界重合。 */
export function isCollapsedOutside(
  edge: number, start: number, end: number, hidden: ReadonlySet<number>,
) {
  if (edge >= start && edge <= end) return false
  const lo = edge < start ? edge : end + 1, hi = edge < start ? start - 1 : edge
  for (let index = lo; index <= hi; index++) if (!hidden.has(index)) return false
  return true
}

/** 补充数据只允许合并外沿样式，不能绕过普通 cells 的坐标及数量边界。 */
export function validMergeBorderCells(result: VisibleProjectionResult, maxCells: number): boolean {
  const rows = new Set([
    ...result.visibility?.manualRows ?? [], ...result.visibility?.filterRows ?? [],
    ...result.visibility?.outlineRows ?? [],
  ])
  const cols = new Set([
    ...result.visibility?.manualColumns ?? [], ...result.visibility?.outlineColumns ?? [],
  ])
  let count = 0
  for (const region of [result, ...result.frozen?.regions ?? []]) {
    const cells = region.mergeBorderCells
    if (cells === undefined) continue
    if (!Array.isArray(cells) || (count += cells.length) > maxCells) return false
    const seen = new Set<string>()
    for (const cell of cells) {
      if (!cell || !Number.isSafeInteger(cell.row) || !Number.isSafeInteger(cell.col) ||
        cell.row < 0 || cell.row >= 1_048_576 || cell.col < 0 || cell.col >= 16_384 ||
        cell.displayValue !== '' || !cell.format?.borders || seen.has(`${cell.row}:${cell.col}`)) return false
      seen.add(`${cell.row}:${cell.col}`)
      const w = region.window
      if (!result.mergedRanges?.some((m) => {
        const inside = cell.row >= m.rowStart && cell.row <= m.rowEnd &&
          cell.col >= m.colStart && cell.col <= m.colEnd
        const horizontal = (cell.row === m.rowStart || cell.row === m.rowEnd) &&
          cell.col >= w.colStart && cell.col <= w.colEnd &&
          isCollapsedOutside(cell.row, w.rowStart, w.rowEnd, rows)
        const vertical = (cell.col === m.colStart || cell.col === m.colEnd) &&
          cell.row >= w.rowStart && cell.row <= w.rowEnd &&
          isCollapsedOutside(cell.col, w.colStart, w.colEnd, cols)
        return inside && (horizontal || vertical)
      })) return false
    }
  }
  return true
}
