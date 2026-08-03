/**
 * ENCODEURL：把文本按 UTF-8 逐字节做百分号编码。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { codepoints, coerceText, errValue } from './read-args'

function utf8Bytes(s: string): number[] {
  const out: number[] = []
  for (const ch of codepoints(s)) {
    const cp = ch.codePointAt(0)
    if (cp === undefined) continue
    if (cp <= 0x7f) {
      out.push(cp)
    } else if (cp <= 0x7ff) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    } else if (cp <= 0xffff) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    }
  }
  return out
}

function isUrlUnreservedByte(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    b === 0x2d ||
    b === 0x5f ||
    b === 0x2e ||
    b === 0x7e
  )
}

function percentEncodeUrlText(s: string): string {
  let out = ''
  for (const b of utf8Bytes(s)) {
    if (isUrlUnreservedByte(b)) {
      out += String.fromCharCode(b)
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

export const ENCODEURL: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'ENCODEURL takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  return { kind: 'string', value: percentEncodeUrlText(textR.value) }
}
