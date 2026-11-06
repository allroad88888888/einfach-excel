import type { ChartTheme, ConvertInput } from './types'

function axisStyle(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.axisLine } },
    axisTick: { lineStyle: { color: theme.axisLine } },
    axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, hideOverlap: true },
    nameTextStyle: { color: theme.muted, fontFamily: theme.fontFamily },
  }
}

function title(name: string, horizontal: boolean) {
  return name
    ? { name, nameLocation: 'middle' as const, nameGap: horizontal ? 28 : 44 }
    : {}
}

/** 类别轴：显示单元格原文（日期等保持单元格格式）。 */
export function categoryAxis({ spec, data, theme }: ConvertInput, horizontal: boolean) {
  return {
    type: 'category' as const,
    data: [...data.categories],
    boundaryGap: spec.type === 'column' || spec.type === 'bar',
    splitLine: { show: false },
    ...axisStyle(theme),
    ...title(horizontal ? spec.xTitle : spec.yTitle, horizontal),
  }
}

/** 数值轴：最小 / 最大值来自设置（只作用于值轴，散点的 X 轴不套用），百分比堆积固定 0–100。 */
export function valueAxis({ spec, theme }: ConvertInput, horizontal: boolean, bounded = true) {
  const percent = spec.stack === 'percent'
  return {
    type: 'value' as const,
    min: percent ? 0 : bounded ? spec.yMin ?? undefined : undefined,
    max: percent ? 100 : bounded ? spec.yMax ?? undefined : undefined,
    scale: spec.type === 'scatter',
    splitLine: { show: spec.gridlines, lineStyle: { color: theme.gridline } },
    ...axisStyle(theme),
    axisLabel: { ...axisStyle(theme).axisLabel, ...(percent ? { formatter: '{value}%' } : {}) },
    ...title(horizontal ? spec.xTitle : spec.yTitle, horizontal),
  }
}
