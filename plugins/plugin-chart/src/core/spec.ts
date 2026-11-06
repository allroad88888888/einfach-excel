/** 图表设置是浮动对象的插件载荷；核心只存不解释，这里是唯一解释处。 */
export const CHART_KIND = 'chart'

export const CHART_TYPES = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter'] as const
export type ChartType = (typeof CHART_TYPES)[number]
export const LEGEND_POSITIONS = ['right', 'bottom', 'top', 'left', 'none'] as const
export type LegendPosition = (typeof LEGEND_POSITIONS)[number]
export const STACK_MODES = ['none', 'stacked', 'percent'] as const
export type StackMode = (typeof STACK_MODES)[number]

export interface ChartSpec {
  readonly type: ChartType
  readonly title: string
  /** 系列沿列（每列一个系列）还是沿行。 */
  readonly seriesIn: 'columns' | 'rows'
  /** 首行 / 首列是名称而不是数据。 */
  readonly headerRow: boolean
  readonly headerCol: boolean
  readonly legend: LegendPosition
  readonly stack: StackMode
  readonly dataLabels: boolean
  readonly gridlines: boolean
  readonly xTitle: string
  readonly yTitle: string
  readonly yMin: number | null
  readonly yMax: number | null
}

export const DEFAULT_CHART_SPEC: ChartSpec = {
  type: 'column', title: '', seriesIn: 'columns', headerRow: true, headerCol: true,
  legend: 'right', stack: 'none', dataLabels: false, gridlines: true,
  xTitle: '', yTitle: '', yMin: null, yMax: null,
}

export const MAX_CHART_TITLE_CHARS = 255

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback
const text = (value: unknown) =>
  typeof value === 'string' ? value.slice(0, MAX_CHART_TITLE_CHARS) : ''
const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
const bound = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** 文件或旧版本载荷缺字段、类型不对时回落到默认值，不让一个坏字段使图表消失。 */
export function parseChartSpec(payload: unknown): ChartSpec {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const d = DEFAULT_CHART_SPEC
  const yMin = bound(source.yMin)
  const yMax = bound(source.yMax)
  return {
    type: oneOf(CHART_TYPES, source.type, d.type),
    title: text(source.title),
    seriesIn: source.seriesIn === 'rows' ? 'rows' : 'columns',
    headerRow: flag(source.headerRow, d.headerRow),
    headerCol: flag(source.headerCol, d.headerCol),
    legend: oneOf(LEGEND_POSITIONS, source.legend, d.legend),
    stack: oneOf(STACK_MODES, source.stack, d.stack),
    dataLabels: flag(source.dataLabels, d.dataLabels),
    gridlines: flag(source.gridlines, d.gridlines),
    xTitle: text(source.xTitle),
    yTitle: text(source.yTitle),
    yMin,
    yMax: yMin !== null && yMax !== null && yMax <= yMin ? null : yMax,
  }
}

/** 饼图、圆环、散点没有堆积概念。 */
export function supportsStack(type: ChartType): boolean {
  return type === 'column' || type === 'bar' || type === 'line' || type === 'area'
}

export function hasAxes(type: ChartType): boolean {
  return type !== 'pie' && type !== 'doughnut'
}
