/**
 * 拆解 Excel 格式串的结构：`;` 分节、`[>0]` 条件、`[红色]`/`[$¥-804]` 方括号标签。
 */

export function splitTextNumberSections(format: string): string[] | undefined {
  const sections: string[] = []
  let buffer = ''
  let inString = false
  let inBracket = false

  for (let i = 0; i < format.length; i += 1) {
    const ch = format[i]

    if (ch === '\\' && i + 1 < format.length) {
      buffer += ch + format[i + 1]
      i += 1
      continue
    }

    if (ch === '"') {
      inString = !inString
      buffer += ch
      continue
    }

    if (!inString && ch === '[') {
      inBracket = true
      buffer += ch
      continue
    }

    if (!inString && ch === ']') {
      inBracket = false
      buffer += ch
      continue
    }

    if (ch === ';' && !inString && !inBracket) {
      sections.push(buffer)
      buffer = ''
      continue
    }

    buffer += ch
  }

  if (inString || inBracket) return undefined
  sections.push(buffer)
  return sections
}

export interface TextNumberCondition {
  readonly op: '>' | '<' | '=' | '>=' | '<=' | '<>'
  readonly value: number
}

export function extractTextNumberSectionCondition(section: string): {
  readonly body: string
  readonly condition?: TextNumberCondition
} {
  let prefix = ''
  let index = 0
  let condition: TextNumberCondition | undefined

  while (section[index] === '[') {
    const end = section.indexOf(']', index + 1)
    if (end < 0) break
    const tag = section.slice(index + 1, end).trim()
    const parsed = parseTextNumberConditionTag(tag)
    if (parsed) {
      condition = parsed
    } else {
      prefix += section.slice(index, end + 1)
    }
    index = end + 1
  }

  return { body: prefix + section.slice(index), condition }
}

function parseTextNumberConditionTag(tag: string): TextNumberCondition | undefined {
  const match = /^(>=|<=|<>|>|<|=)\s*(-?\d+(?:\.\d+)?)$/.exec(tag)
  if (!match) return undefined
  const value = Number(match[2])
  if (!Number.isFinite(value)) return undefined
  return { op: match[1] as TextNumberCondition['op'], value }
}

export function matchesTextNumberCondition(condition: TextNumberCondition, value: number): boolean {
  switch (condition.op) {
    case '>':
      return value > condition.value
    case '<':
      return value < condition.value
    case '=':
      return value === condition.value
    case '>=':
      return value >= condition.value
    case '<=':
      return value <= condition.value
    case '<>':
      return value !== condition.value
  }
}

const TEXT_NUMBER_COLOR_TAGS = new Set([
  'black',
  'white',
  'red',
  'green',
  'blue',
  'cyan',
  'magenta',
  'yellow',
])

export function stripTextNumberBracketTags(format: string): string {
  let out = ''
  let changed = false
  let i = 0
  while (i < format.length) {
    const ch = format[i]

    if (ch === '"') {
      out += ch
      i += 1
      while (i < format.length) {
        const next = format[i]
        out += next
        if (next === '"') {
          if (format[i + 1] === '"') {
            out += format[i + 1]
            i += 2
            continue
          }
          i += 1
          break
        }
        i += 1
      }
      continue
    }

    if (ch === '\\') {
      out += ch
      if (format[i + 1] !== undefined) {
        out += format[i + 1]
        i += 2
      } else {
        i += 1
      }
      continue
    }

    if (ch === '[') {
      const end = format.indexOf(']', i + 1)
      if (end >= 0) {
        const replacement = replacementForTextNumberBracketTag(format.slice(i + 1, end))
        if (replacement !== undefined) {
          out += replacement
          changed = true
          i = end + 1
          continue
        }
        out += format.slice(i, end + 1)
        i = end + 1
        continue
      }
    }

    out += ch
    i += 1
  }
  return changed ? out : format
}

function replacementForTextNumberBracketTag(tag: string): string | undefined {
  const trimmed = tag.trim()
  const lower = trimmed.toLowerCase()
  if (TEXT_NUMBER_COLOR_TAGS.has(lower) || /^color\d+$/.test(lower)) return ''
  // `[$-409]` — Excel locale-only marker, no currency symbol. The hex
  // after the `-` is an LCID we DON'T act on yet (workbook-level locale
  // wins); we just strip the tag silently so the format engine doesn't
  // see it as garbage. Same goes for `[$-en-US]` BCP-47 form some hosts
  // emit.
  if (/^\$-[0-9a-zA-Z-]+$/.test(trimmed)) return ''
  if (!trimmed.startsWith('$')) return undefined
  const currencyAndLocale = trimmed.slice(1)
  const localeStart = currencyAndLocale.indexOf('-')
  return localeStart >= 0 ? currencyAndLocale.slice(0, localeStart) : currencyAndLocale
}
