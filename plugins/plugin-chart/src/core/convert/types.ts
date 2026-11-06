import type { EChartsOption } from 'echarts'
import type { ChartData } from '../series-layout'
import type { ChartSpec } from '../spec'

export type ChartOption = EChartsOption

export interface ChartTheme {
  readonly palette: readonly string[]
  readonly text: string
  readonly muted: string
  readonly axisLine: string
  readonly gridline: string
  readonly background: string
  readonly fontFamily: string
}

/** 转换器只读这三样；同输入同输出，不碰 DOM、不读 atom。 */
export interface ConvertInput {
  readonly spec: ChartSpec
  readonly data: ChartData
  readonly theme: ChartTheme
}

/** 一个数据点：value 用于绘制，label 是单元格显示文本（保持单元格数字格式）。 */
export interface ChartPoint {
  readonly value: number | null | readonly [number | null, number | null]
  readonly label: string
  readonly name?: string
}

/** 配置加工步骤：拿到上一步的 option，返回加工后的新 option。 */
export type OptionOperator = (option: ChartOption, input: ConvertInput) => ChartOption
