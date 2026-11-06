import { buildHierarchy, colorRoots, hierarchyTooltip } from './hierarchy'
import type { ChartOption, ConvertInput } from './types'

/** 树状图：前几列是层级类别、最后一列是数值，面积正比于数值，顶层类别各占一种颜色。 */
export function treemapOption(input: ConvertInput): ChartOption {
  const { spec, theme } = input
  const roots = buildHierarchy(input.data)
  const fontSize = spec.fontSize ?? 12
  const text = { color: '#ffffff', fontFamily: theme.fontFamily, fontSize }
  return {
    tooltip: { trigger: 'item', formatter: hierarchyTooltip },
    series: roots.length === 0 ? [] : [{
      type: 'treemap',
      top: spec.title ? 40 : 8, bottom: 8, left: 8, right: 8,
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      // 叶子的名称写在块内，打开数据标签时附上数值；顶层类别的名称写在它那组块的上方。
      label: { show: true, ...text, formatter: spec.dataLabels ? '{b}\n{c}' : '{b}' },
      // 有下级的节点（顶层类别）在它那组块的上方留一条深色文字的名称栏。
      upperLabel: { show: true, height: fontSize + 10, ...text, color: theme.text },
      itemStyle: { borderColor: theme.background, borderWidth: 1, gapWidth: 1 },
      levels: [{ itemStyle: { borderColor: theme.background, borderWidth: 0, gapWidth: 3 } }],
      data: colorRoots(input, roots),
    }],
  } as ChartOption
}
