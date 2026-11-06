import { slotColor } from './colors'
import { escapeHtml } from './text'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

/**
 * 漏斗图：只画第一个系列，每个类别一层，按数据行的先后顺序自上而下（不重新排序，同 Excel）。
 * 空值与负值画成零宽的层，保持层数与类别一一对应，颜色槽也与类别对齐。
 */
export function funnelOption(input: ConvertInput): ChartOption {
  const { spec, data, theme } = input
  const first = data.series[0]
  if (!first) return { series: [] }
  const points = data.categories.map((name, index) => ({
    name,
    value: Math.max(0, first.values[index] ?? 0),
    label: first.labels[index] ?? '',
    itemStyle: { color: slotColor(input, index) },
  }) as ChartPoint & { itemStyle: { color: string } })
  const legendSide = spec.legend === 'left' || spec.legend === 'right'
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const item = params as { marker?: string; name?: string; data?: ChartPoint }
        return `${item.marker ?? ''}${escapeHtml(item.name ?? '')}: ${escapeHtml(item.data?.label ?? '')}`
      },
    },
    series: [{
      type: 'funnel',
      name: first.name,
      sort: 'none',
      gap: 2,
      left: legendSide && spec.legend === 'left' ? 110 : 16,
      right: legendSide && spec.legend === 'right' ? 110 : 16,
      top: (spec.title ? 40 : 16) + (spec.legend === 'top' ? 28 : 0),
      bottom: 16 + (spec.legend === 'bottom' ? 28 : 0),
      label: {
        show: true, position: 'inside', color: '#ffffff', fontFamily: theme.fontFamily,
        fontSize: spec.fontSize ?? 12,
        // 有图例时名称已在图例里，打开数据标签只给数值；否则名称随层显示。
        formatter: (params: { name?: string; data?: ChartPoint }) => {
          const value = params.data?.label ?? ''
          if (!spec.dataLabels) return params.name ?? ''
          return spec.legend === 'none' ? `${params.name ?? ''}: ${value}` : value
        },
      },
      labelLine: { show: false },
      itemStyle: { borderColor: theme.background, borderWidth: 1 },
      data: points,
    }],
  } as ChartOption
}
