import { categoryAxis, valueAxis } from './axis'
import { slotColor } from './colors'
import { boxStats } from './stats'
import { escapeHtml, formatNumber } from './text'
import { DEFAULT_CHART_WORDS, type ChartOption, type ConvertInput } from './types'

const CROSS = 'path://M0,0L10,10M10,0L0,10'

/**
 * 箱线图：每个系列（列）一个箱，系列名在类别轴上；类别列不参与。
 * 箱体是 Q1–Q3 加中位线，四分位用 Excel 默认的「排除中位数」口径，须线 1.5 × IQR，
 * 范围外的点画成离群点，另有 × 号标出平均值。没有数字的系列不出箱。
 */
export function boxplotOption(input: ConvertInput): ChartOption {
  const { data } = input
  const words = input.words ?? DEFAULT_CHART_WORDS
  const boxes = data.series.flatMap((series, index) => {
    const values = series.values.filter((value): value is number => value !== null)
    return values.length ? [{ name: series.name, index, stats: boxStats(values) }] : []
  })
  if (boxes.length === 0) return { series: [] }
  const line = (index: number) => slotColor(input, index)
  const rows = (stats: (typeof boxes)[number]['stats']) => [
    [words.max, stats.max], [words.q3, stats.q3], [words.median, stats.median],
    [words.q1, stats.q1], [words.min, stats.min], [words.mean, stats.mean],
  ] as const
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const item = params as { seriesType?: string; seriesName?: string; dataIndex: number;
          name?: string; value?: number | readonly number[] }
        const box = boxes[item.dataIndex]
        if (item.seriesType === 'boxplot' && box) {
          return `${escapeHtml(box.name)}<br/>` + rows(box.stats)
            .map(([word, value]) => `${escapeHtml(word)}: ${formatNumber(value)}`).join('<br/>')
        }
        const value = Array.isArray(item.value) ? item.value[1] : item.value
        return `${escapeHtml(item.name ?? '')}<br/>${escapeHtml(item.seriesName ?? '')}: ` +
          formatNumber(Number(value))
      },
    },
    xAxis: { ...categoryAxis({ ...input, data: { ...data, categories: boxes.map((b) => b.name) } },
      true), boundaryGap: true },
    yAxis: { ...valueAxis(input, false), scale: true },
    series: [
      {
        type: 'boxplot',
        data: boxes.map((box) => ({
          name: box.name,
          value: [box.stats.min, box.stats.q1, box.stats.median, box.stats.q3, box.stats.max],
          itemStyle: { color: `${line(box.index)}33`, borderColor: line(box.index), borderWidth: 2 },
        })),
        boxWidth: ['30%', '60%'],
      },
      {
        type: 'scatter', name: words.outlier, symbolSize: 6,
        data: boxes.flatMap((box, at) => box.stats.outliers.map((value) => ({
          name: box.name, value: [at, value], itemStyle: { color: line(box.index) },
        }))),
      },
      {
        type: 'scatter', name: words.mean, symbol: CROSS, symbolSize: 8,
        data: boxes.map((box, at) => ({
          name: box.name, value: [at, box.stats.mean],
          itemStyle: { color: 'transparent', borderColor: line(box.index), borderWidth: 1.5 },
        })),
      },
    ],
  } as ChartOption
}
