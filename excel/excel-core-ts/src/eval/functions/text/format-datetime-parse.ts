/**
 * 把 Excel 日期时间格式串编译成 token 序列。
 */

export type TextDateTimeToken =
  | { readonly kind: 'literal'; readonly value: string }
  | {
    readonly kind: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'
    readonly count: number
  }
  | {
    readonly kind: 'elapsed-hour' | 'elapsed-minute' | 'elapsed-second'
    readonly count: number
  }
  | { readonly kind: 'fractional-second'; readonly count: number }
  | { readonly kind: 'elapsed-fractional-second'; readonly count: number }
  | { readonly kind: 'meridian'; readonly style: 'AM/PM' | 'am/pm' | 'A/P' | 'a/p' }

export interface TextDateTimeFormat {
  readonly tokens: TextDateTimeToken[]
  readonly hasDate: boolean
  readonly hasTime: boolean
  readonly hasMeridian: boolean
  readonly fractionalSecondDigits: number
}

export function parseTextDateTimeFormat(format: string): TextDateTimeFormat | undefined {
  const tokens: TextDateTimeToken[] = []
  let hasDate = false
  let hasTime = false
  let hasElapsed = false
  let hasMeridian = false
  let fractionalSecondDigits = 0

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

    const elapsed = matchTextElapsedToken(format, i)
    if (elapsed) {
      tokens.push(elapsed.token)
      hasElapsed = true
      hasTime = true
      i += elapsed.length
      if (elapsed.token.kind === 'elapsed-second') {
        const fraction = matchTextFractionalSecond(format, i)
        if (fraction) {
          tokens.push({ kind: 'literal', value: '.' })
          tokens.push({ kind: 'elapsed-fractional-second', count: fraction.count })
          fractionalSecondDigits = Math.max(fractionalSecondDigits, fraction.count)
          i += fraction.length
        }
      }
      continue
    }

    const meridian = matchTextMeridianToken(format, i)
    if (meridian) {
      tokens.push({ kind: 'meridian', style: meridian.style })
      hasMeridian = true
      hasTime = true
      i += meridian.length
      continue
    }

    const lower = ch.toLowerCase()
    if (lower === 'y' || lower === 'm' || lower === 'd' || lower === 'h' || lower === 's') {
      let j = i + 1
      while (j < format.length && format[j].toLowerCase() === lower) j += 1
      const count = j - i
      if (lower === 'y') {
        tokens.push({ kind: 'year', count })
        hasDate = true
      } else if (lower === 'm') {
        tokens.push({ kind: 'month', count })
        hasDate = true
      } else if (lower === 'd') {
        tokens.push({ kind: 'day', count })
        hasDate = true
      } else if (lower === 'h') {
        tokens.push({ kind: 'hour', count })
        hasTime = true
      } else {
        tokens.push({ kind: 'second', count })
        hasTime = true
        const fraction = matchTextFractionalSecond(format, j)
        if (fraction) {
          tokens.push({ kind: 'literal', value: '.' })
          tokens.push({ kind: 'fractional-second', count: fraction.count })
          fractionalSecondDigits = Math.max(fractionalSecondDigits, fraction.count)
          j += fraction.length
        }
      }
      i = j
      continue
    }

    if (/^[A-Za-z]$/.test(ch)) return undefined
    tokens.push({ kind: 'literal', value: ch })
    i += 1
  }

  disambiguateTextDateTimeMinutes(tokens)

  const meaningful = hasDate || hasTime || hasElapsed || hasMeridian
  if (!meaningful) return undefined
  return { tokens, hasDate, hasTime, hasMeridian, fractionalSecondDigits }
}

function matchTextElapsedToken(
  format: string,
  index: number,
): { readonly token: TextDateTimeToken; readonly length: number } | undefined {
  if (format[index] !== '[') return undefined
  const end = format.indexOf(']', index + 1)
  if (end < 0) return undefined
  const raw = format.slice(index + 1, end)
  const lower = raw.toLowerCase()
  if (!/^(h+|m+|s+)$/.test(lower)) return undefined
  const count = raw.length
  const unit = lower[0]
  if (unit === 'h') {
    return { token: { kind: 'elapsed-hour', count }, length: end - index + 1 }
  }
  if (unit === 'm') {
    return { token: { kind: 'elapsed-minute', count }, length: end - index + 1 }
  }
  return { token: { kind: 'elapsed-second', count }, length: end - index + 1 }
}

function matchTextMeridianToken(
  format: string,
  index: number,
):
  | { readonly style: 'AM/PM' | 'am/pm' | 'A/P' | 'a/p'; readonly length: number }
  | undefined {
  if (format.startsWith('AM/PM', index)) return { style: 'AM/PM', length: 5 }
  if (format.startsWith('am/pm', index)) return { style: 'am/pm', length: 5 }
  if (format.startsWith('A/P', index)) return { style: 'A/P', length: 3 }
  if (format.startsWith('a/p', index)) return { style: 'a/p', length: 3 }
  return undefined
}

function matchTextFractionalSecond(
  format: string,
  index: number,
): { readonly count: number; readonly length: number } | undefined {
  if (format[index] !== '.') return undefined
  let end = index + 1
  while (format[end] === '0') end += 1
  const count = end - index - 1
  return count > 0 ? { count, length: count + 1 } : undefined
}

function disambiguateTextDateTimeMinutes(tokens: TextDateTimeToken[]) {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.kind !== 'month') continue
    const previous = nearestNonLiteralTextDateTimeToken(tokens, i, -1)
    const next = nearestNonLiteralTextDateTimeToken(tokens, i, 1)
    if (
      previous?.kind === 'hour' ||
      previous?.kind === 'elapsed-hour' ||
      next?.kind === 'second' ||
      next?.kind === 'elapsed-second'
    ) {
      tokens[i] = { kind: 'minute', count: token.count }
    }
  }
}

function nearestNonLiteralTextDateTimeToken(
  tokens: readonly TextDateTimeToken[],
  start: number,
  direction: -1 | 1,
): TextDateTimeToken | undefined {
  for (let i = start + direction; i >= 0 && i < tokens.length; i += direction) {
    if (tokens[i].kind !== 'literal') return tokens[i]
  }
  return undefined
}
