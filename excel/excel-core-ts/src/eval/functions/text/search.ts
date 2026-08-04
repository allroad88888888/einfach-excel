/**
 * 文本匹配：在字符串里定位子串（SEARCH / FIND 及其字节坐标版），
 * 以及整串的严格相等比较（EXACT）。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { codepoints, coerceText, errValue } from './read-args'
import {
  codeUnitOffsetForDbcsByteStart,
  dbcsByteLength,
  dbcsBytePositionFromCodeUnitOffset,
} from './dbcs'

/**
 * Shared substring-search core for SEARCH and FIND. Returns 1-based
 * position (Excel convention) or `null` if not found. `start` is
 * 1-based; `start < 1` or `start > length` → `null` (caller surfaces
 * `#VALUE!`).
 *
 * Note on Unicode: we operate on the same code-point split that
 * LEFT/RIGHT/MID use, so "1-based position" lines up with the LEN we
 * report. SEARCH/FIND in Excel use UTF-16 code units historically; we
 * diverge intentionally for consistency with the rest of this module.
 *
 * `caseInsensitive=true` for SEARCH, `false` for FIND.
 *
 * SEARCH also honors wildcards (`*`, `?`, `~` escape). FIND does NOT.
 */
function searchCore(
  needle: string,
  haystack: string,
  start: number,
  caseInsensitive: boolean,
  wildcards: boolean,
): number | null {
  const hay = codepoints(haystack)
  if (start < 1 || start > hay.length + 1) return null

  // SEARCH("", x) returns `start` (1-based) — matches Excel.
  if (needle.length === 0) return start

  const offset = hay.slice(0, start - 1).join('').length
  const found = searchCoreMatchIndex(needle, haystack, offset, caseInsensitive, wildcards)
  if (found === null) return null
  return codepoints(haystack.slice(0, found)).length + 1
}

function searchCoreMatchIndex(
  needle: string,
  haystack: string,
  offset: number,
  caseInsensitive: boolean,
  wildcards: boolean,
): number | null {
  if (needle.length === 0) return offset

  if (wildcards && /[*?~]/.test(needle)) {
    // Build a regex from the wildcard pattern. `~` escapes the next
    // metachar (`~*` literal asterisk, `~?` literal question mark, `~~`
    // literal tilde).
    let pattern = ''
    let i = 0
    while (i < needle.length) {
      const ch = needle[i]
      if (ch === '~' && i + 1 < needle.length) {
        const next = needle[i + 1]
        if (next === '*' || next === '?' || next === '~') {
          pattern += escapeRegExp(next)
          i += 2
          continue
        }
      }
      if (ch === '*') {
        pattern += '.*'
        i += 1
      } else if (ch === '?') {
        pattern += '.'
        i += 1
      } else {
        pattern += escapeRegExp(ch)
        i += 1
      }
    }
    const flags = caseInsensitive ? 'i' : ''
    const re = new RegExp(pattern, flags)
    const slice = haystack.slice(offset)
    const m = slice.match(re)
    if (!m || m.index === undefined) return null
    return offset + m.index
  }

  const hayCmp = caseInsensitive ? haystack.toLowerCase() : haystack
  const needCmp = caseInsensitive ? needle.toLowerCase() : needle
  const found = hayCmp.indexOf(needCmp, offset)
  if (found < 0) return null
  return found
}

