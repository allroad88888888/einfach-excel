import { buildHierarchy, colorRoots, hierarchyTooltip } from './hierarchy'
import type { ChartOption, ConvertInput } from './types'

/** 旭日图：层级列由内向外是一圈圈的环，扇形角度正比于数值，顶层类别各占一种颜色。 */
export function sunburstOption(input: ConvertInput): ChartOption {
  const { spec, theme } = input
  const roots = buildHierarchy(input.data)
  return {
    tooltip: { trigger: 'item', formatter: hierarchyTooltip },
    series: roots.length === 0 ? [] : [{
      type: 'sunburst',
      radius: ['8%', spec.title ? '82%' : '92%'],
      center: ['50%', spec.title ? '54%' : '50%'],
      // 保持数据行的先后顺序（默认会按数值降序重排）。
      sort: null,
      nodeClick: false,
      itemStyle: { borderColor: theme.background, borderWidth: 1 },
      label: { rotate: 'radial', minAngle: 6, color: '#ffffff', fontFamily: theme.fontFamily,
        fontSize: spec.fontSize ?? 12,
        formatter: spec.dataLabels ? '{b}\n{c}' : '{b}' },
      data: colorRoots(input, roots),
    }],
  } as ChartOption
}
