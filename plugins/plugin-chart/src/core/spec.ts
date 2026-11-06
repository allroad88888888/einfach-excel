/** 图表设置是浮动对象的插件载荷；核心只存不解释，这里是唯一解释处。 */
export const CHART_KIND = 'chart'

export const CHART_TYPES =
  ['column', 'bar', 'line', 'area', 'combo', 'pie', 'doughnut', 'scatter'] as const
/** 「更多图表」菜单里的类型：数据约定各不相同，样式全由各自的转换器负责。 */
export const MORE_CHART_TYPES = ['radar', 'funnel', 'waterfall', 'histogram', 'boxplot', 'stock',
  'treemap', 'sunburst'] as const
export const ALL_CHART_TYPES = [...CHART_TYPES, ...MORE_CHART_TYPES] as const
export type ChartType = (typeof ALL_CHART_TYPES)[number]
export const LEGEND_POSITIONS = ['right', 'bottom', 'top', 'left', 'none'] as const
export type LegendPosition = (typeof LEGEND_POSITIONS)[number]
export const STACK_MODES = ['none', 'stacked', 'percent'] as const
export type StackMode = (typeof STACK_MODES)[number]
export const EMPTY_CELL_MODES = ['gap', 'zero', 'connect'] as const
export type EmptyCellMode = (typeof EMPTY_CELL_MODES)[number]

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
  /** 图表文字字号（8–24）；null 跟随默认 12。 */
  readonly fontSize: number | null
  /** 按系列（饼图按扇区）覆盖颜色；null 用主题配色。 */
  readonly colors: readonly (string | null)[]
  /** 组合图逐系列设置；缺省项按 Excel 默认（最后一个系列是线、在次坐标轴）。 */
  readonly combo: readonly ComboSeriesOption[]
  /** 空单元格：留空断开 / 视为 0 / 用线连接（折线类）。 */
  readonly emptyCells: EmptyCellMode
  /** 绘制隐藏行列中的数据；默认同 Excel 不绘制。 */
  readonly showHidden: boolean
}

export interface ComboSeriesOption {
  readonly kind?: 'column' | 'line'
  readonly secondary?: boolean
}

export const DEFAULT_CHART_SPEC: ChartSpec = {
  type: 'column', title: '', seriesIn: 'columns', headerRow: true, headerCol: true,
  legend: 'right', stack: 'none', dataLabels: false, gridlines: true,
  xTitle: '', yTitle: '', yMin: null, yMax: null, fontSize: null, colors: [], combo: [],
  emptyCells: 'gap', showHidden: false,
}

export const MAX_CHART_TITLE_CHARS = 255
export const MIN_CHART_FONT_SIZE = 8
export const MAX_CHART_FONT_SIZE = 24
const MAX_COLORS = 64
const HEX_COLOR = /^#[0-9a-f]{6}$/i

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
    type: oneOf(ALL_CHART_TYPES, source.type, d.type),
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
    fontSize: typeof source.fontSize === 'number' && Number.isInteger(source.fontSize) &&
      source.fontSize >= MIN_CHART_FONT_SIZE && source.fontSize <= MAX_CHART_FONT_SIZE
      ? source.fontSize : null,
    colors: Array.isArray(source.colors)
      ? source.colors.slice(0, MAX_COLORS).map((color) =>
        typeof color === 'string' && HEX_COLOR.test(color) ? color.toLowerCase() : null)
      : [],
    combo: Array.isArray(source.combo)
      ? source.combo.slice(0, MAX_COLORS).map(parseComboOption) : [],
    emptyCells: oneOf(EMPTY_CELL_MODES, source.emptyCells, d.emptyCells),
    showHidden: flag(source.showHidden, d.showHidden),
  }
}

function parseComboOption(value: unknown): ComboSeriesOption {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    ...(source.kind === 'column' || source.kind === 'line' ? { kind: source.kind } : {}),
    ...(typeof source.secondary === 'boolean' ? { secondary: source.secondary } : {}),
  }
}

/** 组合图第 index 个系列的实际类型与坐标轴（含默认值）。 */
export function comboSeriesKind(spec: ChartSpec, index: number, count: number) {
  const last = count > 1 && index === count - 1
  const option = spec.combo[index] ?? {}
  return {
    kind: option.kind ?? (last ? 'line' : 'column'),
    secondary: option.secondary ?? last,
  } as const
}

/** 饼图、圆环、散点、组合图以及所有「更多图表」没有堆积选项。 */
export function supportsStack(type: ChartType): boolean {
  return type === 'column' || type === 'bar' || type === 'line' || type === 'area'
}

const AXISLESS: readonly ChartType[] = ['pie', 'doughnut', 'radar', 'funnel', 'treemap', 'sunburst']

/** 有直角坐标轴（坐标轴标题、网格线、上下限才有意义）。 */
export function hasAxes(type: ChartType): boolean {
  return !AXISLESS.includes(type)
}

/** 空单元格选项只对按类别连续取值的柱线面积组合图有意义。 */
export function usesEmptyCells(type: ChartType): boolean {
  return type === 'column' || type === 'bar' || type === 'line' || type === 'area' || type === 'combo'
}

const NO_LEGEND: readonly ChartType[] = ['waterfall', 'histogram', 'boxplot', 'stock', 'treemap',
  'sunburst']

/** 图例有内容可列：系列、扇区、漏斗层；单系列或层级图没有。 */
export function hasLegend(type: ChartType): boolean {
  return !NO_LEGEND.includes(type)
}

/** 箱线图、股价图的数据标签没有对应的单点数值，不提供该开关。 */
export function hasDataLabels(type: ChartType): boolean {
  return type !== 'boxplot' && type !== 'stock'
}

/** 这些类型的配色、数据标签、提示框由转换器自己生成，通用装饰步骤不再改写。 */
export function ownsStyle(type: ChartType): boolean {
  return (MORE_CHART_TYPES as readonly ChartType[]).includes(type)
}
