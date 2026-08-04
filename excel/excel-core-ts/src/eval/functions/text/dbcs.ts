/**
 * 按 Excel `*B` 系列函数采用的 DBCS 字节口径度量与切分字符串。
 */

import { codepoints } from './read-args'

/** Byte width under the DBCS discipline used by Excel's deprecated *B text fns. */
function dbcsByteWidth(ch: string): number {
  const cp = ch.codePointAt(0)
  if (cp === undefined) return 0
  // ASCII and half-width Katakana/punctuation are single-byte in Japanese DBCS.
  if (cp <= 0x7f || (cp >= 0xff61 && cp <= 0xff9f)) return 1
  return 2
}

export function dbcsByteLength(s: string): number {
  let len = 0
  for (const ch of codepoints(s)) len += dbcsByteWidth(ch)
  return len
}

export function sliceDbcsBytes(s: string, startByte: number, byteCount: number): string {
  if (byteCount <= 0) return ''
  const start = Math.max(0, startByte - 1)
  const end = start + byteCount
  let cursor = 0
  let out = ''
  for (const ch of codepoints(s)) {
    const next = cursor + dbcsByteWidth(ch)
    if (cursor >= start && next <= end) out += ch
    cursor = next
    if (cursor >= end) break
  }
  return out
}

export function leftDbcsBytes(s: string, byteCount: number): string {
  return sliceDbcsBytes(s, 1, byteCount)
}

export function rightDbcsBytes(s: string, byteCount: number): string {
  if (byteCount <= 0) return ''
  const total = dbcsByteLength(s)
  return sliceDbcsBytes(s, Math.max(1, total - byteCount + 1), byteCount)
}

export function codeUnitOffsetForDbcsByteStart(s: string, startByte: number): number {
  const target = Math.max(0, startByte - 1)
  let byteCursor = 0
  let codeUnitCursor = 0
  for (const ch of codepoints(s)) {
    const width = dbcsByteWidth(ch)
    if (byteCursor >= target) return codeUnitCursor
    if (byteCursor < target && target < byteCursor + width) return codeUnitCursor + ch.length
    byteCursor += width
    codeUnitCursor += ch.length
  }
  return s.length
}

export function dbcsBytePositionFromCodeUnitOffset(s: string, offset: number): number {
  let byteCursor = 0
  let codeUnitCursor = 0
  for (const ch of codepoints(s)) {
    if (codeUnitCursor >= offset) return byteCursor + 1
    byteCursor += dbcsByteWidth(ch)
    codeUnitCursor += ch.length
  }
  return byteCursor + 1
}

function splitDbcsAtByteBoundary(s: string, byteOffset: number): [string, string] {
  if (byteOffset <= 0) return ['', s]
  let cursor = 0
  let before = ''
  for (const ch of codepoints(s)) {
    const next = cursor + dbcsByteWidth(ch)
    if (next <= byteOffset) {
      before += ch
      cursor = next
      continue
    }
    return [before, s.slice(before.length)]
  }
  return [s, '']
}

export function replaceDbcsBytes(
  s: string,
  startByte: number,
  byteCount: number,
  replacement: string,
): string {
  const start = Math.max(0, startByte - 1)
  const total = dbcsByteLength(s)
  if (start >= total) return s + replacement
  if (byteCount === 0) {
    const [before, after] = splitDbcsAtByteBoundary(s, start)
    return before + replacement + after
  }
  const end = start + byteCount
  let cursor = 0
  let before = ''
  let after = ''
  for (const ch of codepoints(s)) {
    const next = cursor + dbcsByteWidth(ch)
    if (next <= start) before += ch
    else if (cursor >= end) after += ch
    cursor = next
  }
  return before + replacement + after
}
