import type { ChartData } from '../series-layout'
import type { ChartSpec } from '../spec'
import { buildHierarchy, hierarchyColumns } from './hierarchy'

export const STOCK_SERIES_ISSUE =
  'A stock chart needs exactly four number series: open, high, low, close.'
export const HIERARCHY_ISSUE =
  'A treemap or sunburst needs category columns followed by a number column.'

/**
 * 数据形状不满足该图表类型的硬性约定时的错误（英文原文，兼作词条 id）；没有问题返回 null。
 * 此时转换器不画任何系列，视图改显示这条错误，而不是把数据硬凑成一张错图。
 */
export function chartIssue(spec: Pick<ChartSpec, 'type'>, data: ChartData): string | null {
  if (spec.type === 'stock') return data.series.length === 4 ? null : STOCK_SERIES_ISSUE
  if ((spec.type === 'treemap' || spec.type === 'sunburst') && !hierarchyColumns(data))
    return HIERARCHY_ISSUE
  return null
}

/** 有东西可画：至少一个数值；树状图 / 旭日图要有正数行，直方图只看第一个系列。 */
export function isPlottable(spec: Pick<ChartSpec, 'type'>, data: ChartData): boolean {
  const hasNumber = (values: readonly (number | null)[]) => values.some((value) => value !== null)
  if (spec.type === 'treemap' || spec.type === 'sunburst') return buildHierarchy(data).length > 0
  if (spec.type === 'histogram') return hasNumber(data.series[0]?.values ?? [])
  if (spec.type === 'stock') return data.series.length === 4 && data.series.some((s) => hasNumber(s.values))
  return data.series.some((series) => hasNumber(series.values))
}
