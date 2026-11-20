import type {
  RustTextColumnType,
  RustTextColumnsNumberOptions,
} from '../rust-workbook/text-columns-commands'

export interface PlannedFileField {
  readonly display: string
  readonly tsvInput: string
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const

const ORDER_INDICES: Record<Exclude<RustTextColumnType, 'general' | 'text' | 'skip'>, readonly [number, number, number]> = {
  dateMdy: [2, 0, 1],
  dateDmy: [2, 1, 0],
  dateYmd: [0, 1, 2],
  dateMyd: [1, 0, 2],
  dateDym: [1, 2, 0],
  dateYdm: [0, 2, 1],
}

const isAsciiDigits = (text: string): boolean => text.length > 0 && /^\d+$/.test(text)

function daysInExcelMonth(year: number, month: number): number | null {
  if (month < 1 || month > 12) return null
  if (year === 1900 && month === 2) return 29
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || day < 1) return null
  const maxDay = daysInExcelMonth(year, month)
  if (!maxDay || day > maxDay) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthFromName(raw: string): number | null {
  if (raw.endsWith('月')) {
    const prefix = raw.slice(0, -1)
    const num = Number(prefix)
    return Number.isInteger(num) && num >= 1 && num <= 12 && isAsciiDigits(prefix) ? num : null
  }
  const lowered = raw.replace(/\.+$/, '').toLowerCase()
  if (lowered.length < 3) return null
  const normalized = lowered === 'sept' ? 'sep' : lowered
  const index = MONTHS.findIndex((month) => month.startsWith(normalized))
  return index >= 0 ? index + 1 : null
}

function parseOrderedDateIso(
  raw: string,
  order: Exclude<RustTextColumnType, 'general' | 'text' | 'skip'>,
): string | null {
  const text = raw.trim()
  if (!text) return null
  const indices = ORDER_INDICES[order]
  const named = /\p{L}/u.test(text)
  let parts: string[]
  if (text.length === 8 && isAsciiDigits(text)) {
    const w0 = indices[0] === 0 ? 4 : 2
    const w1 = indices[0] === 1 ? 4 : 2
    parts = [text.slice(0, w0), text.slice(w0, w0 + w1), text.slice(w0 + w1)]
  } else if (named) {
    parts = text.split(/[\/\s.,-]+/u).filter(Boolean)
  } else {
    const match = /[\/.-]/.exec(text)
    if (!match) return null
    parts = text.split(match[0]).map((part) => part.trim())
  }
  if (
    parts.length !== 3 ||
    !isAsciiDigits(parts[indices[0]]!) ||
    !isAsciiDigits(parts[indices[2]]!)
  )
    return null
  const yearText = parts[indices[0]]!
  const dayText = parts[indices[2]]!
  if ((yearText.length !== 2 && yearText.length !== 4) || dayText.length > 2) return null
  let year = Number(yearText)
  if (yearText.length === 2) year += year < 30 ? 2000 : 1900
  const monthText = parts[indices[1]]!
  const month = isAsciiDigits(monthText) && monthText.length <= 2
    ? Number(monthText)
    : named
      ? monthFromName(monthText)
      : null
  if (month === null) return null
  return formatIsoDate(year, month, Number(dayText))
}

export function validateNumberOptions(options?: RustTextColumnsNumberOptions): string | null {
  if (!options) return null
  if (options.decimalSeparator !== '.' && options.decimalSeparator !== ',')
    return 'Choose dot or comma as the decimal separator.'
  if (
    options.groupSeparator !== null &&
    !['.', ',', ' ', '\u00a0', '\u202f', "'"].includes(options.groupSeparator)
  )
    return 'Unsupported thousands separator.'
  if (options.groupSeparator === options.decimalSeparator)
    return 'Decimal and thousands separators must be different.'
  return null
}

function normalizeLocaleNumber(text: string, options: RustTextColumnsNumberOptions): string | null {
  let body = text.trim()
  const trailing = body.endsWith('-')
  if (trailing) {
    if (!options.trailingMinus) return null
    body = body.slice(0, -1).trimEnd()
  }
  const percentage = body.endsWith('%')
  if (percentage) body = body.slice(0, -1).trimEnd()
  let sign = trailing ? '-' : ''
  if (body.startsWith('+') || body.startsWith('-')) {
    if (trailing) return null
    sign = body[0]!
    body = body.slice(1)
  }
  const expMatch = /[eE]/.exec(body)
  const mantissa = expMatch ? body.slice(0, expMatch.index) : body
  const exponent = expMatch ? body.slice(expMatch.index + 1) : ''
  if (expMatch) {
    const expDigits = exponent.startsWith('+') || exponent.startsWith('-') ? exponent.slice(1) : exponent
    if (!isAsciiDigits(expDigits)) return null
  }
  const parts = mantissa.split(options.decimalSeparator)
  if (parts.length > 2) return null
  const [integerRaw = '', fraction] = parts
  if (fraction !== undefined && fraction.length > 0 && !isAsciiDigits(fraction)) return null
  let integer = integerRaw
  if (options.groupSeparator && integerRaw.includes(options.groupSeparator)) {
    const groups = integerRaw.split(options.groupSeparator)
    const [first = '', ...rest] = groups
    if (first.length > 3 || !isAsciiDigits(first)) return null
    if (rest.some((group) => group.length !== 3 || !isAsciiDigits(group))) return null
    integer = groups.join('')
  } else if (integerRaw.length > 0 && !isAsciiDigits(integerRaw)) {
    return null
  }
  if (!integer && !fraction) return null
  return `${sign}${integer}${fraction !== undefined ? `.${fraction}` : ''}${exponent ? `e${exponent}` : ''}${percentage ? '%' : ''}`
}

function convertGeneral(text: string, options?: RustTextColumnsNumberOptions): PlannedFileField {
  const literal = (): PlannedFileField => ({ display: text, tsvInput: `'${text}` })
  const trimmed = text.trim()
  if (text.startsWith("'") || trimmed.startsWith('=')) return literal()
  if (/^(?:true|false)$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase()
    return { display: upper, tsvInput: upper }
  }
  const candidate = options ? normalizeLocaleNumber(text, options) : trimmed
  if (candidate !== null) {
    if (candidate.endsWith('%')) {
      const num = Number(candidate.slice(0, -1).trim())
      if (Number.isFinite(num) && candidate.slice(0, -1).trim() !== '') {
        return { display: candidate, tsvInput: candidate }
      }
      if (options) return literal()
    } else if (candidate !== '') {
      const num = Number(candidate)
      if (Number.isFinite(num)) return { display: String(num), tsvInput: String(num) }
      if (options) return literal()
    }
  } else if (options) {
    const fallback = trimmed.endsWith('%') ? Number(trimmed.slice(0, -1).trim()) : Number(trimmed)
    if (trimmed !== '' && Number.isFinite(fallback)) return literal()
  }
  const iso = parseOrderedDateIso(trimmed, 'dateYmd')
  if (iso && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) return { display: iso, tsvInput: iso }
  return literal()
}

export function convertFileField(
  text: string,
  kind: RustTextColumnType | undefined,
  options?: RustTextColumnsNumberOptions,
): PlannedFileField {
  if (!text) return { display: '', tsvInput: '' }
  if (!kind || kind === 'text') return { display: text, tsvInput: `'${text}` }
  if (kind === 'general') return convertGeneral(text, options)
  if (kind === 'skip') return { display: '', tsvInput: '' }
  const iso = parseOrderedDateIso(text, kind)
  return iso ? { display: iso, tsvInput: iso } : { display: text, tsvInput: `'${text}` }
}
