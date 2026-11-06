import type { DrawingRange, RustWorkbookDefinition, SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { CHART_DEMO_CELLS } from './data/charts-seed'

const SHEET_ID = 'chart-demo'
const WIDTH = 560
const HEIGHT = 300

const range = (startRow: number, startCol: number, endRow: number, endCol: number): DrawingRange =>
  ({ startRow, startCol, endRow, endCol })

function chart(id: string, row: number, col: number, data: DrawingRange,
  payload: Record<string, unknown>): { sheetId: string; drawing: SheetDrawing } {
  return { sheetId: SHEET_ID, drawing: { id, kind: 'chart',
    anchor: { row, col, offsetX: 0, offsetY: 0, width: WIDTH, height: HEIGHT },
    refs: [data], payload: { seriesIn: 'columns', headerRow: true, headerCol: true, ...payload } } }
}

/**
 * 图表演示：一张数据表 + 五张预置图表（柱形、折线、圆环、散点、堆积条形）。
 * 图表是工作簿里的浮动对象，设置存为对象载荷；启动安装，不进入撤销历史。
 */
export const CHARTS_WORKBOOK: RustWorkbookDefinition = Object.freeze({
  title: 'Charts',
  sheets: [{
    id: SHEET_ID, name: 'Charts', rowCount: 200, colCount: 20,
    colWidths: [{ colIndex: 0, widthPx: 120 }],
    // 标题与说明跨列显示，不被首列截断。
    mergedRanges: [
      { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 9 },
      { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 9 },
    ],
  }],
  drawings: [
    chart('chart-revenue', 16, 0, range(2, 0, 14, 4),
      { type: 'column', title: 'Monthly revenue by region (k)', legend: 'top' }),
    chart('chart-trend', 16, 5, range(2, 0, 14, 4),
      { type: 'line', title: 'Revenue trend', legend: 'bottom', yTitle: 'Revenue (k)' }),
    chart('chart-products', 28, 0, range(2, 6, 7, 7),
      { type: 'doughnut', title: 'Units by product', legend: 'right', dataLabels: true }),
    chart('chart-spend', 28, 5, range(2, 12, 22, 13),
      { type: 'scatter', title: 'Ad spend vs revenue', legend: 'none',
        xTitle: 'Ad spend (k)', yTitle: 'Revenue (k)' }),
    chart('chart-quarters', 40, 0, range(10, 6, 14, 10),
      { type: 'bar', title: 'Quarterly revenue (formulas)', legend: 'bottom', stack: 'stacked' }),
  ],
  createImportChunks: () => [CHART_DEMO_CELLS],
})
