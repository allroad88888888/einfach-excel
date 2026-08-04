/** Basic rounding, sign, and scalar arithmetic functions. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

function roundScaledHalfAwayFromZero(abs: number, factor: number): number {
  const scaled = abs * factor
  if (!Number.isFinite(scaled) || Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
    return Math.round(scaled)
  }
  const lower = Math.floor(scaled)
  const half = lower + 0.5
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4
  const adjusted = Math.abs(scaled - half) <= tolerance ? half : scaled
  return Math.round(adjusted)
}

function roundHalfAwayFromZero(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x
  const factor = Math.pow(10, digits)
  return (x >= 0 ? 1 : -1) * roundScaledHalfAwayFromZero(Math.abs(x), factor) / factor
}

function roundAwayFromZero(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x
  const factor = Math.pow(10, digits)
  return (x >= 0 ? Math.ceil(x * factor) : -Math.ceil(-x * factor)) / factor
}

export function truncTowardZero(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x
  const factor = Math.pow(10, digits)
  return (x >= 0 ? Math.floor(x * factor) : -Math.floor(-x * factor)) / factor
}

function unaryRounder(args: ReadonlyArray<Value>, fn: (n: number, d: number) => number): Value {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const d = toNumber(args[1])
  if (!d.ok) return d.error
  const digits = Math.trunc(d.value)
  const out = fn(v.value, digits)
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

export const ROUND: FunctionImpl = (args) => unaryRounder(args, roundHalfAwayFromZero)
export const ROUNDUP: FunctionImpl = (args) => unaryRounder(args, roundAwayFromZero)
export const ROUNDDOWN: FunctionImpl = (args) => unaryRounder(args, truncTowardZero)

export const INT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  // Excel INT rounds toward NEGATIVE INFINITY (floor), not toward zero.
  return NUM(Math.floor(v.value))
}

export const MOD: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  const b = toNumber(args[1])
  if (!b.ok) return b.error
  if (b.value === 0) return ERR('#DIV/0!')
  // Excel MOD: a - b * INT(a / b) — INT here is floor, so the sign of
  // the result follows the divisor's sign (not JS `%` which follows
  // the dividend).
  const out = a.value - b.value * Math.floor(a.value / b.value)
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

export const ABS: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  return NUM(Math.abs(v.value))
}

export const POWER: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const base = toNumber(args[0])
  if (!base.ok) return base.error
  const exp = toNumber(args[1])
  if (!exp.ok) return exp.error
  if (base.value === 0 && exp.value === 0) {
    // Excel: POWER(0, 0) is #NUM! (matches the engine's treatment of
    // 0^0 as undefined). JS would return 1.
    return ERR('#NUM!')
  }
  if (base.value === 0 && exp.value < 0) {
    return ERR('#DIV/0!')
  }
  const out = Math.pow(base.value, exp.value)
  // POWER(-2, 0.5) → NaN → #NUM!
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

export const SQRT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  if (v.value < 0) return ERR('#NUM!')
  return NUM(Math.sqrt(v.value))
}

export const SIGN: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  if (v.value > 0) return NUM(1)
  if (v.value < 0) return NUM(-1)
  return NUM(0)
}


export const FUNCTIONS: Record<string, FunctionImpl> = { ROUND, ROUNDUP, ROUNDDOWN, INT, MOD, ABS, POWER, SQRT, SIGN }