function searchByteCore(
  needle: string,
  haystack: string,
  start: number,
  caseInsensitive: boolean,
  wildcards: boolean,
): number | null {
  const total = dbcsByteLength(haystack)
  if (start < 1) return null
  if (total === 0) {
    if (needle.length === 0 && start === 1) return 1
    return null
  }
  if (start > total) return null
  if (needle.length === 0) return start
  const offset = codeUnitOffsetForDbcsByteStart(haystack, start)
  const found = searchCoreMatchIndex(needle, haystack, offset, caseInsensitive, wildcards)
  if (found === null) return null
  return dbcsBytePositionFromCodeUnitOffset(haystack, found)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * SEARCH(find_text, within_text, [start=1]) — case-INsensitive
 * substring search with wildcard support (`*`, `?`, `~` escape).
 * Returns the 1-based position or `#VALUE!` if not found / bad start.
 */
export const SEARCH: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3)
    return errValue('#VALUE!', 'SEARCH takes 2 or 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const findR = coerceText(args[0])
  if (!findR.ok) return findR.error
  const withinR = coerceText(args[1])
  if (!withinR.ok) return withinR.error
  let start = 1
  if (args.length === 3) {
    const s = toNumber(args[2])
    if (!s.ok) return s.error
    start = Math.trunc(s.value)
  }
  if (start < 1) return errValue('#VALUE!', 'SEARCH start_num must be >= 1')
  const pos = searchCore(findR.value, withinR.value, start, true, true)
  if (pos === null) return errValue('#VALUE!', 'SEARCH text not found')
  return { kind: 'number', value: pos }
}

/**
 * FIND(find_text, within_text, [start=1]) — case-SENSITIVE substring
 * search. Wildcards are treated literally (Excel discipline).
 */
export const FIND: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3)
    return errValue('#VALUE!', 'FIND takes 2 or 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const findR = coerceText(args[0])
  if (!findR.ok) return findR.error
  const withinR = coerceText(args[1])
  if (!withinR.ok) return withinR.error
  let start = 1
  if (args.length === 3) {
    const s = toNumber(args[2])
    if (!s.ok) return s.error
    start = Math.trunc(s.value)
  }
  if (start < 1) return errValue('#VALUE!', 'FIND start_num must be >= 1')
  const pos = searchCore(findR.value, withinR.value, start, false, false)
  if (pos === null) return errValue('#VALUE!', 'FIND text not found')
  return { kind: 'number', value: pos }
}

/**
 * SEARCHB(find_text, within_text, [start=1]) — SEARCH with byte positions.
 * Case-insensitive and wildcard-aware; returns DBCS byte position.
 */
export const SEARCHB: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3)
    return errValue('#VALUE!', 'SEARCHB takes 2 or 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const findR = coerceText(args[0])
  if (!findR.ok) return findR.error
  const withinR = coerceText(args[1])
  if (!withinR.ok) return withinR.error
  let start = 1
  if (args.length === 3) {
    const s = toNumber(args[2])
    if (!s.ok) return s.error
    start = Math.trunc(s.value)
  }
  if (start < 1) return errValue('#VALUE!', 'SEARCHB start_num must be >= 1')
  const pos = searchByteCore(findR.value, withinR.value, start, true, true)
  if (pos === null) return errValue('#VALUE!', 'SEARCHB text not found')
  return { kind: 'number', value: pos }
}

/**
 * FINDB(find_text, within_text, [start=1]) — FIND with byte positions.
 * Case-sensitive and wildcard-literal; returns DBCS byte position.
 */
export const FINDB: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3)
    return errValue('#VALUE!', 'FINDB takes 2 or 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const findR = coerceText(args[0])
  if (!findR.ok) return findR.error
  const withinR = coerceText(args[1])
  if (!withinR.ok) return withinR.error
  let start = 1
  if (args.length === 3) {
    const s = toNumber(args[2])
    if (!s.ok) return s.error
    start = Math.trunc(s.value)
  }
  if (start < 1) return errValue('#VALUE!', 'FINDB start_num must be >= 1')
  const pos = searchByteCore(findR.value, withinR.value, start, false, false)
  if (pos === null) return errValue('#VALUE!', 'FINDB text not found')
  return { kind: 'number', value: pos }
}

/** EXACT(a, b) — strict case-sensitive equality. */
export const EXACT: FunctionImpl = (args) => {
  if (args.length !== 2) return errValue('#VALUE!', 'EXACT requires 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const a = coerceText(args[0])
  if (!a.ok) return a.error
  const b = coerceText(args[1])
  if (!b.ok) return b.error
  return { kind: 'boolean', value: a.value === b.value }
}
