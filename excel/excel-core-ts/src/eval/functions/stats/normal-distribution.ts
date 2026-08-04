import type { Value } from '../../../types'
import { finiteNumber } from './numeric'

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI)

export function clampProbability(value: number): number {
  if (value < 0 && value > -1e-14) return 0
  if (value > 1 && value < 1 + 1e-14) return 1
  return value
}

export function probability(value: number): Value {
  return finiteNumber(clampProbability(value))
}

export function standardNormalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_TWO_PI
}

const ERFC_COEFFICIENTS = [
  -1.3026537197817094,
  0.6419697923564903,
  0.019476473204185836,
  -0.009561514786808631,
  -0.000946595344482036,
  0.000366839497852761,
  0.000042523324806907,
  -0.000020278578112534,
  -0.000001624290004647,
  0.00000130365583558,
  0.000000015626441722,
  -0.000000085238095915,
  0.000000006529054439,
  0.000000005059343495,
  -0.000000000991364156,
  -0.000000000227365122,
  0.000000000096467911,
  0.000000000002394038,
  -0.000000000006886027,
  0.000000000000894487,
  0.000000000000313092,
  -0.000000000000112708,
  0.000000000000000381,
  0.000000000000007106,
  -0.000000000000001523,
  -0.000000000000000094,
  0.000000000000000121,
  -0.000000000000000028,
] as const

export function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 2 / (2 + z)
  const ty = 4 * t - 2
  let d = 0
  let dd = 0
  for (let i = ERFC_COEFFICIENTS.length - 1; i > 0; i--) {
    const prev = d
    d = ty * d - dd + ERFC_COEFFICIENTS[i]
    dd = prev
  }
  const result = t * Math.exp(-z * z + 0.5 * (ERFC_COEFFICIENTS[0] + ty * d) - dd)
  return x < 0 ? 2 - result : result
}

export function standardNormalCdf(x: number): number {
  if (x === Number.POSITIVE_INFINITY) return 1
  if (x === Number.NEGATIVE_INFINITY) return 0
  return clampProbability(0.5 * erfc(-x / Math.SQRT2))
}

export function standardNormalInv(p: number): number {
  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239,
  ] as const
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572,
  ] as const
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ] as const
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416,
  ] as const
  const low = 0.02425
  const high = 1 - low

  let x: number
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p > high) {
    const q = Math.sqrt(-2 * Math.log1p(-p))
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else {
    const q = p - 0.5
    const r = q * q
    x =
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }

  for (let i = 0; i < 2; i++) {
    const error = standardNormalCdf(x) - p
    const scaled = error / standardNormalPdf(x)
    x -= scaled / (1 + (x * scaled) / 2)
  }
  return x
}
