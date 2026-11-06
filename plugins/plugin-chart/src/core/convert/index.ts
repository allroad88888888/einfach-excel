import type { ChartType } from '../spec'
import { cartesianOption } from './cartesian'
import { applyDataLabels, applyGrid, applyLegend, applyTheme, applyTitle,
  applyTooltip } from './decorations'
import { pieOption } from './pie'
import { scatterOption } from './scatter'
import type { ChartOption, ConvertInput, OptionOperator } from './types'

const BASE: Record<ChartType, (input: ConvertInput) => ChartOption> = {
  column: cartesianOption,
  bar: cartesianOption,
  line: cartesianOption,
  area: cartesianOption,
  pie: pieOption,
  doughnut: pieOption,
  scatter: scatterOption,
}

/** 顺序有意义：数据标签要在系列建好之后，网格边距要知道标题与图例的位置。 */
const OPERATORS: readonly OptionOperator[] = [
  applyTheme, applyTitle, applyLegend, applyTooltip, applyDataLabels, applyGrid,
]

/**
 * 图表设置 + 已整形的数据 → ECharts 配置。纯函数：按类型生成基础配置，
 * 再经一串小步骤依次加工；不碰 DOM，不读 atom。
 */
export function toEChartsOption(input: ConvertInput): ChartOption {
  return OPERATORS.reduce((option, operate) => operate(option, input), BASE[input.spec.type](input))
}

export type { ChartOption, ChartTheme, ConvertInput } from './types'
export { chartTheme, DARK_CHART_THEME, LIGHT_CHART_THEME } from './theme'
