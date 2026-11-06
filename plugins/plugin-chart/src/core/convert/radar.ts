import { slotColor } from './colors'
import { pieCenter } from './pie'
import { escapeHtml } from './text'
import type { ChartOption, ConvertInput } from './types'

/** 轴最大值取「好看」的上界（1、1.5、2、2.5…×10ⁿ），所有系列共用一套刻度，同 Excel。 */
function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  return (Math.ceil((max / magnitude) * 2) / 2) * magnitude
}

/**
 * 雷达图：每个类别（行）是一根轴，每个系列是一圈折线；空值按 0 画。
 * 所有轴共用同一刻度（最小取 0 与数据最小值中较小者）。
 */
export function radarOption(input: ConvertInput): ChartOption {
  const { spec, data, theme } = input
  const all = data.series.flatMap((series) => series.values)
    .filter((value): value is number => value !== null)
  if (data.categories.length === 0 || all.length === 0) return { series: [] }
  const min = Math.min(0, ...all)
  const max = niceMax(Math.max(...all))
  const fontSize = spec.fontSize ?? 12
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const item = params as { dataIndex: number; marker?: string }
        const series = data.series[item.dataIndex]
        if (!series) return ''
        return `${item.marker ?? ''}${escapeHtml(series.name)}<br/>` + data.categories
          .map((name, row) => `${escapeHtml(name)}: ${escapeHtml(series.labels[row] ?? '')}`)
          .join('<br/>')
      },
    },
    radar: {
      indicator: data.categories.map((name) => ({ name: name || ' ', min, max })),
      shape: 'polygon',
      center: pieCenter(spec),
      radius: spec.legend === 'top' || spec.legend === 'bottom' || spec.title ? '58%' : '66%',
      splitNumber: 5,
      axisName: { color: theme.muted, fontFamily: theme.fontFamily, fontSize },
      axisLine: { lineStyle: { color: theme.gridline } },
      splitLine: { lineStyle: { color: theme.gridline } },
      splitArea: { show: false },
    },
    series: [{
      type: 'radar',
      symbolSize: 5,
      data: data.series.map((series, index) => {
        const color = slotColor(input, index)
        return {
          name: series.name,
          value: series.values.map((value) => value ?? 0),
          itemStyle: { color },
          lineStyle: { color, width: 2 },
          areaStyle: { color, opacity: 0.15 },
        }
      }),
      label: { show: spec.dataLabels, color: theme.text, fontSize: fontSize - 1,
        formatter: (params: { dataIndex: number; dimensionIndex?: number }) =>
          data.series[params.dataIndex]?.labels[params.dimensionIndex ?? 0] ?? '' },
    }],
  } as ChartOption
}
