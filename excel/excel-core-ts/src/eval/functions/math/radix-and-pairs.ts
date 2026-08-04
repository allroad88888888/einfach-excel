/** Radix conversions and paired-array sum functions. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber, toString } from '../../coerce'
import { ERR, NUM } from './shared'

export const BASE: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length < 2 || args.length > 3) return ERR('#VALUE!')
  const nv = toNumber(args[0])
  if (!nv.ok) return nv.error
  const rv = toNumber(args[1])
  if (!rv.ok) return rv.error
  const number = Math.trunc(nv.value)
  const radix = Math.trunc(rv.value)
  if (number < 0 || radix < 2 || radix > 36) return ERR('#NUM!')
  let minLength = 0
  if (args.length === 3) {
    const lv = toNumber(args[2])
    if (!lv.ok) return lv.error
    minLength = Math.trunc(lv.value)
    if (minLength < 0) return ERR('#NUM!')
  }
  return { kind: 'string', value: number.toString(radix).toUpperCase().padStart(minLength, '0') }
}

/** DECIMAL(text, radix) — parse a base 2..36 integer string. */
export const DECIMAL: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const sv = toString(args[0])
  if (!sv.ok) return sv.error
  const rv = toNumber(args[1])
  if (!rv.ok) return rv.error
  const radix = Math.trunc(rv.value)
  if (radix < 2 || radix > 36) return ERR('#NUM!')
  const text = sv.value.trim()
  if (text.length === 0) return ERR('#NUM!')
  let out = 0
  for (const ch of text.toUpperCase()) {
    const digit = Number.parseInt(ch, 36)
    if (!Number.isInteger(digit) || digit < 0 || digit >= radix) return ERR('#NUM!')
    out = out * radix + digit
    if (!Number.isSafeInteger(out)) return ERR('#NUM!')
  }
  return NUM(out)
}

function gridForPair(value: Value): Value[][] | null {
  if (value.kind === 'array') {
    if (value.value.length === 0 || (value.value[0]?.length ?? 0) === 0) return null
    return value.value
  }
  if (value.kind === 'blank') return null
  return [[value]]
}

type PairNumbersResult =
  | { ok: true; pairs: [number, number][] }
  | { ok: false; error: Value & { kind: 'error' } }

function pairedNumbers(args: ReadonlyArray<Value>): PairNumbersResult {
  const propagated = propagateError(args)
  if (propagated) return { ok: false, error: propagated }
  if (args.length !== 2) return { ok: false, error: ERR('#VALUE!') as Value & { kind: 'error' } }
  const a = gridForPair(args[0])
  const b = gridForPair(args[1])
  if (!a || !b) return { ok: false, error: ERR('#VALUE!') as Value & { kind: 'error' } }
  const rows = a.length
  const cols = a[0].length
  if (b.length !== rows || b[0].length !== cols) {
    return { ok: false, error: ERR('#VALUE!') as Value & { kind: 'error' } }
  }
  const pairs: [number, number][] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const av = a[r][c]
      const bv = b[r][c]
      if (av.kind === 'error') return { ok: false, error: av }
      if (bv.kind === 'error') return { ok: false, error: bv }
      if (av.kind === 'number' && bv.kind === 'number') pairs.push([av.value, bv.value])
    }
  }
  return { ok: true, pairs }
}

function sumPairImpl(args: ReadonlyArray<Value>, fn: (x: number, y: number) => number): Value {
  const pairs = pairedNumbers(args)
  if (!pairs.ok) return pairs.error
  let total = 0
  for (const [x, y] of pairs.pairs) total += fn(x, y)
  if (!Number.isFinite(total)) return ERR('#NUM!')
  return NUM(total)
}

export const SUMX2MY2: FunctionImpl = (args) => sumPairImpl(args, (x, y) => x * x - y * y)
export const SUMX2PY2: FunctionImpl = (args) => sumPairImpl(args, (x, y) => x * x + y * y)
export const SUMXMY2: FunctionImpl = (args) => sumPairImpl(args, (x, y) => (x - y) * (x - y))

export const FUNCTIONS: Record<string, FunctionImpl> = { BASE, DECIMAL, SUMX2MY2, SUMX2PY2, SUMXMY2 }
