/**
 * 把 `Value` 实参读成文本函数要用的形状（字符串、码点、整数、布尔、嵌套错误），
 * 读不出来就返回 `#VALUE!` 家族的错误 `Value`。
 */

import { toBoolean, toNumber, toString as valueToString } from '../../coerce'
import type { Value } from '../../../types'

export const ERR_VALUE: Value = { kind: 'error', code: '#VALUE!' }
export const ERR_NA: Value = { kind: 'error', code: '#N/A' }

/** Convenience: build an error Value with code + optional message. */
export function errValue(code: '#VALUE!' | '#NAME?' | '#NUM!' | '#N/A', message?: string): Value {
  return message ? { kind: 'error', code, message } : { kind: 'error', code }
}

/**
 * Code-point split (Unicode-safe). For LEFT/RIGHT/MID/LEN the contract is
 * "1 user-visible character" — not "1 UTF-16 code unit". `Array.from`
 * iterates by code points (because `String.prototype[Symbol.iterator]`
 * yields code points), so a 4-byte emoji counts as 1.
 *
 * NB: this is not full Unicode grapheme-cluster segmentation — a flag emoji
 * (regional-indicator pair) still counts as 2. Grapheme clusters would need
 * `Intl.Segmenter`, which we defer until a real complaint shows up.
 */
export function codepoints(s: string): string[] {
  return Array.from(s)
}

/**
 * Coerce a Value to a string for text-function input. Booleans become
 * "TRUE"/"FALSE", numbers stringify, blank → "". Errors propagate.
 *
 * This is `coerce.toString` reused — kept as a helper here to make the
 * call sites self-documenting (the text-fn input contract is exactly
 * the same as `valueToString`).
 */
export function coerceText(v: Value): { ok: true; value: string } | { ok: false; error: Value } {
  const r = valueToString(v)
  if (r.ok) return { ok: true, value: r.value }
  return { ok: false, error: r.error }
}

/**
 * Flatten array `Value` recursively into a stream of scalar `Value`s. Used
 * by CONCAT (which, unlike CONCATENATE, takes array args and joins their
 * elements in row-major order).
 */
export function* flattenForConcat(v: Value): Generator<Value> {
  if (v.kind === 'array') {
    for (const row of v.value) {
      for (const cell of row) {
        yield* flattenForConcat(cell)
      }
    }
    return
  }
  yield v
}

export function findNestedError(v: Value): (Value & { kind: 'error' }) | undefined {
  if (v.kind === 'error') return v
  if (v.kind !== 'array') return undefined
  for (const row of v.value) {
    for (const cell of row) {
      const err = findNestedError(cell)
      if (err) return err
    }
  }
  return undefined
}

export function readInteger(v: Value): { ok: true; value: number } | { ok: false; error: Value } {
  const r = toNumber(v)
  if (!r.ok) return r
  if (!Number.isFinite(r.value)) return { ok: false, error: ERR_VALUE }
  return { ok: true, value: Math.trunc(r.value) }
}

export function readBoolean(v: Value): { ok: true; value: boolean } | { ok: false; error: Value } {
  const r = toBoolean(v)
  if (!r.ok) return r
  return { ok: true, value: r.value }
}
