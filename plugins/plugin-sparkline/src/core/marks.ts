import type { SparklineSpec } from './spec'

export type SparklineMark =
  | { readonly kind: 'line'; readonly points: string; readonly color: string }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number;
    readonly height: number; readonly color: string }
  | { readonly kind: 'dot'; readonly x: number; readonly y: number; readonly color: string }
  | { readonly kind: 'axis'; readonly y: number; readonly color: string }

const PAD = 2

/** 每条迷你图各自定纵轴（Excel 默认「每条迷你图自动」）；空格与文字跳过，折线在空位断开。 */
export function sparklineMarks(values: readonly (number | null)[], spec: SparklineSpec,
  width: number, height: number): SparklineMark[] {
  const numbers = values.flatMap((value, index) => value === null ? [] : [{ value, index }])
  if (!numbers.length || width <= PAD * 2 || height <= PAD * 2) return []
  const all = numbers.map((entry) => entry.value)
  const high = Math.max(...all)
  const low = Math.min(...all)
  const innerW = width - PAD * 2
  const innerH = height - PAD * 2
  const step = innerW / values.length
  const marks: SparklineMark[] = []
  const highlight = (entry: { value: number; index: number }, position: number) =>
    spec.first && position === 0 ? spec.firstColor
      : spec.last && position === numbers.length - 1 ? spec.lastColor
        : spec.high && entry.value === high ? spec.highColor
          : spec.low && entry.value === low ? spec.lowColor
            : spec.negative && entry.value < 0 ? spec.negativeColor : null

  if (spec.type === 'winLoss') {
    const mid = PAD + innerH / 2
    numbers.forEach((entry, position) => {
      if (entry.value === 0) return
      const color = highlight(entry, position) ??
        (entry.value < 0 && spec.negative ? spec.negativeColor : spec.color)
      marks.push({ kind: 'rect', x: PAD + entry.index * step + step * 0.1, width: step * 0.8,
        y: entry.value > 0 ? PAD : mid, height: innerH / 2, color })
    })
    if (spec.axis) marks.push({ kind: 'axis', y: mid, color: '#000000' })
    return marks
  }

  // 柱形以 0 为基线（全正时从底部、全负时从顶部）；折线按最小到最大铺满。
  const bottom = spec.type === 'column' ? Math.min(0, low) : low
  const top = spec.type === 'column' ? Math.max(0, high) : high
  const span = top - bottom || 1
  const y = (value: number) => PAD + innerH - ((value - bottom) / span) * innerH
  if (spec.type === 'column') {
    numbers.forEach((entry, position) => {
      const color = highlight(entry, position) ?? spec.color
      const y0 = y(Math.max(entry.value, 0))
      const y1 = y(Math.min(entry.value, 0))
      marks.push({ kind: 'rect', x: PAD + entry.index * step + step * 0.1, width: step * 0.8,
        y: y0, height: Math.max(1, y1 - y0), color })
    })
  } else {
    const x = (index: number) => PAD + (values.length > 1
      ? (index / (values.length - 1)) * innerW : innerW / 2)
    let run: string[] = []
    const flush = () => {
      if (run.length) marks.push({ kind: 'line', points: run.join(' '), color: spec.color })
      run = []
    }
    values.forEach((value, index) => {
      if (value === null) flush()
      else run.push(`${x(index).toFixed(2)},${y(value).toFixed(2)}`)
    })
    flush()
    numbers.forEach((entry, position) => {
      const color = highlight(entry, position) ?? (spec.markers ? spec.markerColor : null)
      if (color) marks.push({ kind: 'dot', x: x(entry.index), y: y(entry.value), color })
    })
  }
  if (spec.axis && low < 0 && high > 0) marks.push({ kind: 'axis', y: y(0), color: '#000000' })
  return marks
}
