import { buildHierarchy } from './convert/hierarchy'
import { STOCK_COLORS } from './convert/stock'
import type { ChartData } from './series-layout'
import type { ChartSpec } from './spec'

/** 设置面板里一个可改的颜色：角色槽（增加 / 减少 / 汇总）没有数据名，由视图给译文。 */
export interface ColorSlot {
  readonly name: string
  readonly role?: 'increase' | 'decrease' | 'total'
}

const slot = (name: string): ColorSlot => ({ name })

/** 颜色槽没被用户改过时画出来的颜色，设置面板的取色器以此为初值。 */
export function defaultSlotColor(spec: Pick<ChartSpec, 'type'>, index: number,
  palette: readonly string[]): string {
  if (spec.type === 'stock') return STOCK_COLORS[index] ?? palette[0]!
  return palette[index % palette.length]!
}

/**
 * 该类型的颜色槽，顺序与转换器里 spec.colors 的下标一致：
 * 饼图 / 圆环 / 漏斗按类别，树状图 / 旭日图按顶层类别，瀑布图是增加 / 减少 / 汇总，
 * 股价图是上涨 / 下跌，直方图只有一个，其余按系列。
 */
export function colorSlots(spec: Pick<ChartSpec, 'type'>, data: ChartData | null): ColorSlot[] {
  if (!data) return []
  switch (spec.type) {
    case 'pie':
    case 'doughnut':
    case 'funnel':
      return data.categories.map(slot)
    case 'treemap':
    case 'sunburst':
      return buildHierarchy(data).map((node) => slot(node.name))
    case 'waterfall':
      return [{ name: '', role: 'increase' }, { name: '', role: 'decrease' },
        { name: '', role: 'total' }]
    case 'stock':
      return [{ name: '', role: 'increase' }, { name: '', role: 'decrease' }]
    case 'histogram':
      return data.series.slice(0, 1).map((series) => slot(series.name))
    default:
      return data.series.map((series) => slot(series.name))
  }
}
