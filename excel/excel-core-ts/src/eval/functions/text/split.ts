/**
 * 按分隔符切开文本：TEXTSPLIT / TEXTBEFORE / TEXTAFTER。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl, Value } from '../../../types'
import {
  coerceText,
  errValue,
  flattenForConcat,
  readBoolean,
  readInteger,
  ERR_NA,
  ERR_VALUE,
} from './read-args'

function collectTextDelimiters(
  v: Value,
  includeEmpty = false,
): { ok: true; value: string[] } | { ok: false; error: Value } {
  const out: string[] = []
  for (const scalar of flattenForConcat(v)) {
    if (scalar.kind === 'error') return { ok: false, error: scalar }
    if (scalar.kind === 'blank') {
      if (includeEmpty) out.push('')
      continue
    }
    const r = coerceText(scalar)
    if (!r.ok) return r
    if (r.value !== '' || includeEmpty) out.push(r.value)
  }
  return { ok: true, value: out }
}

interface TextDelimiterMatch {
  readonly start: number
  readonly end: number
}

function indexOfCaseInsensitive(text: string, needle: string, start: number): number {
  const lowerNeedle = needle.toLowerCase()
  for (let i = start; i <= text.length - needle.length; i += 1) {
    if (text.slice(i, i + needle.length).toLowerCase() === lowerNeedle) return i
  }
  return -1
}

function findFirstTextDelimiter(
  text: string,
  delims: readonly string[],
  start: number,
  matchMode: number,
): TextDelimiterMatch | null {
  if (delims.length === 0 || start > text.length) return null
  const caseInsensitive = matchMode === 1
  let best: TextDelimiterMatch | null = null

  for (const delim of delims) {
    if (delim === '') continue
    const pos = caseInsensitive
      ? indexOfCaseInsensitive(text, delim, start)
      : text.indexOf(delim, start)
    if (pos < 0) continue
    if (best === null || pos < best.start) {
      best = { start: pos, end: pos + delim.length }
    }
  }

  return best
}

function textsplitOneAxis(
  text: string,
  delims: readonly string[],
  ignoreEmpty: boolean,
  matchMode: number,
): string[] {
  if (delims.length === 0) return [text]
  const out: string[] = []
  let pos = 0
  while (pos <= text.length) {
    const match = findFirstTextDelimiter(text, delims, pos, matchMode)
    if (match) {
      const frag = text.slice(pos, match.start)
      if (!(ignoreEmpty && frag === '')) out.push(frag)
      pos = match.end
      if (pos > text.length) break
      continue
    }
    const frag = text.slice(pos)
    if (!(ignoreEmpty && frag === '')) out.push(frag)
    break
  }
  if (out.length === 0 && !ignoreEmpty) out.push('')
  return out
}

export const TEXTSPLIT: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 6)
    return errValue('#VALUE!', 'TEXTSPLIT takes 2 to 6 arguments')
  const err = propagateError(args)
  if (err) return err

  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const colR = collectTextDelimiters(args[1])
  if (!colR.ok) return colR.error
  let rowDelims: string[] = []
  if (args.length >= 3) {
    const rowR = collectTextDelimiters(args[2])
    if (!rowR.ok) return rowR.error
    rowDelims = rowR.value
  }

  let ignoreEmpty = false
  if (args.length >= 4) {
    const r = readBoolean(args[3])
    if (!r.ok) return r.error
    ignoreEmpty = r.value
  }

  let matchMode = 0
  if (args.length >= 5) {
    const r = readInteger(args[4])
    if (!r.ok) return r.error
    matchMode = r.value
  }
  if (matchMode !== 0 && matchMode !== 1) return ERR_VALUE

  const pad = args.length === 6 ? args[5] : ERR_NA
  if (textR.value === '') return { kind: 'array', value: [[{ kind: 'string', value: '' }]] }

  if (rowDelims.length === 0) {
    const fragments = textsplitOneAxis(textR.value, colR.value, ignoreEmpty, matchMode)
    const row: Value[] = (fragments.length === 0 ? [''] : fragments).map((value) => ({
      kind: 'string',
      value,
    }))
    return { kind: 'array', value: [row] }
  }

  const rowTexts = textsplitOneAxis(textR.value, rowDelims, ignoreEmpty, matchMode)
  const rows = (rowTexts.length === 0 ? [''] : rowTexts).map((row) =>
    textsplitOneAxis(row, colR.value, ignoreEmpty, matchMode),
  )
  const maxCols = Math.max(1, ...rows.map((row) => row.length))
  const out = rows.map((row) => {
    const cells: Value[] = []
    for (let i = 0; i < maxCols; i++) {
      cells.push(i < row.length ? { kind: 'string', value: row[i] ?? '' } : pad)
    }
    return cells
  })
  return { kind: 'array', value: out }
}

function textBeforeAfter(args: Value[], before: boolean): Value {
  if (args.length < 2 || args.length > 6)
    return errValue('#VALUE!', `${before ? 'TEXTBEFORE' : 'TEXTAFTER'} takes 2 to 6 arguments`)
  const err = propagateError(args)
  if (err) return err

  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const delimR = collectTextDelimiters(args[1], true)
  if (!delimR.ok) return delimR.error

  let instance = 1
  if (args.length >= 3) {
    const r = readInteger(args[2])
    if (!r.ok) return r.error
    instance = r.value
  }
  if (instance === 0) return ERR_VALUE

  let matchMode = 0
  if (args.length >= 4) {
    const r = readInteger(args[3])
    if (!r.ok) return r.error
    matchMode = r.value
  }
  if (matchMode !== 0 && matchMode !== 1) return ERR_VALUE

  let matchEnd = 0
  if (args.length >= 5) {
    const r = readInteger(args[4])
    if (!r.ok) return r.error
    matchEnd = r.value
  }
  if (matchEnd !== 0 && matchEnd !== 1) return ERR_VALUE

  const notFound = args.length === 6 ? args[5] : ERR_NA
  if (delimR.value.length === 0) return notFound

  const text = textR.value
  if (delimR.value.includes('')) {
    if (instance > 0) {
      if (instance !== 1) return notFound
      return { kind: 'string', value: before ? '' : text }
    }
    if (instance !== -1) return notFound
    return { kind: 'string', value: before ? text : '' }
  }

  const matches: TextDelimiterMatch[] = []
  let pos = 0
  while (pos <= text.length) {
    const match = findFirstTextDelimiter(text, delimR.value, pos, matchMode)
    if (!match) break
    matches.push(match)
    pos = match.end > match.start ? match.end : match.start + 1
  }
  if (matchEnd === 1) matches.push({ start: text.length, end: text.length })

  const index = instance > 0 ? instance - 1 : matches.length + instance
  const match = matches[index]
  if (match === undefined) return notFound
  return { kind: 'string', value: before ? text.slice(0, match.start) : text.slice(match.end) }
}

export const TEXTBEFORE: FunctionImpl = (args) => textBeforeAfter(args, true)
export const TEXTAFTER: FunctionImpl = (args) => textBeforeAfter(args, false)
