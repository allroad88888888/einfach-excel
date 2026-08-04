/** Cylindrical Bessel J and Y approximations. */

import type { FunctionImpl } from '../../../types'
import { evalBessel } from './bessel-evaluate'

const FRAC_PI_4 = Math.PI / 4

function besselJ0(x: number): number {
  const ax = Math.abs(x)
  if (ax < 8) {
    const y = x * x
    const p = 57568490574
      + y * (-13362590354
        + y * (651619640.7
          + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))))
    const q = 57568490411
      + y * (1029532985
        + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))))
    return p / q
  }
  const z = 8 / ax
  const y = z * z
  const p1 = 1
    + y * (-0.1098628627e-2
      + y * (0.2734510407e-4
        + y * (-0.2073370639e-5 + y * 0.2093887211e-6)))
  const q1 = -0.1562499995e-1
    + y * (0.1430488765e-3
      + y * (-0.6911147651e-5
        + y * (0.7621095161e-6 + y * -0.934935152e-7)))
  const xx = ax - FRAC_PI_4
  return Math.sqrt(2 / (Math.PI * ax)) * (Math.cos(xx) * p1 - z * Math.sin(xx) * q1)
}

function besselJ1(x: number): number {
  const ax = Math.abs(x)
  if (ax < 8) {
    const y = x * x
    const p = x
      * (72362614232
        + y * (-7895059235
          + y * (242396853.1
            + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))))
    const q = 144725228442
      + y * (2300535178
        + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))))
    return p / q
  }
  const z = 8 / ax
  const y = z * z
  const p1 = 1
    + y * (0.183105e-2
      + y * (-0.3516396496e-4
        + y * (0.2457520174e-5 + y * -0.240337019e-6)))
  const q1 = 0.04687499995
    + y * (-0.2002690873e-3
      + y * (0.8449199096e-5
        + y * (-0.88228987e-6 + y * 0.105787412e-6)))
  const xx = ax - 3 * FRAC_PI_4
  const result = Math.sqrt(2 / (Math.PI * ax)) * (Math.cos(xx) * p1 - z * Math.sin(xx) * q1)
  return x < 0 ? -result : result
}

export function besselJ(x: number, n: number): number | null {
  const ax = Math.abs(x)
  if (n === 0) return besselJ0(x)
  if (n === 1) return besselJ1(x)
  if (ax === 0) return 0
  const sign = x < 0 && n % 2 !== 0 ? -1 : 1

  if (n <= ax) {
    let jm1 = besselJ0(ax)
    let j = besselJ1(ax)
    for (let k = 1; k < n; k += 1) {
      const jp1 = (2 * k / ax) * j - jm1
      jm1 = j
      j = jp1
    }
    return sign * j
  }

  const mStart = Math.max(n + Math.trunc(Math.sqrt(40 * n)), 2 * n + 8)
  let jHigher = 0
  let jHigh = 1
  let valueAtN = 0
  for (let k = mStart; k >= 1; k -= 1) {
    const jLower = (2 * k / ax) * jHigh - jHigher
    jHigher = jHigh
    jHigh = jLower
    if (k - 1 === n) valueAtN = jHigh
    if (Math.abs(jHigh) > 1e10) {
      jHigh *= 1e-10
      jHigher *= 1e-10
      valueAtN *= 1e-10
    }
  }
  if (jHigh === 0) return 0
  return sign * valueAtN * (besselJ0(ax) / jHigh)
}

function besselY0(x: number): number {
  if (x < 8) {
    const y = x * x
    const p = -2957821389
      + y * (7062834065
        + y * (-512359803.6
          + y * (10879881.29 + y * (-86327.92757 + y * 228.4622733))))
    const q = 40076544269
      + y * (745249964.8
        + y * (7189466.438 + y * (47447.26470 + y * (226.1030244 + y))))
    return p / q + 0.636619772 * besselJ0(x) * Math.log(x)
  }
  const z = 8 / x
  const y = z * z
  const p1 = 1
    + y * (-0.1098628627e-2
      + y * (0.2734510407e-4
        + y * (-0.2073370639e-5 + y * 0.2093887211e-6)))
  const q1 = -0.1562499995e-1
    + y * (0.1430488765e-3
      + y * (-0.6911147651e-5
        + y * (0.7621095161e-6 + y * -0.934935152e-7)))
  const xx = x - FRAC_PI_4
  return Math.sqrt(2 / (Math.PI * x)) * (Math.sin(xx) * p1 + z * Math.cos(xx) * q1)
}

function besselY1(x: number): number {
  if (x < 8) {
    const y = x * x
    const p = x
      * (-4.900604943e13
        + y * (1.275274390e13
          + y * (-5.153438139e11
            + y * (7.349264551e9
              + y * (-4.237922726e7 + y * 8.511937935e4)))))
    const q = 2.499580570e14
      + y * (4.244419664e12
        + y * (3.733650367e10
          + y * (2.245904002e8 + y * (1.020426050e6 + y * (3.549632885e3 + y)))))
    return p / q + 0.636619772 * (besselJ1(x) * Math.log(x) - 1 / x)
  }
  const z = 8 / x
  const y = z * z
  const p1 = 1
    + y * (0.183105e-2
      + y * (-0.3516396496e-4
        + y * (0.2457520174e-5 + y * -0.240337019e-6)))
  const q1 = 0.04687499995
    + y * (-0.2002690873e-3
      + y * (0.8449199096e-5
        + y * (-0.88228987e-6 + y * 0.105787412e-6)))
  const xx = x - 3 * FRAC_PI_4
  return Math.sqrt(2 / (Math.PI * x)) * (Math.sin(xx) * p1 + z * Math.cos(xx) * q1)
}

export function besselY(x: number, n: number): number | null {
  if (x <= 0) return null
  if (n === 0) return besselY0(x)
  if (n === 1) return besselY1(x)
  let ym1 = besselY0(x)
  let y = besselY1(x)
  for (let k = 1; k < n; k += 1) {
    const yp1 = (2 * k / x) * y - ym1
    ym1 = y
    y = yp1
  }
  return y
}

export const BESSELJ: FunctionImpl = (args) => evalBessel(args, besselJ)
export const BESSELY: FunctionImpl = (args) => evalBessel(args, besselY)

export const FUNCTIONS: Record<string, FunctionImpl> = { BESSELJ, BESSELY }
