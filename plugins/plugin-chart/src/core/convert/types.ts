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

/** 提示框里转换器自己造出来的词（统计量等）；转换器是纯函数，译文由调用方传入。 */
export interface ChartWords {
  readonly max: string
  readonly q3: string
  readonly median: string
  readonly q1: string
  readonly min: string
  readonly mean: string
  readonly outlier: string
  readonly count: string
  /** 趋势线图例名里的类型词。 */
  readonly linear: string
  readonly exponential: string
  readonly logarithmic: string
  readonly polynomial: string
  readonly power: string
  /** 跟在周期数之后：「2 周期 移动平均」。 */
  readonly movingAverage: string
}

export const DEFAULT_CHART_WORDS: ChartWords = {
  max: 'Max', q3: 'Q3', median: 'Median', q1: 'Q1', min: 'Min', mean: 'Mean',
  outlier: 'Outlier', count: 'Count', linear: 'Linear', exponential: 'Expon.',
  logarithmic: 'Log.', polynomial: 'Poly.', power: 'Power', movingAverage: 'per. Mov. Avg.',
}

/** 转换器只读这几样；同输入同输出，不碰 DOM、不读 atom。 */
export interface ConvertInput {
  readonly spec: ChartSpec
  readonly data: ChartData
  readonly theme: ChartTheme
  readonly words?: ChartWords
}

/** 一个数据点：value 用于绘制，label 是单元格显示文本（保持单元格数字格式）。 */
export interface ChartPoint {
  readonly value: number | null | readonly [number | null, number | null]
  readonly label: string
  readonly name?: string
  /**
   * 跳过了空值的点（饼图扇区、散点）对应的类别序号：饼图按它取用户配色，
   * 点击数据点时按它找回源单元格。
   */
  readonly slot?: number
}

/** 配置加工步骤：拿到上一步的 option，返回加工后的新 option。 */
export type OptionOperator = (option: ChartOption, input: ConvertInput) => ChartOption
