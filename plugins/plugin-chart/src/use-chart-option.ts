import { useAtomValue } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { useMemo } from 'react'
import { chartGridsAtom, chartTheme, layoutChartData, parseChartSpec, toEChartsOption,
  visibleChartGrid } from './core'
import { labels } from './messages'

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
  const option = useMemo(() => data
    ? toEChartsOption({ spec, data, theme: chartTheme(false) }) : null, [data, spec])
  const plottable = Boolean(data?.series.some((series) =>
    series.values.some((value) => value !== null)))
  return { entry, spec, data, option, plottable }
}
