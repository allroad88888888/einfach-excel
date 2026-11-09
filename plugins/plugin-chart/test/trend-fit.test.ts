import { describe, expect, test } from 'vitest'
import { fitTrend, movingAverage } from '../src/core/convert/trend-fit'
import { formatCoefficient, rSquaredText, trendEquation } from '../src/core/convert/trend-equation'
import { DEFAULT_TRENDLINE, type TrendlineKind } from '../src/core/spec-analysis'

const trend = (kind: TrendlineKind, over = {}) => ({ ...DEFAULT_TRENDLINE, kind, ...over })
const points = (f: (x: number) => number, xs = [1, 2, 3, 4, 5]) => xs.map((x) => ({ x, y: f(x) }))

describe('regression trendlines recover exact curves (R² = 1)', () => {
  test('linear', () => {
    const fit = fitTrend(trend('linear'), points((x) => 2 * x + 1))!
    expect(fit.coefficients[0]).toBeCloseTo(1)
    expect(fit.coefficients[1]).toBeCloseTo(2)
    expect(fit.predict(10)).toBeCloseTo(21)
    expect(fit.r2).toBeCloseTo(1)
  })

  test('polynomial of order 3', () => {
    const fit = fitTrend(trend('polynomial', { order: 3 }), points((x) => x ** 3 - 2 * x + 4))!
    expect(fit.coefficients.map((c) => Number(c.toFixed(6)) + 0)).toEqual([4, -2, 0, 1])
    expect(fit.r2).toBeCloseTo(1)
  })

  test('exponential, logarithmic and power', () => {
    const exp = fitTrend(trend('exponential'), points((x) => 3 * Math.exp(0.5 * x)))!
    expect(exp.coefficients[0]).toBeCloseTo(3)
    expect(exp.coefficients[1]).toBeCloseTo(0.5)
    const log = fitTrend(trend('logarithmic'), points((x) => 2 * Math.log(x) + 1))!
    expect(log.predict(Math.E)).toBeCloseTo(3)
    const power = fitTrend(trend('power'), points((x) => 4 * x ** 1.5))!
    expect(power.coefficients[0]).toBeCloseTo(4)
    expect(power.coefficients[1]).toBeCloseTo(1.5)
    expect(power.r2).toBeCloseTo(1)
  })

  test('R² is below 1 for noisy data', () => {
    const fit = fitTrend(trend('linear'), [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 2 }])!
    expect(fit.r2).toBeCloseTo(0.25)
  })
})

describe('like Excel, a trendline outside its domain is not drawn', () => {
  test('exponential needs positive y, logarithmic positive x, power both', () => {
    expect(fitTrend(trend('exponential'), points((x) => x - 3))).toBeNull()
    expect(fitTrend(trend('logarithmic'), points((x) => x, [0, 1, 2]))).toBeNull()
    expect(fitTrend(trend('power'), points((x) => -x))).toBeNull()
  })

  test('too few points for the order', () => {
    expect(fitTrend(trend('linear'), [{ x: 1, y: 1 }])).toBeNull()
    // 同 Excel：点数必须多于阶数。
    expect(fitTrend(trend('polynomial', { order: 4 }), points((x) => x, [1, 2, 3, 4])))
      .toBeNull()
  })

  test('moving average is not a regression', () => {
    expect(fitTrend(trend('movingAverage'), points((x) => x))).toBeNull()
  })
})

test('moving average starts after the first full period', () => {
  expect(movingAverage([1, 2, 3, 4, 6], 3)).toEqual([null, null, 2, 3, 13 / 3])
})

describe('equation text matches Excel’s “display equation”', () => {
  test('coefficients keep four significant digits', () => {
    expect(formatCoefficient(1.23456)).toBe('1.235')
    expect(formatCoefficient(2)).toBe('2')
    expect(formatCoefficient(0.00001234)).toBe('1.234e-5')
  })

  test('each trendline kind', () => {
    expect(trendEquation('linear', [1, 2])).toBe('y = 2x + 1')
    expect(trendEquation('linear', [-1.5, 1])).toBe('y = x - 1.5')
    expect(trendEquation('polynomial', [4, -2, 0, 1])).toBe('y = x³ - 2x + 4')
    expect(trendEquation('exponential', [3, 0.5])).toBe('y = 3e^(0.5x)')
    expect(trendEquation('logarithmic', [1, 2])).toBe('y = 2ln(x) + 1')
    expect(trendEquation('logarithmic', [-1, -2])).toBe('y = -2ln(x) - 1')
    expect(trendEquation('power', [4, 1.5])).toBe('y = 4x^1.5')
    expect(trendEquation('movingAverage', [])).toBe('')
    expect(rSquaredText(0.987654)).toBe('R² = 0.9877')
  })
})
