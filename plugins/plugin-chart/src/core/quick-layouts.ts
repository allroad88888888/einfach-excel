import type { ChartSpec, LegendPosition } from './spec'

/** Excel「快速布局」：一组图表元素的显隐组合，套用后仍可逐项再改。 */
export const QUICK_LAYOUTS = ['layout1', 'layout2', 'layout3', 'layout4', 'layout5',
  'layout6'] as const
export type QuickLayout = (typeof QUICK_LAYOUTS)[number]

interface LayoutParts {
  readonly title: boolean
  readonly axisTitles: boolean
  readonly legend: LegendPosition
  readonly dataLabels: boolean
  readonly gridlines: boolean
}

const PARTS: Record<QuickLayout, LayoutParts> = {
  layout1: { title: true, axisTitles: false, legend: 'right', dataLabels: false, gridlines: true },
  layout2: { title: true, axisTitles: false, legend: 'top', dataLabels: true, gridlines: false },
  layout3: { title: true, axisTitles: false, legend: 'bottom', dataLabels: false, gridlines: true },
  layout4: { title: false, axisTitles: false, legend: 'bottom', dataLabels: true, gridlines: true },
  layout5: { title: true, axisTitles: true, legend: 'right', dataLabels: false, gridlines: true },
  layout6: { title: true, axisTitles: true, legend: 'none', dataLabels: false, gridlines: true },
}

/** 新出现的标题用占位文字（同 Excel「图表标题」「坐标轴标题」），已有的文字保留。 */
export interface LayoutWords {
  readonly title: string
  readonly axisTitle: string
}

export function quickLayoutParts(layout: QuickLayout): LayoutParts {
  return PARTS[layout]
}

/** 套用快速布局得到的设置补丁；去掉的标题清空文字，同 Excel 删除该元素。 */
export function quickLayoutPatch(layout: QuickLayout, spec: ChartSpec,
  words: LayoutWords): Partial<ChartSpec> {
  const parts = PARTS[layout]
  const keep = (show: boolean, current: string, placeholder: string) =>
    show ? current || placeholder : ''
  return {
    title: keep(parts.title, spec.title, words.title),
    xTitle: keep(parts.axisTitles, spec.xTitle, words.axisTitle),
    yTitle: keep(parts.axisTitles, spec.yTitle, words.axisTitle),
    legend: parts.legend,
    dataLabels: parts.dataLabels,
    gridlines: parts.gridlines,
  }
}
