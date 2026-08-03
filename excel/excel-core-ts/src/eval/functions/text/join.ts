/**
 * 把多段文本按顺序拼成一个字符串：CONCATENATE / CONCAT / TEXTJOIN / REPT。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { coerceText, errValue, flattenForConcat, ERR_VALUE } from './read-args'

/**
 * CONCATENATE(text1, text2, ...) — concatenate string representations of
 * every arg in order. At least one argument required. Errors propagate
 * (first error wins). Arrays are coerced top-left scalar (Excel behavior
 * for the *legacy* function).
 */
export const CONCATENATE: FunctionImpl = (args) => {
  if (args.length === 0) return errValue('#VALUE!', 'CONCATENATE requires at least one argument')
  const err = propagateError(args)
  if (err) return err
  let out = ''
  for (const a of args) {
    const r = coerceText(a)
    if (!r.ok) return r.error
    out += r.value
  }
  return { kind: 'string', value: out }
}

/**
 * CONCAT(text1, text2, ...) — like CONCATENATE but **flattens arrays**.
 * `CONCAT(A1:A3)` glues the three cells in row-major order. Post-2019
 * Excel addition.
 */
export const CONCAT: FunctionImpl = (args) => {
  if (args.length === 0) return errValue('#VALUE!', 'CONCAT requires at least one argument')
  const err = propagateError(args)
  if (err) return err
  let out = ''
  for (const a of args) {
    for (const scalar of flattenForConcat(a)) {
      if (scalar.kind === 'error') return scalar
      const r = coerceText(scalar)
      if (!r.ok) return r.error
      out += r.value
    }
  }
  return { kind: 'string', value: out }
}

/**
 * TEXTJOIN(delimiter, ignore_empty, ...args) — concatenate with delimiter.
 * `ignore_empty=TRUE` skips blank cells and empty strings.
 */
export const TEXTJOIN: FunctionImpl = (args) => {
  if (args.length < 3) return errValue('#VALUE!', 'TEXTJOIN requires 3+ arguments')
  // Errors in args propagate.
  const err = propagateError(args)
  if (err) return err
  const delR = coerceText(args[0])
  if (!delR.ok) return delR.error
  const ig = args[1]
  let ignoreEmpty = true
  if (ig.kind === 'boolean') ignoreEmpty = ig.value
  else if (ig.kind === 'number') ignoreEmpty = ig.value !== 0
  else if (ig.kind === 'blank') ignoreEmpty = false
  // Collect strings.
  const parts: string[] = []
  for (let i = 2; i < args.length; i++) {
    const a = args[i]
    if (a.kind === 'array') {
      for (const row of a.value) {
        for (const cell of row) {
          if (cell.kind === 'error') return cell
          if (cell.kind === 'blank') {
            if (!ignoreEmpty) parts.push('')
            continue
          }
          const s = coerceText(cell)
          if (!s.ok) return s.error
          if (ignoreEmpty && s.value === '') continue
          parts.push(s.value)
        }
      }
    } else {
      if (a.kind === 'blank') {
        if (!ignoreEmpty) parts.push('')
        continue
      }
      const s = coerceText(a)
      if (!s.ok) return s.error
      if (ignoreEmpty && s.value === '') continue
      parts.push(s.value)
    }
  }
  const joined = parts.join(delR.value)
  if (Array.from(joined).length > 32767) return errValue('#VALUE!')
  return { kind: 'string', value: joined }
}

/** REPT(text, n) — repeat text n times. */
export const REPT: FunctionImpl = (args) => {
  if (args.length !== 2) return errValue('#VALUE!', 'REPT requires 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const nr = toNumber(args[1])
  if (!nr.ok) return nr.error
  const n = Math.trunc(nr.value)
  if (n < 0) return ERR_VALUE
  if (n === 0) return { kind: 'string', value: '' }
  // Excel caps REPT output at ~32K chars.
  if (n * ts.value.length > 32_767) return errValue('#VALUE!', 'REPT result too large')
  return { kind: 'string', value: ts.value.repeat(n) }
}
