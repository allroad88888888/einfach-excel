/** Trigonometric, logarithmic, and random-number functions. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

export function unaryNumber(args: ReadonlyArray<Value>, fn: (n: number) => number): Value {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const out = fn(v.value)
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

// Trig & inverse trig
export const SIN: FunctionImpl = (args) => unaryNumber(args, Math.sin)
export const COS: FunctionImpl = (args) => unaryNumber(args, Math.cos)
export const TAN: FunctionImpl = (args) => unaryNumber(args, Math.tan)
export const ASIN: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n < -1 || n > 1) return Number.NaN
  return Math.asin(n)
})
export const ACOS: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n < -1 || n > 1) return Number.NaN
  return Math.acos(n)
})
export const ATAN: FunctionImpl = (args) => unaryNumber(args, Math.atan)
export const ATAN2: FunctionImpl = (args) => {
  // Excel: ATAN2(x, y) — arg order is (x, y), not Math.atan2's (y, x).
  // Per Microsoft docs, ATAN2(0, 0) yields #DIV/0! (atan2 is undefined at
  // the origin); other args use the standard math.atan2 result.
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  const b = toNumber(args[1])
  if (!b.ok) return b.error
  if (a.value === 0 && b.value === 0) return ERR('#DIV/0!')
  const out = Math.atan2(b.value, a.value)
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

// Hyperbolic
export const SINH: FunctionImpl = (args) => unaryNumber(args, Math.sinh)
export const COSH: FunctionImpl = (args) => unaryNumber(args, Math.cosh)
export const TANH: FunctionImpl = (args) => unaryNumber(args, Math.tanh)
export const ASINH: FunctionImpl = (args) => unaryNumber(args, Math.asinh)
export const ACOSH: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n < 1) return Number.NaN
  return Math.acosh(n)
})
export const ATANH: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n <= -1 || n >= 1) return Number.NaN
  return Math.atanh(n)
})

// Reciprocal trig
export const CSC: FunctionImpl = (args) => unaryNumber(args, (n) => {
  const s = Math.sin(n)
  if (s === 0) return Number.NaN
  return 1 / s
})
export const SEC: FunctionImpl = (args) => unaryNumber(args, (n) => {
  const c = Math.cos(n)
  if (c === 0) return Number.NaN
  return 1 / c
})
export const COT: FunctionImpl = (args) => unaryNumber(args, (n) => {
  const t = Math.tan(n)
  if (t === 0) return Number.NaN
  return 1 / t
})

// Reciprocal hyperbolic
export const CSCH: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const s = Math.sinh(v.value)
  if (s === 0) return ERR('#DIV/0!')
  const out = 1 / s
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

export const SECH: FunctionImpl = (args) => unaryNumber(args, (n) => 1 / Math.cosh(n))

export const COTH: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const t = Math.tanh(v.value)
  if (t === 0) return ERR('#DIV/0!')
  const out = 1 / t
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

// Inverse reciprocal trig
export const ACSC: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  if (v.value === 0) return ERR('#DIV/0!')
  if (Math.abs(v.value) < 1) return ERR('#NUM!')
  const out = Math.asin(1 / v.value)
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

export const ASEC: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  if (v.value === 0) return ERR('#DIV/0!')
  if (Math.abs(v.value) < 1) return ERR('#NUM!')
  const out = Math.acos(1 / v.value)
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

export const ACOT: FunctionImpl = (args) =>
  unaryNumber(args, (n) => Math.PI / 2 - Math.atan(n))

export const ACOTH: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (Math.abs(n) <= 1) return Number.NaN
  return 0.5 * Math.log((n + 1) / (n - 1))
})

// Angle conversion
export const RADIANS: FunctionImpl = (args) => unaryNumber(args, (d) => (d * Math.PI) / 180)
export const DEGREES: FunctionImpl = (args) => unaryNumber(args, (r) => (r * 180) / Math.PI)

// Exponential / logarithmic
export const EXP: FunctionImpl = (args) => unaryNumber(args, Math.exp)
export const LN: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n <= 0) return Number.NaN
  return Math.log(n)
})
export const LOG10: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n <= 0) return Number.NaN
  return Math.log10(n)
})
/** LOG(number, [base=10]) — like LOG10 by default; second arg = base. */
export const LOG: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const n = toNumber(args[0])
  if (!n.ok) return n.error
  if (n.value <= 0) return ERR('#NUM!')
  let base = 10
  if (args.length === 2) {
    const b = toNumber(args[1])
    if (!b.ok) return b.error
    if (b.value <= 0 || b.value === 1) return ERR('#NUM!')
    base = b.value
  }
  return NUM(Math.log(n.value) / Math.log(base))
}

// Constants
export const PI: FunctionImpl = (args) => {
  if (args.length !== 0) return ERR('#VALUE!')
  return NUM(Math.PI)
}

// Random
export const RAND: FunctionImpl = (args) => {
  if (args.length !== 0) return ERR('#VALUE!')
  return NUM(Math.random())
}

export const RANDBETWEEN: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const lo = toNumber(args[0])
  if (!lo.ok) return lo.error
  const hi = toNumber(args[1])
  if (!hi.ok) return hi.error
  const low = Math.ceil(lo.value)
  const high = Math.floor(hi.value)
  if (low > high) return ERR('#NUM!')
  return NUM(Math.floor(Math.random() * (high - low + 1)) + low)
}

export const FUNCTIONS: Record<string, FunctionImpl> = {
  SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2, SINH, COSH, TANH, ASINH, ACOSH, ATANH,
  CSC, SEC, COT, CSCH, SECH, COTH, ACSC, ASEC, ACOT, ACOTH, RADIANS, DEGREES,
  EXP, LN, LOG10, LOG, PI, RAND, RANDBETWEEN,
}
