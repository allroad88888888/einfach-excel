/**
 * 渲染自定义占位符格式（`#` / `0` / `,` / `%` / 字面量）：先分词，再按词流填数字。
 */

import { codepoints } from './read-args'
import { formatAbsFixedDecimal, insertCommas, roundHalfAwayFromZero } from './format-numeric'
import type { NumberSeparators } from './format-numeric'

type TextNumberFormatToken =
  | { readonly kind: 'pattern'; readonly value: string }
  | { readonly kind: 'literal'; readonly value: string }

function tokenizeTextNumberFormat(format: string): TextNumberFormatToken[] | undefined {
  const tokens: TextNumberFormatToken[] = []
  let i = 0
  while (i < format.length) {
    const ch = format[i]
    if (ch === '"') {
      let literal = ''
      i += 1
      let closed = false
      while (i < format.length) {
        const next = format[i]
        if (next === '"') {
          if (format[i + 1] === '"') {
            literal += '"'
            i += 2
            continue
          }
          closed = true
          i += 1
          break
        }
        literal += next
        i += 1
      }
      if (!closed) return undefined
      if (literal !== '') tokens.push({ kind: 'literal', value: literal })
      continue
    }

    if (ch === '\\') {
      const literal = format[i + 1]
      if (literal === undefined) return undefined
      tokens.push({ kind: 'literal', value: literal })
      i += 2
      continue
    }

    if (ch === '_' && format[i + 1] !== undefined) {
      tokens.push({ kind: 'literal', value: ' ' })
      i += 2
      continue
    }

    if (ch === '*' && format[i + 1] !== undefined) {
      i += 2
      continue
    }

    if ('0#.,%'.includes(ch)) tokens.push({ kind: 'pattern', value: ch })
    else tokens.push({ kind: 'literal', value: ch })
    i += 1
  }
  return tokens
}

