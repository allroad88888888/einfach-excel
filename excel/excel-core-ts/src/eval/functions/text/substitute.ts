/**
 * 按内容匹配改写文本：SUBSTITUTE 换子串、TRANSLATE 逐码点映射。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { codepoints, coerceText, errValue, ERR_VALUE } from './read-args'

/**
 * SUBSTITUTE(text, old, new, [instance]) — replace all (or nth) instances
 * of `old` within `text`. Case-sensitive (unlike SEARCH).
 */
export const SUBSTITUTE: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4)
    return errValue('#VALUE!', 'SUBSTITUTE requires 3 or 4 arguments')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  const oldR = coerceText(args[1])
  if (!oldR.ok) return oldR.error
  const newR = coerceText(args[2])
  if (!newR.ok) return newR.error
  let instance = -1 // -1 means all
  if (args.length === 4) {
    const ic = toNumber(args[3])
    if (!ic.ok) return ic.error
    instance = Math.trunc(ic.value)
    if (instance < 1) return ERR_VALUE
  }
  if (oldR.value.length === 0) return { kind: 'string', value: ts.value }
  if (instance === -1) {
    // Replace all — use split/join, no regex needed.
    return { kind: 'string', value: ts.value.split(oldR.value).join(newR.value) }
  }
  let count = 0
  let idx = 0
  let out = ''
  const old = oldR.value
  while (idx < ts.value.length) {
    const found = ts.value.indexOf(old, idx)
    if (found < 0) {
      out += ts.value.slice(idx)
      break
    }
    count++
    if (count === instance) {
      out += ts.value.slice(idx, found) + newR.value + ts.value.slice(found + old.length)
      return { kind: 'string', value: out }
    }
    out += ts.value.slice(idx, found + old.length)
    idx = found + old.length
  }
  return { kind: 'string', value: out }
}

/**
 * TRANSLATE(text, find, replace) — Google Sheets / Excel TRANSLATE.
 *
 * Each codepoint in `find` is mapped to the codepoint at the same index in
 * `replace`. If `find` is longer than `replace`, the trailing codepoints in
 * `find` have no mapping and are deleted from the output. Codepoints in
 * `text` that do not appear in `find` are kept verbatim.
 *
 * Codepoint discipline matches LEFT/RIGHT/MID: `Array.from(s)` so a 4-byte
 * emoji counts as one character.
 */
export const TRANSLATE: FunctionImpl = (args) => {
  if (args.length !== 3) return errValue('#VALUE!', 'TRANSLATE takes exactly 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const findR = coerceText(args[1])
  if (!findR.ok) return findR.error
  const replR = coerceText(args[2])
  if (!replR.ok) return replR.error
  const findCps = codepoints(findR.value)
  const replCps = codepoints(replR.value)
  // Build map: first occurrence in `find` wins (Excel's behavior).
  const map = new Map<string, string | undefined>()
  for (let i = 0; i < findCps.length; i++) {
    const key = findCps[i]
    if (map.has(key)) continue
    map.set(key, i < replCps.length ? replCps[i] : undefined)
  }
  let out = ''
  for (const ch of codepoints(textR.value)) {
    if (map.has(ch)) {
      const mapped = map.get(ch)
      if (mapped !== undefined) out += mapped
      // else: deleted (find char with no replacement counterpart)
    } else {
      out += ch
    }
  }
  return { kind: 'string', value: out }
}
