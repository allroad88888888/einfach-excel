import { useAtomValue } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { useMemo } from 'react'
import { chartGridsAtom, chartIssue, chartTheme, isPlottable, layoutChartData, parseChartSpec,
  toEChartsOption, visibleChartGrid } from './core'
import { trendWordLabels } from './design-messages'
import { labels, wordLabels } from './messages'

/** 一张图表的设置、数据格与 ECharts 配置；画布与导出共用，保证导出图与屏幕一致。 */
export function useChartOption(drawing: SheetDrawing) {
  const { i18n } = useLingui()
  const entry = useAtomValue(chartGridsAtom)[drawing.id]
  const spec = useMemo(() => parseChartSpec(drawing.payload), [drawing.payload])
  const seriesWord = i18n._(labels.series)
  const data = useMemo(() => entry?.grid
    ? layoutChartData(visibleChartGrid(entry.grid, entry.hidden, spec), spec,
      (index) => `${seriesWord} ${index + 1}`) : null,
  [entry?.grid, entry?.hidden, spec, seriesWord])
  const words = useMemo(() => ({
    max: i18n._(wordLabels.max), q3: i18n._(wordLabels.q3), median: i18n._(wordLabels.median),
    q1: i18n._(wordLabels.q1), min: i18n._(wordLabels.min), mean: i18n._(wordLabels.mean),
    outlier: i18n._(wordLabels.outlier), count: i18n._(wordLabels.count),
    linear: i18n._(trendWordLabels.linear), exponential: i18n._(trendWordLabels.exponential),
    logarithmic: i18n._(trendWordLabels.logarithmic),
    polynomial: i18n._(trendWordLabels.polynomial), power: i18n._(trendWordLabels.power),
    movingAverage: i18n._(trendWordLabels.movingAverage),
  }), [i18n])
  const option = useMemo(() => data
    ? toEChartsOption({ spec, data, theme: chartTheme(false), words }) : null,
  [data, spec, words])
  // 数据形状不满足类型约定（如股价图的系列数）时给出错误，不画图。
  const issue = data ? chartIssue(spec, data) : null
  const plottable = !issue && Boolean(data && isPlottable(spec, data))
  return { entry, spec, data, option, plottable, issue }
}
