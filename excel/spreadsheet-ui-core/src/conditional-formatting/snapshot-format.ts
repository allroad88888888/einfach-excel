import type {
  SpreadsheetBorderSpec,
  SpreadsheetCellFormat,
  SpreadsheetNumberFormat,
} from '../backend'
import type { CellRange } from '../shared'
import {
  ALIGNMENTS,
  BORDER_SIDES,
  BORDER_STYLES,
  NEGATIVE_FORMATS,
  OVERFLOWS,
  VERTICAL_ALIGNMENTS,
} from './constants'
import type { ConditionalFormatScope } from './types'

export function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

export function isOneOf<const Values extends readonly unknown[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return (values as readonly unknown[]).includes(value)
}

export function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown conditional formatting transport failure'
  }
}

export function snapshotRevision(
  value: unknown,
): { readonly ok: true; readonly value: string | number | undefined } | { readonly ok: false } {
  if (value === undefined || typeof value === 'string') return { ok: true, value }
  if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value }
  return { ok: false }
}

export function snapshotRange(value: unknown): CellRange | null {
  if (!isObjectRecord(value)) return null
  try {
    const rowStart = value.rowStart
    const rowEnd = value.rowEnd
    const colStart = value.colStart
    const colEnd = value.colEnd
    if (
      typeof rowStart !== 'number' ||
      !Number.isSafeInteger(rowStart) ||
      rowStart < 0 ||
      typeof rowEnd !== 'number' ||
      !Number.isSafeInteger(rowEnd) ||
      rowEnd < rowStart ||
      typeof colStart !== 'number' ||
      !Number.isSafeInteger(colStart) ||
      colStart < 0 ||
      typeof colEnd !== 'number' ||
      !Number.isSafeInteger(colEnd) ||
      colEnd < colStart
    ) return null
    return { rowStart, rowEnd, colStart, colEnd }
  } catch {
    return null
  }
}

export function snapshotScope(value: unknown): ConditionalFormatScope | null {
  if (!isObjectRecord(value)) return null
  try {
    const range = snapshotRange(value.range)
    return range === null ? null : { range }
  } catch {
    return null
  }
}

function snapshotBorderSpec(value: unknown): SpreadsheetBorderSpec | null {
  if (!isObjectRecord(value)) return null
  try {
    const style = value.style
    const color = value.color
    if (!isOneOf(style, BORDER_STYLES)) return null
    if (color !== undefined && typeof color !== 'string') return null
    return { style, ...(color === undefined ? {} : { color }) }
  } catch {
    return null
  }
}

function snapshotNumberFormat(value: unknown): SpreadsheetNumberFormat | null {
  if (!isObjectRecord(value)) return null
  try {
    const kind = value.kind
    const digits = value.digits
    const negative = value.negative
    const validDigits = digits === undefined || (typeof digits === 'number' && Number.isFinite(digits))
    const validNegative = negative === undefined || isOneOf(negative, NEGATIVE_FORMATS)
    switch (kind) {
      case 'general': case 'text': return { kind }
      case 'number': case 'decimal': {
        const thousands = value.thousands
        if (!validDigits || !validNegative || (thousands !== undefined && typeof thousands !== 'boolean')) return null
        return { kind, ...(digits === undefined ? {} : { digits }), ...(thousands === undefined ? {} : { thousands }), ...(negative === undefined ? {} : { negative }) }
      }
      case 'currency': {
        const symbol = value.symbol
        if (!validDigits || !validNegative || (symbol !== undefined && typeof symbol !== 'string')) return null
        return { kind, ...(symbol === undefined ? {} : { symbol }), ...(digits === undefined ? {} : { digits }), ...(negative === undefined ? {} : { negative }) }
      }
      case 'accounting': {
        const symbol = value.symbol
        if (!validDigits || (symbol !== undefined && typeof symbol !== 'string')) return null
        return { kind, ...(symbol === undefined ? {} : { symbol }), ...(digits === undefined ? {} : { digits }) }
      }
      case 'date': case 'time': {
        const pattern = value.pattern
        return pattern !== undefined && typeof pattern !== 'string' ? null : { kind, ...(pattern === undefined ? {} : { pattern }) }
      }
      case 'percent': case 'percentage':
        return !validDigits || !validNegative ? null : { kind, ...(digits === undefined ? {} : { digits }), ...(negative === undefined ? {} : { negative }) }
      case 'fraction': {
        const denominator = value.denominator
        if (denominator !== undefined && denominator !== 'one-digit' && denominator !== 'two-digit' && denominator !== 'three-digit' && (typeof denominator !== 'number' || !Number.isFinite(denominator))) return null
        return { kind, ...(denominator === undefined ? {} : { denominator }) }
      }
      case 'scientific': return !validDigits ? null : { kind, ...(digits === undefined ? {} : { digits }) }
      case 'special': {
        const preset = value.preset
        const locale = value.locale
        if (typeof preset !== 'string' || (locale !== undefined && typeof locale !== 'string')) return null
        return { kind, preset, ...(locale === undefined ? {} : { locale }) }
      }
      case 'custom': return typeof value.pattern === 'string' ? { kind, pattern: value.pattern } : null
      default: return null
    }
  } catch { return null }
}

export function snapshotFormat(value: unknown): SpreadsheetCellFormat | null {
  if (!isObjectRecord(value)) return null
  try {
    const result: SpreadsheetCellFormat = {}
    if (value.numberFormat !== undefined) {
      const numberFormat = snapshotNumberFormat(value.numberFormat)
      if (numberFormat === null) return null
      result.numberFormat = numberFormat
    }
    for (const field of ['bold', 'italic', 'underline', 'strikethrough', 'wrap', 'shrinkToFit'] as const) {
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'boolean') return null
        result[field] = value[field]
      }
    }
    for (const field of ['fontFamily', 'fgColor', 'bgColor', 'locale'] as const) {
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'string') return null
        result[field] = value[field]
      }
    }
    for (const field of ['fontSize', 'indent'] as const) {
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) return null
        result[field] = value[field]
      }
    }
    if (value.align !== undefined) {
      if (!isOneOf(value.align, ALIGNMENTS)) return null
      result.align = value.align
    }
    if (value.verticalAlign !== undefined) {
      if (!isOneOf(value.verticalAlign, VERTICAL_ALIGNMENTS)) return null
      result.verticalAlign = value.verticalAlign
    }
    if (value.overflow !== undefined) {
      if (!isOneOf(value.overflow, OVERFLOWS)) return null
      result.overflow = value.overflow
    }
    if (value.rotation !== undefined) {
      if (value.rotation !== 'vertical' && (typeof value.rotation !== 'number' || !Number.isFinite(value.rotation) || value.rotation < -90 || value.rotation > 90)) return null
      result.rotation = value.rotation
    }
    if (value.borders !== undefined) {
      if (!isObjectRecord(value.borders)) return null
      const borders: Partial<Record<(typeof BORDER_SIDES)[number], SpreadsheetBorderSpec>> = {}
      for (const side of BORDER_SIDES) {
        if (value.borders[side] === undefined) continue
        const spec = snapshotBorderSpec(value.borders[side])
        if (spec === null) return null
        borders[side] = spec
      }
      result.borders = borders
    }
    return result
  } catch { return null }
}
