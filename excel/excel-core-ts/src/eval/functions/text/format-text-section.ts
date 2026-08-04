/**
 * 按 Excel 格式串的文本节（`@` 占位符）渲染字符串值。
 */

import { splitTextNumberSections, stripTextNumberBracketTags } from './format-sections'

export function formatTextTextValue(text: string, format: string): string | undefined {
  const sections = splitTextNumberSections(format)
  if (!sections) return undefined
  const section = sections.length === 4
    ? sections[3]
    : sections.length === 1
      ? sections[0]
      : undefined
  if (section === undefined) return undefined
  if (section === '') return sections.length === 4 ? '' : undefined

  const rendered = renderTextTextSection(text, section)
  if (!rendered) return undefined
  if (sections.length === 1 && !rendered.hasPlaceholder) return undefined
  return rendered.value
}

function renderTextTextSection(
  text: string,
  format: string,
): { readonly value: string; readonly hasPlaceholder: boolean } | undefined {
  const stripped = stripTextNumberBracketTags(format)
  if (stripped !== format) return renderTextTextSection(text, stripped)

  let out = ''
  let hasPlaceholder = false
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

    if (ch === '@') {
      out += text
      hasPlaceholder = true
      i += 1
      continue
    }

    out += ch
    i += 1
  }

  if (!hasPlaceholder && !hasExplicitLiteral) return undefined
  return { value: out, hasPlaceholder }
}
