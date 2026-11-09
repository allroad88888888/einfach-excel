import type { TrendlineKind } from '../spec-analysis'

const SUPERSCRIPT = ['', '', '²', '³', '⁴', '⁵', '⁶']

/** 4 位有效数字，去掉多余的 0；极大极小值用科学计数法。 */
export function formatCoefficient(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return '0'
  const magnitude = Math.abs(value)
  if (magnitude >= 1e6 || magnitude < 1e-4) return value.toExponential(3).replace(/\.?0+e/, 'e')
  return String(Number(value.toPrecision(4)))
}

/** 多项式各项从最高次写起，负系数写成减号。 */
function polynomial(coefficients: readonly number[]): string {
  const terms = coefficients.map((c, power) => ({ c, power })).reverse()
    .filter(({ c }) => c !== 0)
  if (!terms.length) return '0'
  return terms.map(({ c, power }, index) => {
    const variable = power === 0 ? '' : `x${SUPERSCRIPT[power] ?? `^${power}`}`
    const magnitude = formatCoefficient(Math.abs(c))
    const body = variable && magnitude === '1' ? variable : `${magnitude}${variable}`
    const sign = c < 0 ? (index === 0 ? '-' : ' - ') : (index === 0 ? '' : ' + ')
    return sign + body
  }).join('')
}

/** 趋势线公式，形式同 Excel 的「显示公式」；移动平均没有公式。 */
export function trendEquation(kind: TrendlineKind, coefficients: readonly number[]): string {
  const [a = 0, b = 0] = coefficients
  switch (kind) {
    case 'linear':
    case 'polynomial':
      return `y = ${polynomial(coefficients)}`
    case 'exponential':
      return `y = ${formatCoefficient(a)}e^(${formatCoefficient(b)}x)`
    case 'logarithmic': {
      // 系数是 [截距, 斜率]：y = 斜率·ln(x) + 截距。
      const slope = `${b < 0 ? '-' : ''}${formatCoefficient(Math.abs(b))}ln(x)`
      const intercept = a === 0 ? '' : `${a < 0 ? ' - ' : ' + '}${formatCoefficient(Math.abs(a))}`
      return `y = ${slope}${intercept}`
    }
    case 'power':
      return `y = ${formatCoefficient(a)}x^${formatCoefficient(b)}`
    case 'movingAverage':
      return ''
  }
}

export function rSquaredText(r2: number): string {
  return `R² = ${Number(r2.toFixed(4))}`
}
