import type { ChartSpec } from './spec'

/** 读到的一格：显示文本来自 Rust 数字格式，数值只取数字格。 */
export interface ChartCell {
  readonly display: string
  readonly value: number | null
  readonly kind: 'blank' | 'number' | 'string' | 'boolean' | 'error'
}
export type ChartGrid = readonly (readonly ChartCell[])[]

export interface ChartSeries {
  readonly name: string
  readonly values: readonly (number | null)[]
  /** 与 values 对应的单元格显示文本，用于提示框和数据标签，保持单元格格式。 */
  readonly labels: readonly string[]
}

export interface ChartData {
  readonly categories: readonly string[]
  /** 散点图的 X 数值（首列）；没有名称列时为 null，按序号作 X。 */
  readonly xValues: readonly (number | null)[] | null
  readonly series: readonly ChartSeries[]
}

const BLANK: ChartCell = { display: '', value: null, kind: 'blank' }

function transpose(grid: ChartGrid): ChartGrid {
  const width = Math.max(0, ...grid.map((row) => row.length))
  return Array.from({ length: width }, (_, col) => grid.map((row) => row[col] ?? BLANK))
}

/** 统一转成「系列沿列」再切：首行是系列名，首列是类别。 */
export function layoutChartData(grid: ChartGrid, spec: ChartSpec,
  fallbackName: (index: number) => string): ChartData {
  const byColumns = spec.seriesIn === 'columns'
  const g = byColumns ? grid : transpose(grid)
  const headerRow = byColumns ? spec.headerRow : spec.headerCol
  const headerCol = byColumns ? spec.headerCol : spec.headerRow
  const width = Math.max(0, ...g.map((row) => row.length))
  const cell = (row: number, col: number) => g[row]?.[col] ?? BLANK
  const dataRows = Array.from({ length: Math.max(0, g.length - (headerRow ? 1 : 0)) },
    (_, index) => index + (headerRow ? 1 : 0))
  const firstSeriesCol = headerCol ? 1 : 0
  const series = Array.from({ length: Math.max(0, width - firstSeriesCol) }, (_, index) => {
    const col = index + firstSeriesCol
    return {
      name: (headerRow ? cell(0, col).display.trim() : '') || fallbackName(index),
      values: dataRows.map((row) => cell(row, col).kind === 'number' ? cell(row, col).value : null),
      labels: dataRows.map((row) => cell(row, col).display),
    }
  })
  return {
    categories: dataRows.map((row, index) => headerCol ? cell(row, 0).display : String(index + 1)),
    xValues: headerCol
      ? dataRows.map((row) => cell(row, 0).kind === 'number' ? cell(row, 0).value : null) : null,
    series,
  }
}

const isLabel = (cell: ChartCell | undefined) => cell?.kind === 'string' || cell?.kind === 'blank'

/**
 * 插入时猜布局，规则同 Excel：首行全是文字（或空）且下面有数字 → 首行是名称；
 * 首列全是文字 → 首列是类别；数据行不少于列时系列沿列，否则沿行。
 */
export function detectChartLayout(grid: ChartGrid): Pick<ChartSpec, 'seriesIn' | 'headerRow' | 'headerCol'> {
  const rows = grid.length
  const cols = Math.max(0, ...grid.map((row) => row.length))
  const hasNumber = (cells: readonly (ChartCell | undefined)[]) =>
    cells.some((cell) => cell?.kind === 'number')
  const headerRow = rows > 1 && grid[0]!.every(isLabel) && grid[0]!.some((cell) => cell.kind === 'string')
    && hasNumber(grid.slice(1).flat())
  const firstCol = grid.slice(headerRow ? 1 : 0).map((row) => row[0])
  // 左上角空白而首行是名称时，首列即使是数字（如日期）也当类别，同 Excel。
  const headerCol = cols > 1 && (
    (firstCol.every(isLabel) && firstCol.some((cell) => cell?.kind === 'string')) ||
    (headerRow && grid[0]![0]?.kind === 'blank'))
  const dataRows = rows - (headerRow ? 1 : 0)
  const dataCols = cols - (headerCol ? 1 : 0)
  return { seriesIn: dataRows >= dataCols ? 'columns' : 'rows', headerRow, headerCol }
}