export function formatTextCustomNumber(
  n: number,
  format: string,
  separators: NumberSeparators,
): string | undefined {
  if (!Number.isFinite(n)) return undefined
  const tokens = tokenizeTextNumberFormat(format)
  if (!tokens) return undefined

  const firstPattern = tokens.findIndex((token) => token.kind === 'pattern')
  if (firstPattern < 0) return undefined

  let lastPattern = -1
  for (let i = tokens.length - 1; i >= firstPattern; i -= 1) {
    if (tokens[i].kind === 'pattern') {
      lastPattern = i
      break
    }
  }
  if (lastPattern < 0) return undefined

  const patternTokens = tokens.slice(firstPattern, lastPattern + 1)
  if (patternTokens.some((token) => token.kind !== 'pattern')) {
    return formatTextCustomIntegerMask(n, tokens, firstPattern, lastPattern)
  }
  const pattern = patternTokens.map((token) => token.value).join('')
  if (!/[0#]/.test(pattern)) return undefined

  const prefix = tokens.slice(0, firstPattern).map((token) => token.value).join('')
  const suffix = tokens.slice(lastPattern + 1).map((token) => token.value).join('')
  const body = formatTextCustomNumberPattern(n, pattern, separators)
  if (body !== undefined) return `${prefix}${body}${suffix}`

  return formatTextCustomIntegerMask(n, tokens, firstPattern, lastPattern)
}

function formatTextCustomNumberPattern(
  n: number,
  pattern: string,
  separators: NumberSeparators,
): string | undefined {
  const percentCount = (pattern.match(/%/g) ?? []).length
  const numericPattern = pattern.replace(/%/g, '')
  if ((numericPattern.match(/\./g) ?? []).length > 1) return undefined

  const dot = numericPattern.indexOf('.')
  let intPattern = dot >= 0 ? numericPattern.slice(0, dot) : numericPattern
  const fracPattern = dot >= 0 ? numericPattern.slice(dot + 1) : ''

  let scaleCommas = 0
  while (intPattern.endsWith(',')) {
    scaleCommas += 1
    intPattern = intPattern.slice(0, -1)
  }

  const validIntegerPattern = /^[0#,]+$/.test(intPattern)
  const validFractionPattern = fracPattern === '' || /^[0#]+$/.test(fracPattern)
  if (!validIntegerPattern || !validFractionPattern) {
    return undefined
  }

  const intDigits = intPattern.replace(/,/g, '')
  if (!/[0#]/.test(intDigits)) return undefined

  const requiredIntDigits = codepoints(intDigits).filter((ch) => ch === '0').length
  const minIntDigits = requiredIntDigits
  const requiredFracDigits = codepoints(fracPattern).filter((ch) => ch === '0').length
  const maxFracDigits = fracPattern.length
  const useCommas = intPattern.includes(',')
  const scaled = (n * 100 ** percentCount) / 1000 ** scaleCommas
  const negative = scaled < 0
  const abs = Math.abs(scaled)
  const rounded = formatAbsFixedDecimal(abs, maxFracDigits)
  let [whole, frac = ''] = rounded.split('.')
  whole = whole.padStart(minIntDigits, '0')
  if (requiredIntDigits === 0 && Number(whole) === 0) whole = ''
  if (useCommas) whole = insertCommas(whole, separators.thousand)

  if (maxFracDigits > 0) {
    while (frac.length > requiredFracDigits && frac.endsWith('0')) frac = frac.slice(0, -1)
  }

  const decimal = frac !== '' ? `${separators.decimal}${frac}` : ''
  return `${negative ? '-' : ''}${whole}${decimal}${'%'.repeat(percentCount)}`
}

function formatTextCustomIntegerMask(
  n: number,
  tokens: readonly TextNumberFormatToken[],
  firstPattern: number,
  lastPattern: number,
): string | undefined {
  if (!Number.isFinite(n)) return undefined
  let placeholderCount = 0
  for (let i = firstPattern; i <= lastPattern; i += 1) {
    const token = tokens[i]
    if (token.kind === 'pattern') {
      if (token.value !== '0' && token.value !== '#') return undefined
      placeholderCount += 1
      continue
    }
    if (!/^[ ()-]*$/.test(token.value)) return undefined
  }
  if (placeholderCount === 0) return undefined

  let remaining = roundHalfAwayFromZero(Math.abs(n)).toString()
  const parts = tokens.map((token) => token.value)
  let firstSlot = -1
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i]
    if (token.kind !== 'pattern') continue
    firstSlot = i
    const digit = remaining.length > 0 ? remaining.slice(-1) : ''
    remaining = remaining.slice(0, -1)
    if (digit !== '') {
      parts[i] = digit
    } else {
      parts[i] = token.value === '0' ? '0' : ''
    }
  }

  if (remaining !== '' && firstSlot >= 0) parts[firstSlot] = remaining + parts[firstSlot]
  return `${n < 0 ? '-' : ''}${parts.join('')}`
}

export function formatTextLiteralOnly(format: string): string | undefined {
  let out = ''
  let hasExplicitLiteral = false
  let i = 0
  while (i < format.length) {
    const ch = format[i]

    if (ch === '"') {
      i += 1
      let closed = false
      hasExplicitLiteral = true
      while (i < format.length) {
        const next = format[i]
        if (next === '"') {
          if (format[i + 1] === '"') {
            out += '"'
            i += 2
            continue
          }
          closed = true
          i += 1
          break
        }
        out += next
        i += 1
      }
      if (!closed) return undefined
      continue
    }

    if (ch === '\\') {
      const literal = format[i + 1]
      if (literal === undefined) return undefined
      out += literal
      hasExplicitLiteral = true
      i += 2
      continue
    }

    if (ch === '_' && format[i + 1] !== undefined) {
      out += ' '
      hasExplicitLiteral = true
      i += 2
      continue
    }

    if (ch === '*' && format[i + 1] !== undefined) {
      hasExplicitLiteral = true
      i += 2
      continue
    }

    if ('0#?'.includes(ch) || /^[A-Za-z]$/.test(ch)) return undefined
    out += ch
    i += 1
  }

  return hasExplicitLiteral ? out : undefined
}
