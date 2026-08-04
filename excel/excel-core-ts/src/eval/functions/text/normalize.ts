/**
 * 把文本规整成规范形态（大小写、多余空白、非打印控制字符）：
 * LOWER / UPPER / PROPER / TRIM / CLEAN。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { coerceText, errValue } from './read-args'

/** LOWER(text) — locale-independent lowercasing. */
export const LOWER: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'LOWER takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  return { kind: 'string', value: ts.value.toLowerCase() }
}

/** UPPER(text) — locale-independent uppercasing. */
export const UPPER: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'UPPER takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  return { kind: 'string', value: ts.value.toUpperCase() }
}

/**
 * TRIM(text) — Excel's TRIM, NOT JS `.trim()`:
 *  1. Strip leading U+0020 spaces.
 *  2. Strip trailing U+0020 spaces.
 *  3. Collapse interior runs of U+0020 spaces to a single space.
 *
 * Excel specifically trims ASCII spaces (U+0020) — non-breaking space
 * (U+00A0) is *not* trimmed by classic Excel TRIM. We mirror that strict
 * behavior: tabs and newlines are not treated as TRIM spaces either.
 */
export const TRIM: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'TRIM takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const collapsed = ts.value.replace(/ +/g, ' ').replace(/^ +| +$/g, '')
  return { kind: 'string', value: collapsed }
}

/** PROPER(text) — Title Case. */
export const PROPER: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'PROPER requires 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  // Capitalize after every non-letter boundary.
  let out = ''
  let upper = true
  for (const ch of ts.value) {
    if (/\p{L}/u.test(ch)) {
      out += upper ? ch.toUpperCase() : ch.toLowerCase()
      upper = false
    } else {
      out += ch
      upper = true
    }
  }
  return { kind: 'string', value: out }
}

/** CLEAN(text) — strip non-printable ASCII (0..31). */
export const CLEAN: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'CLEAN requires 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  return { kind: 'string', value: ts.value.replace(/[\x00-\x1F]/g, '') }
}
