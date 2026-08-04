/** Excel-compatible multiple and precision rounding functions. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'
import { unaryNumber } from './trigonometry'

export const MROUND: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const n = toNumber(args[0])
  if (!n.ok) return n.error
  const m = toNumber(args[1])
  if (!m.ok) return m.error
  if (m.value === 0) return NUM(0)
  // Excel requires same sign.
  if ((n.value > 0 && m.value < 0) || (n.value < 0 && m.value > 0)) return ERR('#NUM!')
  return NUM(Math.round(n.value / m.value) * m.value)
}

/** QUOTIENT(numerator, denominator) — integer division (truncate toward zero). */
export const QUOTIENT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  const b = toNumber(args[1])
  if (!b.ok) return b.error
  if (b.value === 0) return ERR('#DIV/0!')
  return NUM(Math.trunc(a.value / b.value))
}

/** EVEN(n) — round away from zero to next even integer. */
export const EVEN: FunctionImpl = (args) => unaryNumber(args, (n) => {
  const sign = n >= 0 ? 1 : -1
  const abs = Math.abs(n)
  const ceiled = Math.ceil(abs)
  return sign * (ceiled % 2 === 0 ? ceiled : ceiled + 1)
})

/** ODD(n) — round away from zero to next odd integer. */
export const ODD: FunctionImpl = (args) => unaryNumber(args, (n) => {
  const sign = n >= 0 ? 1 : -1
  const abs = Math.abs(n)
  const ceiled = Math.ceil(abs)
  return sign * (ceiled % 2 === 1 ? ceiled : ceiled + 1)
})

function floorCeilingMath(args: ReadonlyArray<Value>, isFloor: boolean): Value {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 1 || args.length > 3) return ERR('#VALUE!')

  const n = toNumber(args[0])
  if (!n.ok) return n.error

  let significance = 1
  if (args.length >= 2) {
    const sig = toNumber(args[1])
    if (!sig.ok) return sig.error
    significance = sig.value
  }

  let mode = 0
  if (args.length === 3) {
    const m = toNumber(args[2])
    if (!m.ok) return m.error
    mode = m.value
  }

  if (significance === 0) return NUM(0)
  const s = Math.abs(significance)
  const scaled = n.value / s
  const out = isFloor
    ? (n.value < 0 && mode !== 0 ? Math.ceil(scaled) : Math.floor(scaled)) * s
    : (n.value < 0 && mode !== 0 ? Math.floor(scaled) : Math.ceil(scaled)) * s
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

function floorCeilingPrecise(args: ReadonlyArray<Value>, isFloor: boolean): Value {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')

  const n = toNumber(args[0])
  if (!n.ok) return n.error

  let significance = 1
  if (args.length === 2) {
    const sig = toNumber(args[1])
    if (!sig.ok) return sig.error
    significance = sig.value
  }

  if (significance === 0) return NUM(0)
  const s = Math.abs(significance)
  const scaled = n.value / s
  const out = (isFloor ? Math.floor(scaled) : Math.ceil(scaled)) * s
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

export const FLOOR_MATH: FunctionImpl = (args) => floorCeilingMath(args, true)
export const CEILING_MATH: FunctionImpl = (args) => floorCeilingMath(args, false)
export const FLOOR_PRECISE: FunctionImpl = (args) => floorCeilingPrecise(args, true)
export const CEILING_PRECISE: FunctionImpl = (args) => floorCeilingPrecise(args, false)
export const ISO_CEILING: FunctionImpl = CEILING_PRECISE

export const FUNCTIONS: Record<string, FunctionImpl> = {
  MROUND,
  QUOTIENT,
  EVEN,
  ODD,
  'FLOOR.MATH': FLOOR_MATH,
  'CEILING.MATH': CEILING_MATH,
  'FLOOR.PRECISE': FLOOR_PRECISE,
  'CEILING.PRECISE': CEILING_PRECISE,
  'ISO.CEILING': ISO_CEILING,
}
