/** Excel bitwise operations and numeric comparators. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

const BIT_MAX = 281_474_976_710_655 // 2^48 - 1

function bitOp(args: ReadonlyArray<Value>, op: (a: number, b: number) => number): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  const b = toNumber(args[1])
  if (!b.ok) return b.error
  const av = Math.trunc(a.value)
  const bv = Math.trunc(b.value)
  if (av < 0 || bv < 0 || av > BIT_MAX || bv > BIT_MAX) return ERR('#NUM!')
  // Use BigInt for 48-bit-safe ops.
  const out = Number(op(av, bv))
  return NUM(out)
}

export const BITAND: FunctionImpl = (args) => bitOp(args, (a, b) => {
  // 48-bit AND via BigInt (Number bitwise ops are 32-bit).
  return Number(BigInt(a) & BigInt(b))
})

export const BITOR: FunctionImpl = (args) => bitOp(args, (a, b) => {
  return Number(BigInt(a) | BigInt(b))
})

export const BITXOR: FunctionImpl = (args) => bitOp(args, (a, b) => {
  return Number(BigInt(a) ^ BigInt(b))
})

export const BITLSHIFT: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  const s = toNumber(args[1])
  if (!s.ok) return s.error
  const av = Math.trunc(a.value)
  const shift = Math.trunc(s.value)
  if (av < 0 || av > BIT_MAX) return ERR('#NUM!')
  if (Math.abs(shift) > 53) return ERR('#NUM!')
  const out = shift >= 0
    ? Number(BigInt(av) << BigInt(shift))
    : Number(BigInt(av) >> BigInt(-shift))
  if (out > BIT_MAX) return ERR('#NUM!')
  return NUM(out)
}

export const BITRSHIFT: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  const s = toNumber(args[1])
  if (!s.ok) return s.error
  const av = Math.trunc(a.value)
  const shift = Math.trunc(s.value)
  if (av < 0 || av > BIT_MAX) return ERR('#NUM!')
  if (Math.abs(shift) > 53) return ERR('#NUM!')
  const out = shift >= 0
    ? Number(BigInt(av) >> BigInt(shift))
    : Number(BigInt(av) << BigInt(-shift))
  if (out > BIT_MAX) return ERR('#NUM!')
  return NUM(out)
}

// ---------------------------------------------------------------------------
// Comparators
// ---------------------------------------------------------------------------

/** DELTA(a, [b=0]) — 1 if equal, 0 otherwise. */
export const DELTA: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const a = toNumber(args[0])
  if (!a.ok) return a.error
  let b = 0
  if (args.length === 2) {
    const r = toNumber(args[1])
    if (!r.ok) return r.error
    b = r.value
  }
  return NUM(a.value === b ? 1 : 0)
}

/** GESTEP(n, [step=0]) — 1 if n >= step, 0 otherwise. */
export const GESTEP: FunctionImpl = (args) => {
  const err = propagateError(args)
  if (err) return err
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const n = toNumber(args[0])
  if (!n.ok) return n.error
  let step = 0
  if (args.length === 2) {
    const r = toNumber(args[1])
    if (!r.ok) return r.error
    step = r.value
  }
  return NUM(n.value >= step ? 1 : 0)
}

export const FUNCTIONS: Record<string, FunctionImpl> = {
  BITAND, BITOR, BITXOR, BITLSHIFT, BITRSHIFT, DELTA, GESTEP,
}
