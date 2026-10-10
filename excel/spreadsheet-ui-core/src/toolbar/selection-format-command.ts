import { atom } from '@einfach/core'
import type { SpreadsheetBorders, SpreadsheetCellFormat } from '../backend'
import { activeCellFormatAtom, projectionSnapshotAtom } from '../projection'
import {
  runSelectionMutationAtom,
  type SelectionMutationOutcome,
} from './selection-mutation-command'
import { selectionSnapshotAtom } from '../selection'
import { nextNumberFormat, type NumberFormatAction } from './number-format-action'

export {
  SELECTION_PERCENT_FORMAT,
  SELECTION_CURRENCY_FORMAT,
  SELECTION_THOUSANDS_FORMAT,
} from './number-format-action'

export const SELECTION_TEXT_COLOR = '#c00000'
export const SELECTION_FILL_COLOR = '#fff2cc'
export const SELECTION_BORDER_COLOR = '#7f7f7f'

const SELECTION_BORDER_SPEC = Object.freeze({
  style: 'thin' as const,
  color: SELECTION_BORDER_COLOR,
})

export const SELECTION_ALL_BORDERS = Object.freeze({
  top: SELECTION_BORDER_SPEC,
  right: SELECTION_BORDER_SPEC,
  bottom: SELECTION_BORDER_SPEC,
  left: SELECTION_BORDER_SPEC,
}) satisfies SpreadsheetBorders

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

/** 明确选择目标值，不依赖当前格循环推导下一档。 */
export type TextLayoutAction =
  | { readonly type: 'horizontal-alignment'; readonly value: 'default' | 'left' | 'center' | 'right' }
  | { readonly type: 'vertical-alignment'; readonly value: 'default' | 'top' | 'center' | 'bottom' }
  | { readonly type: 'text-rotation'; readonly value: number | 'vertical' }

export type SelectionFormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'text-color'
  | 'fill-color'
  | 'all-borders'
  | 'wrap-text'
  | 'increase-indent'
  | 'decrease-indent'
  | NumberFormatAction
  | { readonly type: 'font-family'; readonly value: string }
  | { readonly type: 'font-size'; readonly value: number }
  | { readonly type: 'fill-color'; readonly value: string | null }
  | { readonly type: 'text-color'; readonly value: string | null }
  | TextLayoutAction

export type ApplySelectionFormatOutcome = SelectionMutationOutcome

function nextPatch(
  current: SpreadsheetCellFormat,
  action: SelectionFormatAction,
  numericValue: number | undefined,
): {
  format: SpreadsheetCellFormat
  clearFormatFields?: readonly (keyof SpreadsheetCellFormat)[]
} | null {
  if (typeof action !== 'string') {
    if (action.type === 'horizontal-alignment') {
      return ['default', 'left', 'center', 'right'].includes(action.value)
        ? { format: { align: action.value } } : null
    }
    if (action.type === 'vertical-alignment') {
      // Rust 的枚举字段用 default 覆盖继承值；null 代表不修改，不能用于恢复默认。
      return ['default', 'top', 'center', 'bottom'].includes(action.value)
        ? { format: { verticalAlign: action.value } } : null
    }
    if (action.type === 'text-rotation') {
      return action.value === 'vertical' ||
        (Number.isInteger(action.value) && action.value >= -90 && action.value <= 90)
        ? { format: { rotation: action.value } } : null
    }
    if (action.type === 'fill-color' || action.type === 'text-color') {
      const field = action.type === 'fill-color' ? 'bgColor' : 'fgColor'
      // null 是清除此字段，不把白色/黑色冒充“无填充/自动”；仍由 Rust 处理继承覆盖。
      if (action.value === null) return { format: {}, clearFormatFields: [field] }
      const color = action.value.trim()
      return /^#[\da-f]{6}$/i.test(color) ? { format: { [field]: color.toLowerCase() } } : null
    }
    if (action.type === 'font-family') {
      const fontFamily = action.value.trim()
      return fontFamily && fontFamily.length <= 100 ? { format: { fontFamily } } : null
    }
    return Number.isInteger(action.value) && action.value > 0 && action.value <= 512
      ? { format: { fontSize: action.value } }
      : null
  }
  if (
    action === 'bold' ||
    action === 'italic' ||
    action === 'underline' ||
    action === 'strikethrough'
  ) {
    return { format: { [action]: !current[action] } }
  }
  if (action === 'wrap-text') {
    return { format: { wrap: !current.wrap } }
  }
  if (action === 'text-color') {
    return current.fgColor === SELECTION_TEXT_COLOR
      ? { format: {}, clearFormatFields: ['fgColor'] }
      : { format: { fgColor: SELECTION_TEXT_COLOR } }
  }
  if (action === 'fill-color') {
    return current.bgColor === SELECTION_FILL_COLOR
      ? { format: {}, clearFormatFields: ['bgColor'] }
      : { format: { bgColor: SELECTION_FILL_COLOR } }
  }
  if (action === 'all-borders') {
    const enabled = BORDER_SIDES.every((side) => {
      const border = current.borders?.[side]
      return border?.style === 'thin' && border.color === SELECTION_BORDER_COLOR
    })
    return enabled
      ? { format: {}, clearFormatFields: ['borders'] }
      : { format: { borders: SELECTION_ALL_BORDERS } }
  }
  if (action === 'increase-indent') {
    return { format: { indent: Math.min((current.indent ?? 0) + 1, 15) } }
  }
  if (action === 'decrease-indent') {
    return { format: { indent: Math.max((current.indent ?? 0) - 1, 0) } }
  }
  if (
    action === 'percent-format' ||
    action === 'currency-format' ||
    action === 'thousands-format' ||
    action === 'general-format' ||
    action === 'date-format' ||
    action === 'increase-decimal' ||
    action === 'decrease-decimal'
  ) {
    const numberFormat = nextNumberFormat(current.numberFormat, action, numericValue)
    return numberFormat ? { format: { numberFormat } } : null
  }
  return null
}

/** 格式规则先产生 patch，再复用区域写入命令。 */
export const applySelectionFormatAtom = atom(
  null,
  (get, set, action: SelectionFormatAction): Promise<ApplySelectionFormatOutcome> => {
    const selection = get(selectionSnapshotAtom)
    const activeCell = get(projectionSnapshotAtom).result?.cells.find(
      (cell) => cell.row === selection.activeCell.row && cell.col === selection.activeCell.col,
    )
    const patch = nextPatch(get(activeCellFormatAtom), action, activeCell?.numericValue)
    return patch
      ? set(runSelectionMutationAtom, { kind: 'format', ...patch })
      : Promise.resolve('blocked')
  },
)
applySelectionFormatAtom.debugLabel = 'spreadsheet.toolbar.applySelectionFormat'
