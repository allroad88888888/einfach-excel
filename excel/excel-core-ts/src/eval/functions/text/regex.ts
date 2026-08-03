/**
 * 用正则表达式匹配、提取、替换文本：REGEXTEST / REGEXEXTRACT / REGEXREPLACE。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl, Value } from '../../../types'
import { toAsciiClasses } from '../regex-ascii'
import { coerceText, errValue, readInteger, ERR_NA, ERR_VALUE } from './read-args'

function readRegexCase(
  args: Value[],
  index: number,
): { ok: true; value: boolean } | { ok: false; error: Value } {
  if (args.length <= index) return { ok: true, value: false }
  const r = readInteger(args[index])
  if (!r.ok) return r
  return { ok: true, value: r.value !== 0 }
}

function compileRegex(pattern: string, flags: string): RegExp | Value {
  try {
    // `\s` / `\S` 在 JS 里是 Unicode 感知的，而 Excel 走 PCRE2 默认口径（ASCII）。
    // 改写见 `regex-ascii.ts`，Rust 半边是 `eval_regex_ascii.rs`，两边同步。
    return new RegExp(toAsciiClasses(pattern), flags)
  } catch {
    return ERR_VALUE
  }
}

function collectRegexMatches(re: RegExp, text: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    matches.push(match)
    if (match[0] === '') {
      // 空匹配按**码点**步进。`lastIndex++` 走的是 UTF-16 码元，会把代理对
      // 劈成两半，于是一个 emoji 上能凑出三个空匹配；Rust 引擎的 `find_iter`
      // 按 char 步进只有两个，同一份工作簿静默算出不同的替换次数。
      const cp = text.codePointAt(re.lastIndex)
      re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1
    }
  }
  return matches
}

function expandRegexReplacement(
  replacement: string,
  match: RegExpExecArray,
  fullText: string,
): string {
  const end = match.index + match[0].length
  return replacement.replace(/\$(\$|&|`|'|\d{1,2})/g, (token, marker: string) => {
    if (marker === '$') return '$'
    if (marker === '&') return match[0]
    if (marker === '`') return fullText.slice(0, match.index)
    if (marker === "'") return fullText.slice(end)
    const index = Number(marker)
    if (!Number.isInteger(index) || index < 1 || index >= match.length) return token
    return match[index] ?? ''
  })
}

export const REGEXTEST: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 3)
    return errValue('#VALUE!', 'REGEXTEST takes 2 or 3 arguments')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const patR = coerceText(args[1])
  if (!patR.ok) return patR.error
  const caseR = readRegexCase(args, 2)
  if (!caseR.ok) return caseR.error
  const re = compileRegex(patR.value, caseR.value ? 'i' : '')
  if (!(re instanceof RegExp)) return re
  return { kind: 'boolean', value: re.test(textR.value) }
}

export const REGEXEXTRACT: FunctionImpl = (args) => {
  if (args.length < 2 || args.length > 4)
    return errValue('#VALUE!', 'REGEXEXTRACT takes 2 to 4 arguments')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const patR = coerceText(args[1])
  if (!patR.ok) return patR.error

  let mode = 0
  if (args.length >= 3) {
    const r = readInteger(args[2])
    if (!r.ok) return r.error
    mode = r.value
  }
  const caseR = readRegexCase(args, 3)
  if (!caseR.ok) return caseR.error
  const re = compileRegex(patR.value, caseR.value ? 'gi' : 'g')
  if (!(re instanceof RegExp)) return re

  if (mode === 0) {
    const match = re.exec(textR.value)
    return match ? { kind: 'string', value: match[0] } : ERR_NA
  }
  if (mode === 1) {
    const matches = collectRegexMatches(re, textR.value)
      .map((match) => [{ kind: 'string' as const, value: match[0] }])
    return matches.length === 0 ? ERR_NA : { kind: 'array', value: matches }
  }
  if (mode === 2) {
    const match = re.exec(textR.value)
    if (!match || match.length <= 1) return ERR_NA
    return {
      kind: 'array',
      value: [match.slice(1).map((part) => ({ kind: 'string', value: part ?? '' }))],
    }
  }
  return ERR_VALUE
}

export const REGEXREPLACE: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 5)
    return errValue('#VALUE!', 'REGEXREPLACE takes 3 to 5 arguments')
  const err = propagateError(args)
  if (err) return err
  const textR = coerceText(args[0])
  if (!textR.ok) return textR.error
  const patR = coerceText(args[1])
  if (!patR.ok) return patR.error
  const repR = coerceText(args[2])
  if (!repR.ok) return repR.error

  let occurrence = 0
  if (args.length >= 4) {
    const r = readInteger(args[3])
    if (!r.ok) return r.error
    occurrence = r.value
  }
  const caseR = readRegexCase(args, 4)
  if (!caseR.ok) return caseR.error
  const re = compileRegex(patR.value, caseR.value ? 'gi' : 'g')
  if (!(re instanceof RegExp)) return re

  // 两条路径（全部替换 / 第 n 个）共用同一个匹配收集与同一个 `$` 展开器。
  // occurrence=0 曾经走 JS 原生 `String.replace`，那条路认 `$<name>`、并把
  // 越界的 `$12` 回退成 `$1` + 字面 `2` —— 与 occurrence≠0 这条路、以及 Rust
  // 引擎三方不一致。Excel 文档只定义了 `$n`，所以统一到展开器这一侧。
  const matches = collectRegexMatches(re, textR.value)
  let chosen: RegExpExecArray[]
  if (occurrence === 0) {
    chosen = matches
  } else {
    const at = occurrence > 0 ? occurrence - 1 : matches.length + occurrence
    const one = matches[at]
    // 第 n 个匹配不存在 → Excel 返回原文，不是错误。
    if (one === undefined) return { kind: 'string', value: textR.value }
    chosen = [one]
  }

  let out = ''
  let cursor = 0
  for (const match of chosen) {
    out += textR.value.slice(cursor, match.index)
    out += expandRegexReplacement(repR.value, match, textR.value)
    cursor = match.index + match[0].length
  }
  return { kind: 'string', value: out + textR.value.slice(cursor) }
}
