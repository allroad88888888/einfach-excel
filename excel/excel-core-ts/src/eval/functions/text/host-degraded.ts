/**
 * einfach 不建模富单元格内容，这几个函数因此退化成纯文本载荷：
 * HYPERLINK / IMAGE / PHONETIC。
 */

import { propagateError, toNumber } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { codepoints, coerceText, errValue, ERR_VALUE } from './read-args'

function formatImageNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  return String(n)
}

function formatImagePayload(
  source: string,
  alt: string | undefined,
  sizing: number,
  height: number | undefined,
  width: number | undefined,
): string {
  let out = `<IMAGE: ${source}`
  if (alt !== undefined) {
    out += ' alt="'
    for (const ch of codepoints(alt)) {
      if (ch === '\\') out += '\\\\'
      else if (ch === '"') out += '\\"'
      else out += ch
    }
    out += '"'
  }
  if (sizing !== 0) out += ` sizing=${sizing}`
  if (height !== undefined && width !== undefined) {
    out += ` height=${formatImageNumber(height)} width=${formatImageNumber(width)}`
  }
  return `${out}>`
}

export const HYPERLINK: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 2)
    return errValue('#VALUE!', 'HYPERLINK takes 1 or 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const linkR = coerceText(args[0])
  if (!linkR.ok) return linkR.error
  if (args.length === 1) return { kind: 'string', value: linkR.value }
  const friendlyR = coerceText(args[1])
  if (!friendlyR.ok) return friendlyR.error
  return { kind: 'string', value: friendlyR.value }
}

export const IMAGE: FunctionImpl = (args) => {
  if (args.length < 1 || args.length > 5)
    return errValue('#VALUE!', 'IMAGE takes 1 to 5 arguments')
  const err = propagateError(args)
  if (err) return err
  const sourceR = coerceText(args[0])
  if (!sourceR.ok) return sourceR.error
  if (sourceR.value === '') return ERR_VALUE

  let alt: string | undefined
  if (args.length >= 2 && args[1].kind !== 'blank') {
    const altR = coerceText(args[1])
    if (!altR.ok) return altR.error
    alt = altR.value
  }

  let sizing = 0
  if (args.length >= 3 && args[2].kind !== 'blank') {
    const sizingR = toNumber(args[2])
    if (!sizingR.ok) return sizingR.error
    if (!Number.isFinite(sizingR.value) || Math.trunc(sizingR.value) !== sizingR.value)
      return ERR_VALUE
    sizing = sizingR.value
    if (sizing < 0 || sizing > 3) return ERR_VALUE
  }

  let height: number | undefined
  let width: number | undefined
  if (sizing === 3) {
    if (args.length !== 5) return ERR_VALUE
    const heightR = toNumber(args[3])
    if (!heightR.ok) return heightR.error
    const widthR = toNumber(args[4])
    if (!widthR.ok) return widthR.error
    if (heightR.value <= 0 || widthR.value <= 0) return ERR_VALUE
    height = heightR.value
    width = widthR.value
  } else {
    if (args.length >= 4 && args[3].kind !== 'blank') return ERR_VALUE
    if (args.length === 5 && args[4].kind !== 'blank') return ERR_VALUE
  }

  return { kind: 'string', value: formatImagePayload(sourceR.value, alt, sizing, height, width) }
}

/**
 * PHONETIC(reference) — Excel extracts furigana ruby text annotations from
 * the source cell. einfach does not model per-cell furigana metadata, so we
 * degrade to a passthrough that mirrors Excel's behavior for cells with no
 * ruby annotations: return the raw TEXT content unchanged.
 *
 * If the arg is a range, Excel uses the first cell — `coerceText` already
 * does that (top-left of array). Blank → "". Errors propagate.
 */
export const PHONETIC: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'PHONETIC takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const ts = coerceText(args[0])
  if (!ts.ok) return ts.error
  return { kind: 'string', value: ts.value }
}
