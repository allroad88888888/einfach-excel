import type {
  CellRange,
  SpreadsheetBorders,
  SpreadsheetBorderStyle,
  SpreadsheetCellFormat,
  SpreadsheetNumberFormat,
  ToolbarFormatCommandIntent,
} from '@einfach/spreadsheet-ui-core'
import type { BordersPreset } from './BordersDropdown'
import { DEFAULT_FONT_SIZE, FONT_SIZE_MAX, FONT_SIZE_MIN } from './FontSizeDropdown'

const BORDER_DEFAULT_STYLE: SpreadsheetBorderStyle = 'thin'

/** Clones the mutable portions of a cell format before a toolbar write. */
export function cloneToolbarFormat(
  format: SpreadsheetCellFormat | undefined,
): SpreadsheetCellFormat {
  const clone: SpreadsheetCellFormat = { ...(format ?? {}) }
  if (format?.numberFormat) clone.numberFormat = { ...format.numberFormat }
  if (format?.borders) clone.borders = { ...format.borders }
  return clone
}

/** Returns the border patch for one cell in the selected display range. */
export function bordersPatchForCell(
  preset: BordersPreset,
  row: number,
  col: number,
  range: CellRange,
  current: SpreadsheetBorders | undefined,
): SpreadsheetBorders | undefined {
  const isLeftEdge = col === range.colStart
  const isRightEdge = col === range.colEnd
  const isTopEdge = row === range.rowStart
  const isBottomEdge = row === range.rowEnd
  const spec = { style: BORDER_DEFAULT_STYLE }

  switch (preset) {
    case 'none':
      return undefined
    case 'all':
      return { top: spec, right: spec, bottom: spec, left: spec }
    case 'outer': {
      const next: SpreadsheetBorders = { ...(current ?? {}) }
      if (isTopEdge) next.top = spec
      if (isRightEdge) next.right = spec
      if (isBottomEdge) next.bottom = spec
      if (isLeftEdge) next.left = spec
      return next
    }
    case 'inner': {
      const next: SpreadsheetBorders = { ...(current ?? {}) }
      if (!isTopEdge) next.top = spec
      if (!isRightEdge) next.right = spec
      if (!isBottomEdge) next.bottom = spec
      if (!isLeftEdge) next.left = spec
      return next
    }
    case 'top':
      return isTopEdge ? { ...(current ?? {}), top: spec } : current
    case 'right':
      return isRightEdge ? { ...(current ?? {}), right: spec } : current
    case 'bottom':
      return isBottomEdge ? { ...(current ?? {}), bottom: spec } : current
    case 'left':
      return isLeftEdge ? { ...(current ?? {}), left: spec } : current
    default:
      return current
  }
}

/** Maps an existing number-format menu id to its Core format representation. */
export function numberFormatForValue(value: string | null): SpreadsheetNumberFormat {
  switch (value) {
    case 'Auto':
    case 'General':
      return { kind: 'general' }
    case 'Text':
      return { kind: 'text' }
    case 'Number':
      return { kind: 'decimal', digits: 2, thousands: false }
    case 'Percent':
      return { kind: 'percent', digits: 0 }
    case 'Scientific':
      return { kind: 'scientific', digits: 2 }
    case 'NumberThousands':
      return { kind: 'decimal', digits: 2, thousands: true }
    case 'Accounting':
      return { kind: 'accounting', symbol: '¥', digits: 2 }
    case 'Currency':
      return { kind: 'currency', symbol: '$', digits: 2 }
    case 'DateShort':
    case 'Date':
      return { kind: 'date', pattern: 'yyyy-MM-dd' }
    case 'DateLong':
      return { kind: 'date', pattern: 'yyyy"年"m"月"d"日"' }
    case 'Time12':
      return { kind: 'time', pattern: 'h:mm AM/PM' }
    case 'Time24':
      return { kind: 'time', pattern: 'HH:mm' }
    case 'DateTime12':
      return { kind: 'custom', pattern: 'yyyy-MM-dd h:mm AM/PM' }
    case 'DateTime24':
      return { kind: 'custom', pattern: 'yyyy-MM-dd HH:mm' }
    default:
      return { kind: 'general' }
  }
}

/** Applies an existing toolbar command to the active-cell format snapshot. */
export function formatForToolbarCommand(
  intent: ToolbarFormatCommandIntent,
  current: SpreadsheetCellFormat,
): SpreadsheetCellFormat {
  switch (intent.command) {
    case 'bold':
      return { ...current, bold: !current.bold }
    case 'italic':
      return { ...current, italic: !current.italic }
    case 'underline':
      return { ...current, underline: !current.underline }
    case 'strikethrough':
      return { ...current, strikethrough: !current.strikethrough }
    case 'wrap':
      return { ...current, wrap: !current.wrap }
    case 'rotation': {
      if (intent.value === '' || intent.value === null) {
        const { rotation: _rotation, ...rest } = current
        return rest
      }
      if (intent.value === 'vertical') return { ...current, rotation: 'vertical' }
      const parsed = Number(intent.value)
      return Number.isFinite(parsed)
        ? { ...current, rotation: Math.max(-90, Math.min(90, Math.round(parsed))) }
        : current
    }
    case 'fill-color': {
      if (intent.value === '') {
        const { bgColor: _bgColor, ...rest } = current
        return rest
      }
      return { ...current, bgColor: intent.value ?? '#ffd966' }
    }
    case 'text-color': {
      if (intent.value === '') {
        const { fgColor: _fgColor, ...rest } = current
        return rest
      }
      return { ...current, fgColor: intent.value ?? '#000000' }
    }
    case 'number-format':
      return { ...current, numberFormat: numberFormatForValue(intent.value) }
    case 'alignment':
      return {
        ...current,
        align: intent.value === 'center' || intent.value === 'right' ? intent.value : 'left',
      }
    case 'vertical-alignment':
      return {
        ...current,
        verticalAlign:
          intent.value === 'top' || intent.value === 'center' ? intent.value : 'bottom',
      }
    case 'font-family': {
      if (intent.value) return { ...current, fontFamily: intent.value }
      const { fontFamily: _fontFamily, ...rest } = current
      return rest
    }
    case 'font-size': {
      const parsed = intent.value ? Number(intent.value) : NaN
      return Number.isFinite(parsed)
        ? {
            ...current,
            fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(parsed))),
          }
        : current
    }
    case 'font-size-up':
      return {
        ...current,
        fontSize: Math.min(FONT_SIZE_MAX, (current.fontSize ?? DEFAULT_FONT_SIZE) + 1),
      }
    case 'font-size-down':
      return {
        ...current,
        fontSize: Math.max(FONT_SIZE_MIN, (current.fontSize ?? DEFAULT_FONT_SIZE) - 1),
      }
    case 'border': {
      if (intent.value === 'none') {
        const next = { ...current }
        delete next.borders
        return next
      }
      const spec = { style: BORDER_DEFAULT_STYLE }
      return { ...current, borders: { top: spec, right: spec, bottom: spec, left: spec } }
    }
    default:
      return current
  }
}

export function rangeCellCount(range: CellRange): number {
  return range.rowEnd < range.rowStart || range.colEnd < range.colStart
    ? 0
    : (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}
