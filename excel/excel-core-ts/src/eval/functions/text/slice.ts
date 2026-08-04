/**
 * 以"第几个字符"为坐标读写字符串：LEFT / RIGHT / MID / LEN / REPLACE
 * 及其按 DBCS 字节坐标的 `*B` 变体。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { codepoints, coerceText, errValue, ERR_VALUE } from './read-args'
import {
  dbcsByteLength,
  leftDbcsBytes,
  replaceDbcsBytes,
  rightDbcsBytes,
  sliceDbcsBytes,
} from './dbcs'

/**
 * LEFT(text, [num_chars=1]) — first N code points. `num_chars > length`
 * yields the whole string. `num_chars < 0` → `#VALUE!`. Fractional
 * num_chars is truncated toward zero (Excel semantics).
 */
export const LEFT: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'LEFT takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  let n = 1
  if (args.length === 2) {
    const nr = toNumber(args[1])
    if (!nr.ok) return nr.error
    n = Math.trunc(nr.value)
    if (n < 0) return ERR_VALUE
  }
  const chars = codepoints(ts.value)
  return { kind: 'string', value: chars.slice(0, n).join('') }
}

/**
 * RIGHT(text, [num_chars=1]) — last N code points. Same edge rules as LEFT.
 */
export const RIGHT: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'RIGHT takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  let n = 1
  if (args.length === 2) {
    const nr = toNumber(args[1])
    if (!nr.ok) return nr.error
    n = Math.trunc(nr.value)
    if (n < 0) return ERR_VALUE
  }
  const chars = codepoints(ts.value)
  if (n === 0) return { kind: 'string', value: '' }
  return { kind: 'string', value: chars.slice(chars.length - n).join('') }
}

/**
 * MID(text, start, num_chars) — substring with 1-based `start`.
 *  - `start < 1`                  → `#VALUE!`
 *  - `num_chars < 0`              → `#VALUE!`
 *  - `start > length`             → "" (empty string, not error — Excel)
 *  - `start + num_chars > length` → truncated to end
 */
export const MID: FunctionImpl = (args) => {
  if (args.length !== 3) return errValue('#VALUE!', 'MID takes exactly 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const sr = toNumber(args[1])
  if (!sr.ok) return sr.error
  const nr = toNumber(args[2])
  if (!nr.ok) return nr.error
  const start = Math.trunc(sr.value)
  const num = Math.trunc(nr.value)
  if (start < 1) return ERR_VALUE
  if (num < 0) return ERR_VALUE
  const chars = codepoints(ts.value)
  if (start > chars.length) return { kind: 'string', value: '' }
  // Convert 1-based start to 0-based slice index.
  return { kind: 'string', value: chars.slice(start - 1, start - 1 + num).join('') }
}

/**
 * LEN(text) — code-point count. See module header for the
 * `Array.from(text).length` vs `text.length` choice.
 */
export const LEN: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'LEN takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  return { kind: 'number', value: codepoints(ts.value).length }
}

/** REPLACE(text, start, num_chars, new_text) — replace a substring by position. */
export const REPLACE: FunctionImpl = (args) => {
  if (args.length !== 4) return errValue('#VALUE!', 'REPLACE requires 4 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const sr = toNumber(args[1])
  if (!sr.ok) return sr.error
  const nr = toNumber(args[2])
  if (!nr.ok) return nr.error
  const newR = coerceText(args[3])
  if (!newR.ok) return newR.error
  const start = Math.trunc(sr.value)
  const num = Math.trunc(nr.value)
  if (start < 1 || num < 0) return ERR_VALUE
  const chars = codepoints(ts.value)
  const before = chars.slice(0, start - 1).join('')
  const after = chars.slice(start - 1 + num).join('')
  return { kind: 'string', value: before + newR.value + after }
}

// =============================================================================
// LEFTB / RIGHTB / MIDB / LENB / REPLACEB —— 上面各函数的 DBCS 字节坐标版
// =============================================================================

/**
 * LEFTB(text, [num_bytes=1]) — first N DBCS bytes. ASCII counts as 1 byte;
 * Japanese/full-width characters count as 2 bytes. Partial double-byte chars
 * at the boundary are not returned.
 */
export const LEFTB: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'LEFTB takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  let n = 1
  if (args.length === 2) {
    const nr = toNumber(args[1])
    if (!nr.ok) return nr.error
    n = Math.trunc(nr.value)
    if (n < 0) return ERR_VALUE
  }
  return { kind: 'string', value: leftDbcsBytes(ts.value, n) }
}

/** RIGHTB(text, [num_bytes=1]) — last N DBCS bytes. */
export const RIGHTB: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'RIGHTB takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  let n = 1
  if (args.length === 2) {
    const nr = toNumber(args[1])
    if (!nr.ok) return nr.error
    n = Math.trunc(nr.value)
    if (n < 0) return ERR_VALUE
  }
  return { kind: 'string', value: rightDbcsBytes(ts.value, n) }
}

/** MIDB(text, start_num, num_bytes) — substring by 1-based DBCS byte offsets. */
export const MIDB: FunctionImpl = (args) => {
  if (args.length !== 3) return errValue('#VALUE!', 'MIDB takes exactly 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const sr = toNumber(args[1])
  if (!sr.ok) return sr.error
  const nr = toNumber(args[2])
  if (!nr.ok) return nr.error
  const start = Math.trunc(sr.value)
  const num = Math.trunc(nr.value)
  if (start < 1) return ERR_VALUE
  if (num < 0) return ERR_VALUE
  if (start > dbcsByteLength(ts.value)) return { kind: 'string', value: '' }
  return { kind: 'string', value: sliceDbcsBytes(ts.value, start, num) }
}

/** LENB(text) — DBCS byte count. */
export const LENB: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'LENB takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  return { kind: 'number', value: dbcsByteLength(ts.value) }
}

/** REPLACEB(text, start, num_bytes, new_text) — byte-position variant of REPLACE. */
export const REPLACEB: FunctionImpl = (args) => {
  if (args.length !== 4) return errValue('#VALUE!', 'REPLACEB requires 4 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const sr = toNumber(args[1])
  if (!sr.ok) return sr.error
  const nr = toNumber(args[2])
  if (!nr.ok) return nr.error
  const newR = coerceText(args[3])
  if (!newR.ok) return newR.error
  const start = Math.trunc(sr.value)
  const num = Math.trunc(nr.value)
  if (start < 1 || num < 0) return ERR_VALUE
  return { kind: 'string', value: replaceDbcsBytes(ts.value, start, num, newR.value) }
}
