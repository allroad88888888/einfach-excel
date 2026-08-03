/**
 * 日文半角与全角互转（含浊音/半浊音假名合并拆分）：ASC / JIS / DBCS。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { codepoints, coerceText, errValue } from './read-args'

function buildPairMap(left: readonly string[], right: readonly string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (let i = 0; i < left.length && i < right.length; i++) {
    const l = left[i]
    const r = right[i]
    if (l !== undefined && r !== undefined) map.set(l, r)
  }
  return map
}

const HALF_KANA = [
  '｡', '｢', '｣', '､', '･', 'ｦ', 'ｧ', 'ｨ', 'ｩ', 'ｪ', 'ｫ', 'ｬ', 'ｭ', 'ｮ', 'ｯ', 'ｰ',
  'ｱ', 'ｲ', 'ｳ', 'ｴ', 'ｵ', 'ｶ', 'ｷ', 'ｸ', 'ｹ', 'ｺ', 'ｻ', 'ｼ', 'ｽ', 'ｾ', 'ｿ', 'ﾀ',
  'ﾁ', 'ﾂ', 'ﾃ', 'ﾄ', 'ﾅ', 'ﾆ', 'ﾇ', 'ﾈ', 'ﾉ', 'ﾊ', 'ﾋ', 'ﾌ', 'ﾍ', 'ﾎ', 'ﾏ', 'ﾐ',
  'ﾑ', 'ﾒ', 'ﾓ', 'ﾔ', 'ﾕ', 'ﾖ', 'ﾗ', 'ﾘ', 'ﾙ', 'ﾚ', 'ﾛ', 'ﾜ', 'ﾝ', 'ﾞ', 'ﾟ',
] as const

const FULL_KANA = [
  '。', '「', '」', '、', '・', 'ヲ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ッ',
  'ー', 'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス',
  'セ', 'ソ', 'タ', 'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'ハ', 'ヒ',
  'フ', 'ヘ', 'ホ', 'マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル',
  'レ', 'ロ', 'ワ', 'ン', '゛', '゜',
] as const

const VOICED_HALF = [
  'ｳ', 'ｶ', 'ｷ', 'ｸ', 'ｹ', 'ｺ', 'ｻ', 'ｼ', 'ｽ', 'ｾ', 'ｿ', 'ﾀ', 'ﾁ', 'ﾂ', 'ﾃ', 'ﾄ',
  'ﾊ', 'ﾋ', 'ﾌ', 'ﾍ', 'ﾎ',
] as const

const VOICED_FULL = [
  'ヴ', 'ガ', 'ギ', 'グ', 'ゲ', 'ゴ', 'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ', 'ダ', 'ヂ', 'ヅ',
  'デ', 'ド', 'バ', 'ビ', 'ブ', 'ベ', 'ボ',
] as const

const SEMI_VOICED_HALF = ['ﾊ', 'ﾋ', 'ﾌ', 'ﾍ', 'ﾎ'] as const
const SEMI_VOICED_FULL = ['パ', 'ピ', 'プ', 'ペ', 'ポ'] as const

const FULL_TO_HALF_KANA = (() => {
  const map = buildPairMap(FULL_KANA, HALF_KANA)
  const voiced = buildPairMap(VOICED_FULL, VOICED_HALF)
  for (const [full, half] of voiced) map.set(full, `${half}ﾞ`)
  const semi = buildPairMap(SEMI_VOICED_FULL, SEMI_VOICED_HALF)
  for (const [full, half] of semi) map.set(full, `${half}ﾟ`)
  return map
})()

const HALF_TO_FULL_KANA = buildPairMap(HALF_KANA, FULL_KANA)
const VOICED_HALF_TO_FULL = buildPairMap(VOICED_HALF, VOICED_FULL)
const SEMI_VOICED_HALF_TO_FULL = buildPairMap(SEMI_VOICED_HALF, SEMI_VOICED_FULL)

function ascConvert(s: string): string {
  let out = ''
  for (const ch of codepoints(s)) {
    const cp = ch.codePointAt(0)
    if (cp === undefined) continue
    if (cp >= 0xff01 && cp <= 0xff5e) {
      out += String.fromCodePoint(cp - 0xfee0)
      continue
    }
    if (cp === 0x3000) {
      out += ' '
      continue
    }
    if (cp === 0xffe5) {
      out += '\\'
      continue
    }
    out += FULL_TO_HALF_KANA.get(ch) ?? ch
  }
  return out
}

function jisConvert(s: string): string {
  const chars = codepoints(s)
  let out = ''
  let i = 0
  while (i < chars.length) {
    const ch = chars[i]
    if (ch === undefined) break
    const cp = ch.codePointAt(0)
    if (cp === undefined) {
      i++
      continue
    }
    if (cp >= 0x21 && cp <= 0x7e) {
      out += String.fromCodePoint(cp + 0xfee0)
      i++
      continue
    }
    if (cp === 0x20) {
      out += '\u3000'
      i++
      continue
    }
    if (cp >= 0xff61 && cp <= 0xff9f) {
      const next = chars[i + 1]
      if (next === 'ﾞ') {
        const voiced = VOICED_HALF_TO_FULL.get(ch)
        if (voiced !== undefined) {
          out += voiced
          i += 2
          continue
        }
      }
      if (next === 'ﾟ') {
        const semi = SEMI_VOICED_HALF_TO_FULL.get(ch)
        if (semi !== undefined) {
          out += semi
          i += 2
          continue
        }
      }
      out += HALF_TO_FULL_KANA.get(ch) ?? ch
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

export const ASC: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'ASC takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  return { kind: 'string', value: ascConvert(textR.value) }
}

export const JIS: FunctionImpl = (args) => {
  if (args.length !== 1) return errValue('#VALUE!', 'JIS takes exactly 1 argument')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  return { kind: 'string', value: jisConvert(textR.value) }
}

export const DBCS: FunctionImpl = JIS
