/**
 * 字符与码点互转：CHAR / CODE 走单字节区间，UNICHAR / UNICODE 走完整码点区间。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { coerceText, errValue, ERR_VALUE } from './read-args'

/** CHAR(n) — 1..255 code unit → char. */
export const CHAR: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'CHAR requires 1 argument')
  const err = propagateError(args)
  if (err) return err
  const nr = toNumber(args[0])
  if (!nr.ok) return nr.error
  const n = Math.trunc(nr.value)
  if (n < 1 || n > 255) return ERR_VALUE
  return { kind: 'string', value: String.fromCharCode(n) }
}

/** CODE(text) — first 1..255 code unit as number. */
export const CODE: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'CODE requires 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  if (ts.value.length === 0) return ERR_VALUE
  const code = ts.value.charCodeAt(0)
  if (code < 1 || code > 255) return ERR_VALUE
  return { kind: 'number', value: code }
}

/** UNICODE(text) — first Unicode code point as number. */
export const UNICODE: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'UNICODE requires 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  if (ts.value.length === 0) return ERR_VALUE
  const cp = ts.value.codePointAt(0)
  if (cp === undefined || isSurrogateCodePoint(cp)) return ERR_VALUE
  return { kind: 'number', value: cp }
}

/** UNICHAR(n) — Unicode code point → char. */
export const UNICHAR: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'UNICHAR requires 1 argument')
  const err = propagateError(args)
  if (err) return err
  const nr = toNumber(args[0])
  if (!nr.ok) return nr.error
  const n = Math.trunc(nr.value)
  if (n < 1 || n > 0x10ffff || isSurrogateCodePoint(n)) return ERR_VALUE
  return { kind: 'string', value: String.fromCodePoint(n) }
}

function isSurrogateCodePoint(codePoint: number): boolean {
  return codePoint >= 0xd800 && codePoint <= 0xdfff
}
