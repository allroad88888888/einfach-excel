import { LIGHT_CHART_THEME, toEChartsOption, type ChartOption } from '../src/core/convert'
import type { ChartData, ChartSeries } from '../src/core/series-layout'
import { DEFAULT_CHART_SPEC, type ChartSpec, type ChartType } from '../src/core/spec'

export type Loose = Record<string, unknown>

export const spec = (type: ChartType, over: Partial<ChartSpec> = {}): ChartSpec =>
  ({ ...DEFAULT_CHART_SPEC, type, ...over })

export const series = (name: string, values: (number | null)[], labels?: string[]): ChartSeries =>
  ({ name, values, labels: labels ?? values.map((value) => (value === null ? '' : String(value))) })

/** 数值系列沿用名称列作类别；hasCategory 为 false 时模拟「首列不是类别」。 */
export const chart = (categories: string[], list: ChartSeries[], hasCategory = true): ChartData =>
  ({ categories, xValues: hasCategory ? categories.map(() => null) : null, series: list })

/** 文字列：数值全为 null，labels 是单元格原文，用作层级类别列。 */
export const textColumn = (name: string, cells: string[]): ChartSeries =>
  ({ name, values: cells.map(() => null), labels: cells })

export const build = (type: ChartType, data: ChartData, over: Partial<ChartSpec> = {}):
  ChartOption => toEChartsOption({ spec: spec(type, over), data, theme: LIGHT_CHART_THEME })

export const list = (option: ChartOption) => option.series as unknown as Loose[]
export const at = (value: unknown) => value as Loose
export const tooltip = (option: ChartOption) =>
  (option.tooltip as { formatter: (params: unknown) => string })
