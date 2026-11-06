import type { ChartSpec } from '../spec'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

/** 饼心避开图例与标题；左右图例占横向，上下图例与标题占纵向。 */
function pieCenter(spec: ChartSpec): [string, string] {
  const x = spec.legend === 'right' ? 42 : spec.legend === 'left' ? 58 : 50
  const top = (spec.title ? 8 : 0) + (spec.legend === 'top' ? 8 : 0)
  const bottom = spec.legend === 'bottom' ? 10 : 0
  return [`${x}%`, `${50 + (top - bottom) / 2}%`]
}

/** 饼图只画第一个系列，同 Excel；负值与空值不能成为扇区。 */
export function pieOption({ spec, data }: ConvertInput): ChartOption {
  const first = data.series[0]
  const points: ChartPoint[] = first
    ? data.categories.flatMap((name, index) => {
      const value = first.values[index]
      return value !== null && value !== undefined && value > 0
        ? [{ name, value, label: first.labels[index] ?? '' }] : []
    })
    : []
  const crowded = spec.legend !== 'none' || Boolean(spec.title)
  const outer = crowded ? '58%' : '68%'
  return {
    series: [{
      type: 'pie',
      name: first?.name ?? '',
      radius: spec.type === 'doughnut' ? [crowded ? '34%' : '40%', outer] : outer,
      center: pieCenter(spec),
      avoidLabelOverlap: true,
      percentPrecision: 1,
      data: points,
    }],
  } as ChartOption
}
