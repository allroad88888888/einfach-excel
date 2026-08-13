import type { FormatCellsDraft, FormatCellsNumberCategory, SpreadsheetNumberFormat } from './types'
import { formatNumberValue } from '../operations/format/numberFormat'

/** Resolve the editor category without narrowing forward-compatible format kinds. */
export function detectFormatCellsNumberCategory(
  draft: FormatCellsDraft | null,
): FormatCellsNumberCategory {
  const kind = (draft?.numberFormat as { kind?: string } | undefined)?.kind
  switch (kind) {
    case 'number':
    case 'decimal':
      return 'number'
    case 'currency':
    case 'accounting':
    case 'date':
    case 'time':
    case 'fraction':
    case 'scientific':
    case 'text':
    case 'special':
    case 'custom':
      return kind
    case 'percent':
    case 'percentage':
      return 'percentage'
    default:
      return 'general'
  }
}

/** Translate a supported picker category into the backend format payload. */
export function numberFormatForCategory(
  category: FormatCellsNumberCategory,
): SpreadsheetNumberFormat {
  switch (category) {
    case 'number':
      return { kind: 'decimal', digits: 2 }
    case 'currency':
      return { kind: 'currency', symbol: '$', digits: 2 }
    case 'percentage':
      return { kind: 'percent', digits: 2 }
    case 'date':
      return { kind: 'date', pattern: 'yyyy-MM-dd' }
    case 'custom':
      return { kind: 'custom', pattern: '#,##0.00' }
    default:
      return { kind: 'general' }
  }
}

function safeDigits(format: SpreadsheetNumberFormat | undefined): number {
  if (!format || !('digits' in format)) return 2
  const digits = format.digits ?? 2
  if (!Number.isFinite(digits)) return 2
  return Math.max(0, Math.min(20, Math.round(digits)))
}

/** Build the subscriber-visible preview directly from the authoritative draft. */
export function formatCellsPreviewText(draft: FormatCellsDraft | null): string {
  const sample = 1234.5
  const category = detectFormatCellsNumberCategory(draft)
  const format = draft?.numberFormat
  const digits = safeDigits(format)
  if (format?.kind === 'custom') return formatNumberValue(format, sample).text
  switch (category) {
    case 'number':
      return sample.toFixed(digits)
    case 'currency': {
      const symbol = format?.kind === 'currency' ? (format.symbol ?? '$') : '$'
      return `${symbol}${sample.toFixed(digits)}`
    }
    case 'accounting':
      return `$    ${sample.toFixed(digits)}`
    case 'percentage':
      return `${(sample / 100).toFixed(digits)}%`
    case 'date':
      return '2026-05-19'
    case 'time':
      return '12:34:56'
    case 'fraction':
      return '1234 1/2'
    case 'scientific':
      return '1.23E+03'
    case 'special':
      return '12345-6789'
    default:
      return String(sample)
  }
}
