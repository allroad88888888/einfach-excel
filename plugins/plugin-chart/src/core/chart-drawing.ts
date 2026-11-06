import type { DrawingRange, SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { recommendChart } from './recommend'
import { detectChartLayout, type ChartGrid } from './series-layout'
import { CHART_KIND, DEFAULT_CHART_SPEC, type ChartType } from './spec'

export const DEFAULT_CHART_WIDTH = 480
export const DEFAULT_CHART_HEIGHT = 288
const EXCEL_MAX_COLS = 16_384

/** 本表内唯一：chart-1、chart-2…；删除后不复用更小的号也无妨，只要不撞。 */
export function nextChartId(drawings: readonly SheetDrawing[]): string {
  const used = new Set(drawings.map((drawing) => drawing.id))
  let index = drawings.length + 1
  while (used.has(`chart-${index}`)) index += 1
  return `chart-${index}`
}

export interface ChartDrawingInput {
  readonly id: string
  readonly areas: readonly DrawingRange[]
  /** 各区域按 Excel 规则拼好的数据表，用来猜表头、系列方向与推荐类型。 */
  readonly grid: ChartGrid
  readonly requested: ChartType | 'recommended'
}

/** 新图表：按数据猜表头与系列方向，放在数据右侧空一列处，默认尺寸。 */
export function buildChartDrawing({ id, areas, grid, requested }: ChartDrawingInput): SheetDrawing {
  const detected = detectChartLayout(grid)
  const { type, layout } = requested === 'recommended'
    ? recommendChart(grid, detected) : { type: requested, layout: detected }
  return {
    id,
    kind: CHART_KIND,
    anchor: { row: Math.min(...areas.map((area) => area.startRow)),
      col: Math.min(EXCEL_MAX_COLS - 1, Math.max(...areas.map((area) => area.endCol)) + 2),
      offsetX: 0, offsetY: 0, width: DEFAULT_CHART_WIDTH, height: DEFAULT_CHART_HEIGHT },
    refs: areas,
    payload: { ...DEFAULT_CHART_SPEC, ...layout, type },
  }
}
