/** Excel base-conversion functions. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

/**
 * Parse a string in the given base. Excel allows up to 10 characters of
 * input. Values with the high bit set (e.g. "FFFFFFFFFF" hex) are
 * two's-complement negatives within the source base's signed width.
 */
function parseBaseString(
  s: string,
  base: number,
  maxChars: number,
  bitsPerDigit: number,
): number | null {
  const trimmed = s.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > maxChars) return null
  // Verify valid digits.
  const validRe = base === 2 ? /^[01]+$/
    : base === 8 ? /^[0-7]+$/
    : base === 16 ? /^[0-9A-Fa-f]+$/
    : /^[0-9]+$/
  if (!validRe.test(trimmed)) return null
  let n = 0
  for (const ch of trimmed) {
    n = n * base + parseInt(ch, base)
  }
  // Two's complement for the high-bit-set case (only relevant when maxChars
  // is the full width).
  if (trimmed.length === maxChars) {
    const bits = maxChars * bitsPerDigit
    const highBit = Math.pow(2, bits - 1)
    if (n >= highBit) {
      n -= Math.pow(2, bits)
    }
  }
  return n
}

/** Format a number in the given base, using two's complement for negatives. */
function formatBaseString(
  n: number,
  base: number,
  maxChars: number,
  bitsPerDigit: number,
): string | null {
  if (!Number.isFinite(n)) return null
  const bits = maxChars * bitsPerDigit
  const lo = -Math.pow(2, bits - 1)
  const hi = Math.pow(2, bits - 1) - 1
  let value = Math.trunc(n)
  if (value < lo || value > hi) return null
  if (value < 0) {
    value += Math.pow(2, bits)
  }
  const digits = '0123456789ABCDEF'
  if (value === 0) return '0'
  let out = ''
  while (value > 0) {
    const r = value % base
    out = digits[r] + out
    value = Math.floor(value / base)
  }
  return n < 0 ? out.padStart(maxChars, '0') : out
}

type PlacesResult =
  | { readonly ok: true; readonly value: number | undefined }
  | { readonly ok: false; readonly error: Value }

function placesValue(arg: Value | undefined, maxChars: number): PlacesResult {
  if (arg === undefined) return { ok: true, value: undefined }
  const p = toNumber(arg)
  if (!p.ok) return { ok: false, error: p.error }
  const places = Math.trunc(p.value)
  if (places < 1 || places > maxChars) return { ok: false, error: ERR('#NUM!') }
  return { ok: true, value: places }
}

function inputBaseString(v: Value): string | Value {
  if (v.kind === 'string') return v.value
  if (v.kind === 'number') return Math.trunc(v.value).toString()
  return ERR('#VALUE!')
}

function decToXxx(
  args: ReadonlyArray<Value>,
  base: number,
  maxChars: number,
  bitsPerDigit: number,
): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const v = toNumber(args[0])
  if (!v.ok) return v.error
  const n = Math.trunc(v.value)
  const formatted = formatBaseString(n, base, maxChars, bitsPerDigit)
  if (formatted === null) return ERR('#NUM!')
  // Optional places argument.
  if (args.length === 2) {
    const places = placesValue(args[1], maxChars)
    if (!places.ok) return places.error
    if (n < 0) {
      // Excel ignores `places` for negatives.
      return { kind: 'string', value: formatted }
    }
    if (places.value === undefined || formatted.length > places.value) return ERR('#NUM!')
    return { kind: 'string', value: formatted.padStart(places.value, '0') }
  }
  return { kind: 'string', value: formatted }
}

function xxxToDec(
  args: ReadonlyArray<Value>,
  base: number,
  maxChars: number,
  bitsPerDigit: number,
): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length !== 1) return ERR('#VALUE!')
  const s = inputBaseString(args[0])
  if (typeof s !== 'string') return s
  const parsed = parseBaseString(s, base, maxChars, bitsPerDigit)
  if (parsed === null) return ERR('#NUM!')
  return NUM(parsed)
}

function crossBase(
  args: ReadonlyArray<Value>,
  fromBase: number,
  fromBitsPerDigit: number,
  toBase: number,
  toBitsPerDigit: number,
): Value {
  const err = propagateError(args)
  if (err) return err
  if (args.length < 1 || args.length > 2) return ERR('#VALUE!')
  const s = inputBaseString(args[0])
  if (typeof s !== 'string') return s
  const parsed = parseBaseString(s, fromBase, 10, fromBitsPerDigit)
  if (parsed === null) return ERR('#NUM!')
  const formatted = formatBaseString(parsed, toBase, 10, toBitsPerDigit)
  if (formatted === null) return ERR('#NUM!')
  if (args.length === 2) {
    const places = placesValue(args[1], 10)
    if (!places.ok) return places.error
    if (parsed < 0) return { kind: 'string', value: formatted }
    if (places.value === undefined || formatted.length > places.value) return ERR('#NUM!')
    return { kind: 'string', value: formatted.padStart(places.value, '0') }
  }
  return { kind: 'string', value: formatted }
}

// ---------------------------------------------------------------------------
// Base conversions
// ---------------------------------------------------------------------------

export const DEC2BIN: FunctionImpl = (args) => decToXxx(args, 2, 10, 1)
export const DEC2OCT: FunctionImpl = (args) => decToXxx(args, 8, 10, 3)
export const DEC2HEX: FunctionImpl = (args) => decToXxx(args, 16, 10, 4)

export const BIN2DEC: FunctionImpl = (args) => xxxToDec(args, 2, 10, 1)
export const OCT2DEC: FunctionImpl = (args) => xxxToDec(args, 8, 10, 3)
export const HEX2DEC: FunctionImpl = (args) => xxxToDec(args, 16, 10, 4)

export const BIN2HEX: FunctionImpl = (args) => crossBase(args, 2, 1, 16, 4)
export const BIN2OCT: FunctionImpl = (args) => crossBase(args, 2, 1, 8, 3)
export const HEX2BIN: FunctionImpl = (args) => crossBase(args, 16, 4, 2, 1)
export const HEX2OCT: FunctionImpl = (args) => crossBase(args, 16, 4, 8, 3)
export const OCT2BIN: FunctionImpl = (args) => crossBase(args, 8, 3, 2, 1)
export const OCT2HEX: FunctionImpl = (args) => crossBase(args, 8, 3, 16, 4)

export const FUNCTIONS: Record<string, FunctionImpl> = {
  DEC2BIN, DEC2OCT, DEC2HEX, BIN2DEC, OCT2DEC, HEX2DEC,
  BIN2HEX, BIN2OCT, HEX2BIN, HEX2OCT, OCT2BIN, OCT2HEX,
}
