import type {
  CellCoord,
  CellRange,
  ClipboardIntent,
  KeyboardMode,
  MenuCommandIntent,
  ProjectionSnapshot,
  SelectionState,
  StatusBarAggregateKey,
  StatusBarInputMode,
  StatusBarViewMode,
  ToolbarIntent,
} from '@einfach/spreadsheet-ui-core'
import type { useT } from '../../src/i18n'

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

export function countRange(range: CellRange): number {
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) {
    return 0
  }

  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}

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

export function formatProjectionStatus(
  snapshot: ProjectionSnapshot,
  t: StatusBarTranslate,
): string {
  switch (snapshot.status) {
    case 'idle':
      return t('status.projection.idle')
    case 'loading':
      return t('status.projection.loading')
    case 'ready':
      return t('status.projection.ready')
    case 'error':
      return snapshot.error?.message ?? t('status.projection.error')
    default:
      return t('status.projection.unknown')
  }
}

export function formatVisibleWindow(
  snapshot: ProjectionSnapshot,
  fallbackWindow: CellRange,
  t: StatusBarTranslate,
): string {
  const window =
    snapshot.result?.kind === 'visible-window' ? snapshot.result.window : fallbackWindow
  return t('status.visibleCells', { count: countRange(window) })
}

export function formatLoadedValues(snapshot: ProjectionSnapshot, t: StatusBarTranslate): string {
  const loaded = snapshot.result?.cells.length ?? 0
  return t('status.loadedValues', { count: loaded })
}

export function formatToolbarIntent(
  intent: ToolbarIntent | null,
  t: StatusBarTranslate,
): string | null {
  if (intent?.type === 'toolbar.format.command') {
    return t('status.lastCommand.toolbar', { command: intent.command })
  }

  if (intent?.type === 'toolbar.surface.open') {
    return t('status.lastCommand.toolbar', { command: intent.surface.id })
  }

  return null
}

export function formatMenuIntent(
  intent: MenuCommandIntent | null,
  t: StatusBarTranslate,
): string | null {
  if (!intent) {
    return null
  }

  return t('status.lastCommand.menu', { command: intent.command })
}

export function formatClipboardIntent(
  intent: ClipboardIntent | null,
  t: StatusBarTranslate,
): string | null {
  if (!intent) return null
  switch (intent.type) {
    case 'clipboard.copy':
      return t('status.lastCommand.clipboardCopy')
    case 'clipboard.cut':
      return t('status.lastCommand.clipboardCut')
    case 'clipboard.paste':
      return t('status.lastCommand.clipboardPaste')
    default:
      return null
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

export const VIEW_MODE_BUTTONS: ReadonlyArray<{ value: StatusBarViewMode; label: string }> = [
  { value: 'normal', label: 'status.viewMode.normal' },
  { value: 'page-break-preview', label: 'status.viewMode.pageBreak' },
  { value: 'page-layout', label: 'status.viewMode.pageLayout' },
]
