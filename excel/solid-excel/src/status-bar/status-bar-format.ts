import type {
  CellCoord,
  CellRange,
  KeyboardMode,
  SelectionState,
  StatusBarAggregateKey,
  StatusBarInputMode,
} from '@einfach/spreadsheet-ui-core'
import type { useT } from '../i18n'

/** Pure text formatting for the status bar — no Solid, no DOM, no atoms. */

export type StatusBarTranslate = ReturnType<typeof useT>

export function getColumnLabel(index: number): string {
  let value = index + 1
  let label = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }

  return label
}

export function toA1(cell: CellCoord): string {
  return `${getColumnLabel(cell.col)}${cell.row + 1}`
}

/**
 * The status bar's single address readout. A one-cell selection renders the
 * cell itself, so there is nothing left to duplicate — the separate
 * "active cell" segment that used to sit beside this one printed the exact
 * same string for every single-cell selection. The active cell of a *range*
 * still has a home: the Name Box left of the formula bar.
 */
export function formatRange(
  selection: SelectionState,
  range: CellRange,
  t: StatusBarTranslate,
): string {
  switch (selection.kind) {
    case 'cell':
      return toA1(selection.focus)
    case 'range':
      return `${toA1({ row: range.rowStart, col: range.colStart })}:${toA1({
        row: range.rowEnd,
        col: range.colEnd,
      })}`
    case 'row':
      return `${range.rowStart + 1}:${range.rowEnd + 1}`
    case 'column':
      return `${getColumnLabel(range.colStart)}:${getColumnLabel(range.colEnd)}`
    case 'all':
      return t('status.selection.all')
    default:
      return ''
  }
}

export const AGGREGATE_LABEL_KEYS: Record<StatusBarAggregateKey, string> = {
  sum: 'status.aggregate.sum',
  average: 'status.aggregate.average',
  count: 'status.aggregate.count',
  numericCount: 'status.aggregate.numericCount',
  min: 'status.aggregate.min',
  max: 'status.aggregate.max',
}

export const AGGREGATE_ORDER: readonly StatusBarAggregateKey[] = [
  'sum',
  'average',
  'count',
  'numericCount',
  'min',
  'max',
]

export function formatAggregateValue(key: StatusBarAggregateKey, value: number): string {
  if (key === 'count' || key === 'numericCount') {
    return String(value)
  }
  if (!Number.isFinite(value)) {
    return '0'
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  // Excel-standard: round to 2 decimal places then trim trailing zeros.
  // 180.357143 -> "180.36", 1.5 -> "1.5", 1.234 -> "1.23".
  return value.toFixed(2).replace(/\.?0+$/, '')
}

export const KEYBOARD_MODE_TO_BADGE: Record<KeyboardMode, StatusBarInputMode> = {
  navigation: 'ready',
  editing: 'edit',
  'formula-reference': 'point',
}

export const INPUT_MODE_LABEL_KEY: Record<StatusBarInputMode, string> = {
  ready: 'status.inputMode.ready',
  edit: 'status.inputMode.edit',
  enter: 'status.inputMode.enter',
  point: 'status.inputMode.point',
}
