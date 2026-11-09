import type { CellRange, DrawingRange } from '@einfach-excel/spreadsheet-ui-core'
import { areaLayout, combineAreaGrids } from './areas'
import type { ChartSpec } from './spec'
import { visibleChartGrid, type ChartHidden } from './visible-grid'

/** 图表数据表里一格对应的工作表单元格。 */
export interface SourceCell {
  readonly sheetId: string
  readonly row: number
  readonly col: number
}
type Table = readonly (readonly SourceCell[])[]
type Layout = Pick<ChartSpec, 'seriesIn' | 'headerRow' | 'headerCol' | 'showHidden'>

function areaCells(area: DrawingRange, ownerId: string): SourceCell[][] {
  const sheetId = area.sheetId ?? ownerId
  return Array.from({ length: area.endRow - area.startRow + 1 }, (_row, row) =>
    Array.from({ length: area.endCol - area.startCol + 1 }, (_col, col) =>
      ({ sheetId, row: area.startRow + row, col: area.startCol + col })))
}

function transpose<T>(grid: readonly (readonly T[])[]): T[][] {
  const width = Math.max(0, ...grid.map((row) => row.length))
  return Array.from({ length: width }, (_, col) => grid.flatMap((row) =>
    row[col] === undefined ? [] : [row[col]!]))
}

/**
 * 与数据格走同一条链（多区域拼接 → 去掉隐藏行列 → 按行时转置），得到「系列沿列」的坐标表：
 * 第 r 行第 c 列就是 layoutChartData 里同一位置那一格的来源。`hidden` 为 undefined 时不去隐藏行列。
 */
export function sourceTable(areas: readonly DrawingRange[], ownerId: string, spec: Layout,
  hidden?: ChartHidden): Table | null {
  const layout = areaLayout(areas)
  if (!layout || !areas.length) return null
  const combined = combineAreaGrids(areas.map((area) => areaCells(area, ownerId)), layout)
  const visible = visibleChartGrid(combined, hidden, spec)
  return spec.seriesIn === 'columns' ? visible : transpose(visible)
}

/** 转置后的表头：按行时首列（headerCol）变成名称行。 */
function headers(spec: Layout) {
  const rows = spec.seriesIn === 'rows'
  return { top: Number(rows ? spec.headerCol : spec.headerRow),
    left: Number(rows ? spec.headerRow : spec.headerCol) }
}

/** 第 series 个系列的第 point 个类别（饼图扇区、散点用类别序号）对应的单元格。 */
export function pointCell(table: Table, spec: Layout, series: number,
  point: number): SourceCell | null {
  const { top, left } = headers(spec)
  return table[point + top]?.[series + left] ?? null
}

export interface SourceRoles {
  readonly names: SourceCell[]
  readonly categories: SourceCell[]
  readonly values: SourceCell[]
}

/** 同 Excel 选中图表时的数据源标色：系列名、类别、数值三类。 */
export function sourceRoles(table: Table, spec: Layout): SourceRoles {
  const { top, left } = headers(spec)
  const roles: SourceRoles = { names: [], categories: [], values: [] }
  table.forEach((row, r) => row.forEach((cell, c) => {
    if (r < top && c >= left) roles.names.push(cell)
    else if (r >= top && c < left) roles.categories.push(cell)
    else if (r >= top) roles.values.push(cell)
  }))
  return roles
}

/** 一组单元格合并成尽量少的矩形：先按行连成横段，再把上下相接、左右对齐的横段并起来。 */
export function cellRanges(cells: readonly SourceCell[]):
  { readonly sheetId: string; readonly range: CellRange }[] {
  const sorted = [...cells].sort((a, b) =>
    a.sheetId.localeCompare(b.sheetId) || a.row - b.row || a.col - b.col)
  const runs: { sheetId: string; range: CellRange }[] = []
  for (const cell of sorted) {
    const last = runs[runs.length - 1]
    if (last && last.sheetId === cell.sheetId && last.range.rowStart === cell.row &&
      last.range.colEnd === cell.col - 1) last.range = { ...last.range, colEnd: cell.col }
    else runs.push({ sheetId: cell.sheetId,
      range: { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col } })
  }
  const merged: { sheetId: string; range: CellRange }[] = []
  for (const run of runs) {
    const above = merged.find((item) => item.sheetId === run.sheetId &&
      item.range.rowEnd === run.range.rowStart - 1 && item.range.colStart === run.range.colStart &&
      item.range.colEnd === run.range.colEnd)
    if (above) above.range = { ...above.range, rowEnd: run.range.rowEnd }
    else merged.push(run)
  }
  return merged
}
