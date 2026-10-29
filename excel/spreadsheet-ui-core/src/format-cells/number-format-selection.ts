import type { CellRange } from '../shared'
import type { SpreadsheetCellFormat, SpreadsheetNumberFormat } from '../backend'
import { CURRENCY_FORMAT_OPTIONS } from './currency-format-options'
import type {
  NumberFormatDialogKind,
  NumberFormatDialogOpenState,
} from './number-format-dialog-state'
import { DATE_TIME_FORMAT_OPTIONS, NUMBER_FORMAT_OPTIONS } from './pattern-format-options'

const DEFAULT_SELECTED_ID: Record<NumberFormatDialogKind, string> = {
  currency: CURRENCY_FORMAT_OPTIONS[0].id,
  dateTime: DATE_TIME_FORMAT_OPTIONS[0].id,
  number: NUMBER_FORMAT_OPTIONS[1].id,
}

export function cloneRange(range: CellRange): CellRange {
  return { ...range }
}

function cloneNumberFormat(format: SpreadsheetNumberFormat): SpreadsheetNumberFormat {
  return { ...format } as SpreadsheetNumberFormat
}

export function cloneCellFormat(
  format: SpreadsheetCellFormat | undefined | null,
): SpreadsheetCellFormat {
  const clone: SpreadsheetCellFormat = { ...(format ?? {}) }
  if (format?.numberFormat) clone.numberFormat = cloneNumberFormat(format.numberFormat)
  if (format?.borders) clone.borders = { ...format.borders }
  return clone
}

export function currentDigits(format: SpreadsheetNumberFormat | undefined): number {
  if (!format) return 2
  if (format.kind === 'currency' || format.kind === 'accounting') return format.digits ?? 2
  return 2
}

function formatPattern(format: SpreadsheetNumberFormat): string | null {
  if (format.kind === 'date' || format.kind === 'time' || format.kind === 'custom') {
    return format.pattern ?? null
  }
  return null
}

function chooseCurrencyId(format: SpreadsheetNumberFormat | undefined): string {
  if (!format || (format.kind !== 'currency' && format.kind !== 'accounting')) {
    return DEFAULT_SELECTED_ID.currency
  }
  const symbol = format.symbol ?? '$'
  return (
    CURRENCY_FORMAT_OPTIONS.find((option) => option.symbol === symbol)?.id ??
    DEFAULT_SELECTED_ID.currency
  )
}

function chooseDateTimeId(format: SpreadsheetNumberFormat | undefined): string {
  if (!format) return DEFAULT_SELECTED_ID.dateTime
  const pattern = formatPattern(format)
  if (!pattern) return DEFAULT_SELECTED_ID.dateTime
  const match = DATE_TIME_FORMAT_OPTIONS.find((option) => option.pattern === pattern)
  return match?.id ?? DEFAULT_SELECTED_ID.dateTime
}

function chooseNumberId(format: SpreadsheetNumberFormat | undefined): string {
  if (!format) return DEFAULT_SELECTED_ID.number
  if (format.kind === 'number' || format.kind === 'decimal') {
    const digits = format.digits ?? 2
    const thousands = format.thousands ?? false
    const match = NUMBER_FORMAT_OPTIONS.find((option) => {
      const candidate = option.numberFormat
      return (
        candidate.kind === 'number' &&
        candidate.digits === digits &&
        (candidate.thousands ?? false) === thousands
      )
    })
    return match?.id ?? DEFAULT_SELECTED_ID.number
  }
  if (format.kind === 'percent' || format.kind === 'percentage') {
    const digits = format.digits ?? 0
    const match = NUMBER_FORMAT_OPTIONS.find((option) => {
      const candidate = option.numberFormat
      return candidate.kind === 'percent' && candidate.digits === digits
    })
    return match?.id ?? DEFAULT_SELECTED_ID.number
  }
  if (format.kind === 'scientific') return 'scientific'
  if (format.kind === 'text') return 'text'
  if (format.kind === 'custom') {
    const match = NUMBER_FORMAT_OPTIONS.find((option) => option.pattern === format.pattern)
    return match?.id ?? DEFAULT_SELECTED_ID.number
  }
  return DEFAULT_SELECTED_ID.number
}

export function chooseSelectedId(
  kind: NumberFormatDialogKind,
  format: SpreadsheetNumberFormat | undefined,
): string {
  if (kind === 'currency') return chooseCurrencyId(format)
  if (kind === 'dateTime') return chooseDateTimeId(format)
  return chooseNumberId(format)
}

function optionFormatForState(state: NumberFormatDialogOpenState): SpreadsheetNumberFormat {
  if (state.kind === 'currency') {
    const option =
      CURRENCY_FORMAT_OPTIONS.find((candidate) => candidate.id === state.selectedId) ??
      CURRENCY_FORMAT_OPTIONS[0]
    if (option.pos === 'after') {
      const decimals = state.digits > 0 ? `.${'0'.repeat(state.digits)}` : ''
      return { kind: 'custom', pattern: `#,##0${decimals} "${option.symbol}"` }
    }
    return { kind: 'currency', symbol: option.symbol, digits: state.digits }
  }

  const options = state.kind === 'dateTime' ? DATE_TIME_FORMAT_OPTIONS : NUMBER_FORMAT_OPTIONS
  const option =
    options.find((candidate) => candidate.id === state.selectedId) ??
    options.find((candidate) => candidate.id === DEFAULT_SELECTED_ID[state.kind]) ??
    options[0]
  return cloneNumberFormat(option.numberFormat)
}

export function formatForState(state: NumberFormatDialogOpenState): SpreadsheetCellFormat {
  return {
    ...cloneCellFormat(state.baseFormat),
    numberFormat: optionFormatForState(state),
  }
}
