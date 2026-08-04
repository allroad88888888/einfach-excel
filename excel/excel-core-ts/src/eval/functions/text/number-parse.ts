/**
 * 把文本解析成数字：VALUE 走 en-US 口径，NUMBERVALUE 由调用方指定小数点与千位符。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl, Value } from '../../../types'
import { codepoints, coerceText, errValue, ERR_VALUE } from './read-args'

/**
 * VALUE(text) — parse a string as a number.
 *
 * Excel accepts:
 *   - Leading currency `$`            ("$1,234.5" → 1234.5)
 *   - Thousands separator `,`         ("1,234"    → 1234)
 *   - Trailing percent `%`            ("50%"      → 0.5)
 *   - Leading sign `+` / `-`          ("-1,000"   → -1000)
 *   - Surrounding whitespace          (" 42 "     → 42)
 *
 * Anything that doesn't fit the (sign? currency? digits[.digits]? percent?)
 * shape → `#VALUE!`. Booleans coerce (TRUE → 1, FALSE → 0). Numbers pass
 * through.
 */
export const VALUE: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'VALUE takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const v = args[0]
  switch (v.kind) {
    case 'number':
      return v
    case 'boolean':
      return { kind: 'number', value: v.value ? 1 : 0 }
    case 'blank':
      return { kind: 'number', value: 0 }
    case 'array': {
      const row = v.value[0]
      if (!row || row.length === 0) return ERR_VALUE
      // Top-left scalar — same logic, inline to avoid bogus ctx.
      const inner = row[0]
      if (inner.kind === 'string') return parseValueString(inner.value)
      if (inner.kind === 'number') return inner
      if (inner.kind === 'boolean') return { kind: 'number', value: inner.value ? 1 : 0 }
      if (inner.kind === 'blank') return { kind: 'number', value: 0 }
      if (inner.kind === 'error') return inner
      return ERR_VALUE
    }
    case 'error':
      return v
    case 'string':
      return parseValueString(v.value)
  }
}

/**
 * Parse the string-half of VALUE. Returns a Value (number or error).
 * Extracted so the array-fallback branch can reuse it without faking a
 * FunctionImpl call signature.
 */
function parseValueString(raw: string): Value {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return ERR_VALUE
  // Allow leading `$`, strip thousands `,`, allow trailing `%`.
  let s = trimmed
  // Pull off leading sign for later re-application.
  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trimStart()
  } else if (s.startsWith('+')) {
    s = s.slice(1).trimStart()
  }
  if (s.startsWith('$')) s = s.slice(1).trimStart()
  // Trailing percent.
  let percent = false
  if (s.endsWith('%')) {
    percent = true
    s = s.slice(0, -1).trimEnd()
  }
  // Strip thousands separators only if they fit the comma-every-3
  // pattern. Excel is strict: "1,2,3" is not a number. We do a light
  // sanity check before removing them.
  if (s.includes(',')) {
    // Reject leading, trailing, or adjacent-to-decimal-point commas.
    if (/(^,|,,|,\.|,$)/.test(s)) return ERR_VALUE
    s = s.replace(/,/g, '')
  }
  // Now `s` should be a JS-parseable number.
  if (s.length === 0) return ERR_VALUE
  const n = Number(s)
  if (!Number.isFinite(n)) return ERR_VALUE
  const final = sign * (percent ? n / 100 : n)
  return { kind: 'number', value: final }
}

export const NUMBERVALUE: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 3)
    return errValue('#VALUE!', 'NUMBERVALUE takes 1 to 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error

  let decimalSep = '.'
  if (args.length >= 2) {
    const r = coerceText(args[1])
    if (!r.ok) return r.error
    decimalSep = codepoints(r.value)[0] ?? '.'
  }
  let groupSep = ','
  if (args.length === 3) {
    const r = coerceText(args[2])
    if (!r.ok) return r.error
    groupSep = codepoints(r.value)[0] ?? ','
  }
  if (decimalSep === groupSep) return ERR_VALUE

  const trimmed = textR.value.trim()
  if (trimmed === '') return { kind: 'number', value: 0 }
  let normalized = ''
  for (const ch of codepoints(trimmed)) {
    if (ch === groupSep || /\s/u.test(ch)) continue
    normalized += ch === decimalSep ? '.' : ch
  }

  let percentCount = 0
  while (normalized.endsWith('%')) {
    normalized = normalized.slice(0, -1)
    percentCount++
  }
  if (normalized === '') return ERR_VALUE
  const n = Number(normalized)
  if (!Number.isFinite(n)) return ERR_VALUE
  return { kind: 'number', value: n / 100 ** percentCount }
}
