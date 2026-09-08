import type { ProjectionViewport, VisibleProjectionResult } from '../backend'

/** 在进入像素循环前拒绝 NaN、零尺寸及无界视口。 */
export function validProjectionViewport(value: unknown): value is ProjectionViewport {
  if (!value || typeof value !== 'object') return false
  const v = value as ProjectionViewport
  return (
    [v.height, v.width, v.rowHeight, v.colWidth].every(Number.isFinite) &&
    v.height >= 0 &&
    v.width >= 0 &&
    v.height <= 50_000 &&
    v.width <= 50_000 &&
    v.rowHeight >= 1 &&
    v.colWidth >= 1
  )
}

/** 冻结小块只能含所在窗格内的坐标，所有块共同受可见格预算约束。 */
export function validFrozenProjection(result: VisibleProjectionResult, maxCells: number): boolean {
  const { frozen, freeze } = result
  if (!frozen) return frozen === undefined
  if (
    !freeze ||
    !Number.isFinite(frozen.height) ||
    !Number.isFinite(frozen.width) ||
    frozen.height < 0 ||
    frozen.width < 0 ||
    !Array.isArray(frozen.regions) ||
    frozen.regions.length > maxCells
  )
    return false
  let count = 0
  for (const region of frozen.regions) {
    if (!region || !region.window || !Array.isArray(region.cells)) return false
    const { rowStart, rowEnd, colStart, colEnd } = region.window
    if (
      ![rowStart, rowEnd, colStart, colEnd].every(Number.isSafeInteger) ||
      rowStart < 0 ||
      colStart < 0 ||
      rowEnd < rowStart ||
      colEnd < colStart ||
      rowEnd >= 1_048_576 ||
      colEnd >= 16_384
    )
      return false
    const top = rowEnd < freeze.rows
    const left = colEnd < freeze.cols
    const inPane = {
      corner: top && left,
      top: top && colStart >= freeze.cols &&
        colStart >= result.window.colStart && colEnd <= result.window.colEnd,
      left: left && rowStart >= freeze.rows &&
        rowStart >= result.window.rowStart && rowEnd <= result.window.rowEnd,
    }
    if (inPane[region.pane] !== true) return false
    const area = (rowEnd - rowStart + 1) * (colEnd - colStart + 1)
    count += area
    if (
      count > maxCells ||
      region.cells.length > area ||
      region.cells.some(
        (cell) =>
          !Number.isSafeInteger(cell.row) ||
          !Number.isSafeInteger(cell.col) ||
          cell.row < rowStart ||
          cell.row > rowEnd ||
          cell.col < colStart ||
          cell.col > colEnd,
      )
    )
      return false
  }
  return true
}
