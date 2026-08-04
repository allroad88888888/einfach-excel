/** Factorial, combination, and permutation functions. */

import type { FunctionImpl } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'
import { forEachNumericArg } from './aggregation'

export const FACT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const n = Math.trunc(v.value)
  if (n < 0) return ERR('#NUM!')
  if (n > 170) return ERR('#NUM!') // overflow past Number.MAX_VALUE
  let out = 1
  for (let i = 2; i <= n; i++) out *= i
  return NUM(out)
}

/** FACTDOUBLE(n) — double factorial n!! */
export const FACTDOUBLE: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const n = Math.trunc(v.value)
  if (n < -1) return ERR('#NUM!')
  if (n <= 0) return NUM(1)
  let out = 1
  for (let i = n; i > 0; i -= 2) out *= i
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

/** COMBIN(n, k) — combinations C(n, k). */
export const COMBIN: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const nv = toNumber(args[0])
  if (!nv.ok) return nv.error
  const kv = toNumber(args[1])
  if (!kv.ok) return kv.error
  const n = Math.trunc(nv.value)
  const k = Math.trunc(kv.value)
  if (n < 0 || k < 0 || k > n) return ERR('#NUM!')
  if (k === 0 || k === n) return NUM(1)
  // Compute C(n,k) iteratively to avoid overflow as long as possible.
  const r = Math.min(k, n - k)
  let out = 1
  for (let i = 0; i < r; i++) {
    out = (out * (n - i)) / (i + 1)
  }
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(Math.round(out))
}

/** PERMUT(n, k) — n! / (n-k)! */
export const PERMUT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const nv = toNumber(args[0])
  if (!nv.ok) return nv.error
  const kv = toNumber(args[1])
  if (!kv.ok) return kv.error
  const n = Math.trunc(nv.value)
  const k = Math.trunc(kv.value)
  if (n < 0 || k < 0 || k > n) return ERR('#NUM!')
  let out = 1
  for (let i = 0; i < k; i++) out *= n - i
  if (!Number.isFinite(out)) return ERR('#NUM!')
  return NUM(out)
}

function factorialFinite(n: number): number | null {
  if (n > 170) return null
  let out = 1
  for (let i = 2; i <= n; i += 1) {
    out *= i
    if (!Number.isFinite(out)) return null
  }
  return out
}

/** COMBINA(n, k) — combinations with repetition. */
export const COMBINA: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const nv = toNumber(args[0])
  if (!nv.ok) return nv.error
  const kv = toNumber(args[1])
  if (!kv.ok) return kv.error
  const n = Math.trunc(nv.value)
  const k = Math.trunc(kv.value)
  if (n < 0 || k < 0) return ERR('#NUM!')
  if (n === 0 && k === 0) return NUM(1)
  const top = n + k - 1
  const pick = Math.min(k, top - k)
  let out = 1
  for (let i = 1; i <= pick; i += 1) {
    out = (out * (top - i + 1)) / i
    if (!Number.isFinite(out)) return ERR('#NUM!')
  }
  return NUM(Math.round(out))
}

/** PERMUTATIONA(n, k) — permutations with repetition, n^k. */
export const PERMUTATIONA: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const nv = toNumber(args[0])
  if (!nv.ok) return nv.error
  const kv = toNumber(args[1])
  if (!kv.ok) return kv.error
  const n = Math.trunc(nv.value)
  const k = Math.trunc(kv.value)
  if (n < 0 || k < 0) return ERR('#NUM!')
  if (n === 0 && k === 0) return NUM(1)
  const out = Math.pow(n, k)
  if (!Number.isFinite(out) || Number.isNaN(out)) return ERR('#NUM!')
  return NUM(out)
}

/** MULTINOMIAL(n1, n2, ...) — (sum n)! / product(n!). */
export const MULTINOMIAL: FunctionImpl = (args) => {
  if (args.length === 0) return ERR('#VALUE!')
  const nums: number[] = []
  const walk = forEachNumericArg(args, (n) => {
    nums.push(Math.trunc(n))
  })
  if (!walk.ok) return walk.error
  if (nums.length === 0) return ERR('#VALUE!')
  if (nums.some((n) => n < 0)) return ERR('#NUM!')
  const total = nums.reduce((a, b) => a + b, 0)
  const numerator = factorialFinite(total)
  if (numerator === null) return ERR('#NUM!')
  let denominator = 1
  for (const n of nums) {
    const f = factorialFinite(n)
    if (f === null) return ERR('#NUM!')
    denominator *= f
    if (!Number.isFinite(denominator) || denominator === 0) return ERR('#NUM!')
  }
  return NUM(numerator / denominator)
}


export const FUNCTIONS: Record<string, FunctionImpl> = { FACT, FACTDOUBLE, COMBIN, PERMUT, COMBINA, PERMUTATIONA, MULTINOMIAL }
