/** Modified Bessel I and K approximations. */

import type { FunctionImpl } from '../../../types'
import { evalBessel } from './bessel-evaluate'

function besselI0(x: number): number {
  const ax = Math.abs(x)
  if (ax < 3.75) {
    const y = Math.pow(x / 3.75, 2)
    return 1 + y
      * (3.5156229
        + y * (3.0899424
          + y * (1.2067492
            + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))))
  }
  const y = 3.75 / ax
  return (Math.exp(ax) / Math.sqrt(ax))
    * (0.39894228
      + y * (0.01328592
        + y * (0.00225319
          + y * (-0.00157565
            + y * (0.00916281
              + y * (-0.02057706
                + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))))
}

function besselI1(x: number): number {
  const ax = Math.abs(x)
  let result: number
  if (ax < 3.75) {
    const y = Math.pow(x / 3.75, 2)
    result = ax * (0.5
      + y * (0.87890594
        + y * (0.51498869
          + y * (0.15084934
            + y * (0.02658733 + y * (0.00301532 + y * 0.00032411))))))
  } else {
    const y = 3.75 / ax
    const p = 0.39894228
      + y * (-0.03988024
        + y * (-0.00362018
          + y * (0.00163801
            + y * (-0.01031555
              + y * (0.02282967
                + y * (-0.02895312 + y * (0.01787654 + y * -0.00420059)))))))
    result = (Math.exp(ax) / Math.sqrt(ax)) * p
  }
  return x < 0 ? -result : result
}

function besselI(x: number, n: number): number | null {
  const ax = Math.abs(x)
  if (n === 0) return besselI0(ax)
  if (n === 1) return (x < 0 ? -1 : 1) * besselI1(ax)
  if (ax === 0) return 0
  const sign = x < 0 && n % 2 !== 0 ? -1 : 1
  const mStart = Math.max(n + Math.trunc(Math.sqrt(40 * n)), 2 * n + 8)
  let iHigher = 0
  let iHigh = 1
  let valueAtN = 0
  for (let k = mStart; k >= 1; k -= 1) {
    const iLower = (2 * k / ax) * iHigh + iHigher
    iHigher = iHigh
    iHigh = iLower
    if (k - 1 === n) valueAtN = iHigh
    if (Math.abs(iHigh) > 1e10) {
      iHigh *= 1e-10
      iHigher *= 1e-10
      valueAtN *= 1e-10
    }
  }
  if (iHigh === 0) return 0
  return sign * valueAtN * (besselI0(ax) / iHigh)
}

function besselK0(x: number): number {
  if (x <= 2) {
    const y = x * x / 4
    return -(Math.log(x / 2) * besselI0(x))
      + (-0.57721566
        + y * (0.42278420
          + y * (0.23069756
            + y * (0.03488590
              + y * (0.00262698 + y * (0.00010750 + y * 0.00000740))))))
  }
  const y = 2 / x
  return (Math.exp(-x) / Math.sqrt(x))
    * (1.25331414
      + y * (-0.07832358
        + y * (0.02189568
          + y * (-0.01062446 + y * (0.00587872 + y * (-0.00251540 + y * 0.00053208))))))
}

function besselK1(x: number): number {
  if (x <= 2) {
    const y = x * x / 4
    return Math.log(x / 2) * besselI1(x)
      + (1 / x)
        * (1
          + y * (0.15443144
            + y * (-0.67278579
              + y * (-0.18156897
                + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686))))))
  }
  const y = 2 / x
  return (Math.exp(-x) / Math.sqrt(x))
    * (1.25331414
      + y * (0.23498619
        + y * (-0.03655620
          + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 + y * -0.00068245))))))
}

function besselK(x: number, n: number): number | null {
  if (x <= 0) return null
  if (n === 0) return besselK0(x)
  if (n === 1) return besselK1(x)
  let km1 = besselK0(x)
  let kValue = besselK1(x)
  for (let j = 1; j < n; j += 1) {
    const kp1 = (2 * j / x) * kValue + km1
    km1 = kValue
    kValue = kp1
  }
  return kValue
}

export const BESSELI: FunctionImpl = (args) => evalBessel(args, besselI)
export const BESSELK: FunctionImpl = (args) => evalBessel(args, besselK)

export const FUNCTIONS: Record<string, FunctionImpl> = { BESSELI, BESSELK }
