/**
 * TEXT 函数本体：按 Excel 格式串挑出该用的节，把一个值渲染成字符串。
 */

import { propagateError } from '../../coerce'
import type { FunctionImpl } from '../../../types'
import { getNumberFormatParts } from '../_locale'
import { coerceText, errValue, ERR_VALUE } from './read-args'
import {
  extractTextNumberSectionCondition,
  matchesTextNumberCondition,
  splitTextNumberSections,
  stripTextNumberBracketTags,
} from './format-sections'
import { formatTextTextValue } from './format-text-section'
import {
  formatFixedDecimal,
  formatTextFraction,
  formatTextScientific,
  formatThousands,
  roundHalfAwayFromZero,
} from './format-numeric'
import type { NumberSeparators } from './format-numeric'
import { formatTextCustomNumber, formatTextLiteralOnly } from './format-custom'
import { formatDateSerial } from './format-datetime-render'

/**
 * Supported format codes:
 *   "0"         integer with no thousands separator
 *   "000"       zero-padded integer width
 *   "0.00"      fixed 2 decimals
 *   "#,##0"     integer with thousands separator
 *   "#,##0.00"  thousands + 2 decimals
 *   "0%"        integer percent (multiplies by 100, appends %)
 *   "0.00%"     2-decimal percent
 *   "$#,##0.00" USD currency
 *   "yyyy-mm-dd", month/day names, time, elapsed time, and fractional seconds
 *   positive;negative numeric sections such as "#,##0;(#,##0)"
 *   "0.00E+00" scientific notation
 *   "# ?/?"     simple fraction notation
 *   quoted literal suffix/prefix, bracket color/currency tags, and trailing
 *   comma thousand scaling
 *
 * Out of scope:
 *   - Locale semantics, rendered colors, and full custom formats.
 */
function formatTextNumber(
  n: number,
  format: string,
  separators: NumberSeparators,
): string | undefined {
  if (format.length === 0) return undefined

  const sections = splitTextNumberSections(format)
  if (!sections) return undefined
  if (sections.length > 1) {
    const parsed = sections.map(extractTextNumberSectionCondition)
    const conditioned = parsed.find(
      (section) => section.condition && matchesTextNumberCondition(section.condition, n),
    )
    if (conditioned) return formatSelectedTextNumberSection(n, conditioned.body, separators)

    const unconditioned = parsed.filter((section) => !section.condition)
    if (unconditioned.length === 0) return undefined
    const section = n < 0
      ? unconditioned[1] ?? unconditioned[0]
      : n === 0 && unconditioned[2]
        ? unconditioned[2]
        : unconditioned[0]
    return formatSelectedTextNumberSection(n < 0 ? Math.abs(n) : n, section.body, separators)
  }

  return formatTextNumberSection(n, format, separators)
}

function formatSelectedTextNumberSection(
  n: number,
  format: string,
  separators: NumberSeparators,
): string | undefined {
  return format === '' ? '' : formatTextNumberSection(n, format, separators)
}

function formatTextNumberSection(
  n: number,
  format: string,
  separators: NumberSeparators,
): string | undefined {
  const stripped = stripTextNumberBracketTags(format)
  if (stripped !== format) return formatTextNumberSection(n, stripped, separators)

  const date = formatDateSerial(n, format)
  if (date !== undefined) return date

  if (format.startsWith('(') && format.endsWith(')')) {
    const inner = formatTextNumberSection(n, format.slice(1, -1), separators)
    return inner === undefined ? undefined : `(${inner})`
  }

  const scientific = formatTextScientific(n, format)
  if (scientific !== undefined) return scientific

  const fraction = formatTextFraction(n, format)
  if (fraction !== undefined) return fraction

  switch (format) {
    case '0':
      return roundHalfAwayFromZero(n).toString()
    case '0.00':
      // Compose: integer part + locale decimal + 2-digit fraction. Avoids
      // relying on Number.prototype.toFixed (which always uses `.`).
      return formatFixedDecimal(n, 2, separators.decimal)
    case '#,##0':
      return formatThousands(roundHalfAwayFromZero(n), 0, separators)
    case '#,##0.00':
      return formatThousands(n, 2, separators)
    case '0%':
      return `${roundHalfAwayFromZero(n * 100)}%`
    case '0.00%':
      return `${formatFixedDecimal(n * 100, 2, separators.decimal)}%`
    case '$#,##0.00':
      return `$${formatThousands(n, 2, separators)}`
    default:
      break
  }

  if (/^0+$/.test(format)) {
    const rounded = roundHalfAwayFromZero(n)
    const sign = rounded < 0 ? '-' : ''
    return `${sign}${Math.abs(rounded).toString().padStart(format.length, '0')}`
  }

  const fixed = format.match(/^(0+)\.(0+)$/)
  if (fixed) {
    return formatFixedDecimal(n, fixed[2].length, separators.decimal)
  }

  const custom = formatTextCustomNumber(n, format, separators)
  if (custom !== undefined) return custom

  const literal = formatTextLiteralOnly(format)
  if (literal !== undefined) return literal

  return undefined
}

/**
 * TEXT(value, format_code) — format a number per Excel format string.
 * Text values pass through unless the format has an explicit `@` text section.
 */
export const TEXT: FunctionImpl = (args, ctx) => {
  if (args.length !== 2) return errValue('#VALUE!', 'TEXT takes exactly 2 arguments')
  const err = propagateError(args)
  if (err) return err
  const fmtR = coerceText(args[1])
  if (!fmtR.ok) return fmtR.error
  const fmt = fmtR.value
  const parts = getNumberFormatParts(ctx.locale)
  const separators: NumberSeparators = { thousand: parts.thousand, decimal: parts.decimal }
  const v = args[0]
  if (v.kind === 'string') {
    return { kind: 'string', value: formatTextTextValue(v.value, fmt) ?? v.value }
  }
  if (v.kind === 'blank') return { kind: 'string', value: '' }
  if (v.kind === 'boolean') return { kind: 'string', value: v.value ? 'TRUE' : 'FALSE' }
  // For arrays, format the top-left scalar (Wave E will broadcast).
  if (v.kind === 'array') {
    const row = v.value[0]
    if (!row || row.length === 0) return ERR_VALUE
    const inner = row[0]
    if (inner.kind === 'error') return inner
    if (inner.kind === 'string') {
      return { kind: 'string', value: formatTextTextValue(inner.value, fmt) ?? inner.value }
    }
    if (inner.kind === 'blank') return { kind: 'string', value: '' }
    if (inner.kind === 'boolean') return { kind: 'string', value: inner.value ? 'TRUE' : 'FALSE' }
    if (inner.kind === 'number') {
      const formatted = formatTextNumber(inner.value, fmt, separators)
      return formatted === undefined ? ERR_VALUE : { kind: 'string', value: formatted }
    }
    return ERR_VALUE
  }
  if (v.kind !== 'number') return ERR_VALUE
  const formatted = formatTextNumber(v.value, fmt, separators)
  return formatted === undefined ? ERR_VALUE : { kind: 'string', value: formatted }
}
