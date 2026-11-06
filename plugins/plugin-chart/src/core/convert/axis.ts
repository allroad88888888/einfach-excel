import type { ChartTheme, ConvertInput } from './types'

function axisStyle(theme: ChartTheme, fontSize: number) {
  return {
    axisLine: { lineStyle: { color: theme.axisLine } },
    axisTick: { lineStyle: { color: theme.axisLine } },
    axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, fontSize, hideOverlap: true },
    nameTextStyle: { color: theme.muted, fontFamily: theme.fontFamily, fontSize },
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
    ...axisStyle(theme, spec.fontSize ?? 12),
    ...title(horizontal ? spec.xTitle : spec.yTitle, horizontal),
  }
}

/** 数值轴：最小 / 最大值来自设置（只作用于值轴，散点的 X 轴不套用），百分比堆积固定 0–100。 */
export function valueAxis({ spec, theme }: ConvertInput, horizontal: boolean, bounded = true) {
  const percent = spec.stack === 'percent'
  const style = axisStyle(theme, spec.fontSize ?? 12)
  return {
    type: 'value' as const,
    min: percent ? 0 : bounded ? spec.yMin ?? undefined : undefined,
    max: percent ? 100 : bounded ? spec.yMax ?? undefined : undefined,
    scale: spec.type === 'scatter',
    splitLine: { show: spec.gridlines, lineStyle: { color: theme.gridline } },
    ...style,
    axisLabel: { ...style.axisLabel, ...(percent ? { formatter: '{value}%' } : {}) },
    ...title(horizontal ? spec.xTitle : spec.yTitle, horizontal),
  }
}
