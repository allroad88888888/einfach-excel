import type { Trendline } from '../spec-analysis'

/** 一条拟合结果：predict 给任意 x 的趋势值，r2 同 Excel（指数、乘幂在取对数后的数据上算）。 */
export interface TrendFit {
  readonly predict: (x: number) => number
  readonly coefficients: readonly number[]
  readonly r2: number
}

export interface TrendPoint { readonly x: number; readonly y: number }

/** 最小二乘多项式：解正规方程（列主元高斯消元）；系数从常数项起。 */
function polyfit(points: readonly TrendPoint[], degree: number): number[] | null {
  const size = degree + 1
  const matrix = Array.from({ length: size }, (_row, row) => Array.from({ length: size + 1 },
    (_col, col) => points.reduce((sum, { x, y }) =>
      sum + (col === size ? y * x ** row : x ** (row + col)), 0)))
  for (let col = 0; col < size; col++) {
    let pivot = col
    for (let row = col + 1; row < size; row++)
      if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!)) pivot = row
    if (Math.abs(matrix[pivot]![col]!) < 1e-12) return null
    ;[matrix[col], matrix[pivot]] = [matrix[pivot]!, matrix[col]!]
    for (let row = 0; row < size; row++) {
      if (row === col) continue
      const factor = matrix[row]![col]! / matrix[col]![col]!
      for (let at = col; at <= size; at++) matrix[row]![at]! -= factor * matrix[col]![at]!
    }
  }
  return matrix.map((row, index) => row[size]! / row[index]!)
}

const evaluate = (coefficients: readonly number[], x: number) =>
  coefficients.reduce((sum, c, power) => sum + c * x ** power, 0)

function rSquared(points: readonly TrendPoint[], predict: (x: number) => number): number {
  const mean = points.reduce((sum, { y }) => sum + y, 0) / points.length
  const total = points.reduce((sum, { y }) => sum + (y - mean) ** 2, 0)
  const residual = points.reduce((sum, { x, y }) => sum + (y - predict(x)) ** 2, 0)
  return total === 0 ? 1 : 1 - residual / total
}

/** 先把数据变换成线性问题，拟合后再变换回来。 */
function transformed(points: readonly TrendPoint[], degree: number,
  forward: (p: TrendPoint) => TrendPoint, back: (c: number[]) => TrendFit['predict'],
  coefficients: (c: number[]) => number[]): TrendFit | null {
  const linear = points.map(forward)
  const fit = polyfit(linear, degree)
  if (!fit) return null
  return { predict: back(fit), coefficients: coefficients(fit),
    r2: rSquared(linear, (x) => evaluate(fit, x)) }
}

const identity = (point: TrendPoint) => point

/**
 * 回归类趋势线（移动平均不是回归，见 movingAverage）。数据不满足该类型定义域
 * （指数、乘幂要求 y > 0，对数、乘幂要求 x > 0）或点数不足时返回 null，同 Excel 不画。
 */
export function fitTrend(trend: Trendline, points: readonly TrendPoint[]): TrendFit | null {
  switch (trend.kind) {
    case 'linear':
      return points.length < 2 ? null : transformed(points, 1, identity,
        (c) => (x) => evaluate(c, x), (c) => c)
    case 'polynomial':
      return points.length <= trend.order ? null : transformed(points, trend.order, identity,
        (c) => (x) => evaluate(c, x), (c) => c)
    case 'exponential':
      // y = a·e^(bx)：ln y = ln a + b·x。
      return points.length < 2 || points.some(({ y }) => y <= 0) ? null
        : transformed(points, 1, ({ x, y }) => ({ x, y: Math.log(y) }),
          ([c0, c1]) => (x) => Math.exp(c0!) * Math.exp(c1! * x),
          ([c0, c1]) => [Math.exp(c0!), c1!])
    case 'logarithmic':
      // y = a·ln x + b。
      return points.length < 2 || points.some(({ x }) => x <= 0) ? null
        : transformed(points, 1, ({ x, y }) => ({ x: Math.log(x), y }),
          ([c0, c1]) => (x) => c0! + c1! * Math.log(x), (c) => c)
    case 'power':
      // y = a·x^b：ln y = ln a + b·ln x。
      return points.length < 2 || points.some(({ x, y }) => x <= 0 || y <= 0) ? null
        : transformed(points, 1, ({ x, y }) => ({ x: Math.log(x), y: Math.log(y) }),
          ([c0, c1]) => (x) => Math.exp(c0!) * x ** c1!, ([c0, c1]) => [Math.exp(c0!), c1!])
    case 'movingAverage':
      return null
  }
}

/** 移动平均：第 i 个点（i ≥ 周期 - 1）取前 period 个点的均值，之前没有值。 */
export function movingAverage(values: readonly number[], period: number): (number | null)[] {
  return values.map((_, index) => {
    if (index < period - 1) return null
    const window = values.slice(index - period + 1, index + 1)
    return window.reduce((sum, value) => sum + value, 0) / period
  })
}
