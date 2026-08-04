/** Error-function approximations and Excel wrappers. */

import type { FunctionImpl } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

const ERF_P = [
  3.16112374387056560e+00,
  1.13864154151050156e+02,
  3.77485237685302021e+02,
  3.20937758913846947e+03,
  1.85777706184603153e-01,
]
const ERF_Q = [
  2.36012909523441209e+01,
  2.44024637934444173e+02,
  1.28261652607737228e+03,
  2.84423683343917062e+03,
]

// Coefficients for 0.46875 <= |x| < 4 — erfc(x) = exp(-x^2) * R(|x|)
const ERFC_P1 = [
  5.64188496988670089e-01,
  8.88314979438837594e+00,
  6.61191906371416295e+01,
  2.98635138197400131e+02,
  8.81952221241769090e+02,
  1.71204761263407058e+03,
  2.05107837782607147e+03,
  1.23033935479799725e+03,
  2.15311535474403846e-08,
]
const ERFC_Q1 = [
  1.57449261107098347e+01,
  1.17693950891312499e+02,
  5.37181101862009858e+02,
  1.62138957456669019e+03,
  3.29079923573345963e+03,
  4.36261909014324716e+03,
  3.43936767414372164e+03,
  1.23033935480374942e+03,
]

// Coefficients for |x| >= 4 — erfc(x) = exp(-x^2)/x * (1/sqrt(pi) + R(1/x^2))
const ERFC_P2 = [
  3.05326634961232344e-01,
  3.60344899949804439e-01,
  1.25781726111229246e-01,
  1.60837851487422766e-02,
  6.58749161529837803e-04,
  1.63153871373020978e-02,
]
const ERFC_Q2 = [
  2.56852019228982242e+00,
  1.87295284992346047e+00,
  5.27905102951428413e-01,
  6.05183413124413191e-02,
  2.33520497626869185e-03,
]

const ONE_OVER_SQRT_PI = 0.564189583547756286948 // 1/sqrt(pi)

function erfKernel(absX: number): number {
  // |x| < 0.46875: erf(x) = x * (P0 + P1*y + ... + P4*y^4) / (1 + Q0*y + ... + Q3*y^4)
  // where y = x^2, but we keep the conventional Cody form.
  const y = absX * absX
  let num = ERF_P[4]
  let den = 1
  for (let i = 0; i < 4; i++) {
    num = num * y + ERF_P[i]
    den = den * y + ERF_Q[i]
  }
  return absX * num / den
}

function erfcKernel1(absX: number): number {
  // 0.46875 <= |x| < 4 — note 9 P coefficients, 8 Q coefficients
  let num = ERFC_P1[8]
  let den = 1
  for (let i = 0; i < 8; i++) {
    num = num * absX + ERFC_P1[i]
    den = den * absX + ERFC_Q1[i]
  }
  const r = num / den
  return Math.exp(-absX * absX) * r
}

function erfcKernel2(absX: number): number {
  // |x| >= 4
  const y = 1 / (absX * absX)
  let num = ERFC_P2[5]
  let den = 1
  for (let i = 0; i < 5; i++) {
    num = num * y + ERFC_P2[i]
    den = den * y + ERFC_Q2[i]
  }
  const r = y * num / den
  // erfc(x) = exp(-x^2) / x * (1/sqrt(pi) - y*P/Q)
  return Math.exp(-absX * absX) / absX * (ONE_OVER_SQRT_PI - r)
}

function erfApprox(x: number): number {
  if (x === 0) return 0
  const absX = Math.abs(x)
  let result: number
  if (absX < 0.46875) {
    result = erfKernel(absX)
  } else if (absX < 4) {
    result = 1 - erfcKernel1(absX)
  } else if (absX < 26.5) {
    result = 1 - erfcKernel2(absX)
  } else {
    // erfc(x) underflows; erf(x) saturates to 1
    result = 1
  }
  return x < 0 ? -result : result
}

function erfcApprox(x: number): number {
  if (x === 0) return 1
  const absX = Math.abs(x)
  if (absX < 0.46875) {
    return x < 0 ? 1 + erfKernel(absX) : 1 - erfKernel(absX)
  }
  if (absX < 4) {
    const e = erfcKernel1(absX)
    return x < 0 ? 2 - e : e
  }
  if (absX < 26.5) {
    const e = erfcKernel2(absX)
    return x < 0 ? 2 - e : e
  }
  // For large |x|: erfc(x) → 0 (x>0) or 2 (x<0); exp underflows.
  return x < 0 ? 2 : 0
}

export const ERF: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const lower = toNumber(args[0])
  if (!lower.ok) return lower.error
  if (!Number.isFinite(lower.value)) return ERR('#NUM!')
  if (args.length === 1) return NUM(erfApprox(lower.value))
  const upper = toNumber(args[1])
  if (!upper.ok) return upper.error
  if (!Number.isFinite(upper.value)) return ERR('#NUM!')
  return NUM(erfApprox(upper.value) - erfApprox(lower.value))
}

export const ERF_PRECISE: FunctionImpl = ERF

export const ERFC: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const x = toNumber(args[0])
  if (!x.ok) return x.error
  if (!Number.isFinite(x.value)) return ERR('#NUM!')
  return NUM(erfcApprox(x.value))
}

export const ERFC_PRECISE: FunctionImpl = ERFC

export const FUNCTIONS: Record<string, FunctionImpl> = {
  ERF, 'ERF.PRECISE': ERF_PRECISE, ERFC, 'ERFC.PRECISE': ERFC_PRECISE,
}
