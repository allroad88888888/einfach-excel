import { atom } from '@einfach/core'
import type { SpreadsheetNumberFormat } from '../backend'
import { toA1 } from '../backend'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeCellFormatAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import {
  selectionAuthorityWitnessAtom, selectionSnapshotAtom, type SelectionAuthorityWitness,
} from '../selection'
import { runSelectionMutationAtom } from './selection-mutation-command'

type Category = 'number' | 'percent' | 'currency' | 'scientific' | 'fraction' | 'time' | 'date' | 'text'
export const NUMBER_FORMAT_TIME_PATTERNS = [
  'h:mm', 'hh:mm', 'h:mm:ss', 'hh:mm:ss', 'h:mm AM/PM', 'h:mm:ss AM/PM', 'mm:ss', '[h]:mm:ss',
] as const
export const NUMBER_FORMAT_DATE_PATTERNS = [
  'yyyy-mm-dd', 'yyyy/m/d', 'dd/mm/yyyy', 'mm/dd/yyyy', 'dd-mmm-yy',
  'mmmm d, yyyy', 'dddd, mmmm d, yyyy',
] as const
export const NUMBER_FORMAT_FRACTIONS = ['one-digit', 'two-digit', 'three-digit', '2', '4', '8', '16', '10', '100'] as const
interface NumberFormatDraft {
  category: Category
  digits: string
  thousands: boolean
  symbol: string
  denominator: string
  pattern: string
  datePattern: string
}
interface NumberFormatPanel {
  draft: NumberFormatDraft
  target: {
    witness: SelectionAuthorityWitness
    connection: RustWorkbookConnection
    sheetId: string
    addr: string
  } | null
  preview: { text: string } | { error: string } | null
  busy: boolean
  error: string | null
}
const CLOSED: NumberFormatPanel = {
  draft: { category: 'number', digits: '2', thousands: false, symbol: '$',
    denominator: 'one-digit', pattern: 'hh:mm:ss', datePattern: 'yyyy-mm-dd' },
  target: null, preview: null, busy: false, error: null,
}
const PREVIEW_UNAVAILABLE = 'Preview unavailable. Change a setting to try again.'

/** 只存弹窗草稿；已应用格式与数值始终来自 Rust。 */
export const numberFormatPanelAtom = atom<NumberFormatPanel>(CLOSED)
type Action = 'open' | 'close' | 'apply' | { type: 'draft'; patch: Partial<NumberFormatDraft> }

function fromFormat(format: SpreadsheetNumberFormat | undefined): NumberFormatDraft {
  const category = format?.kind === 'currency' || format?.kind === 'scientific' ||
    format?.kind === 'fraction' || format?.kind === 'time' || format?.kind === 'date' ||
    format?.kind === 'text' ? format.kind
    : format?.kind === 'percent' || format?.kind === 'percentage' ? 'percent' : 'number'
  return {
    category,
    digits: String((format && 'digits' in format ? format.digits : undefined) ?? (category === 'percent' ? 0 : 2)),
    thousands: !!(format && 'thousands' in format && format.thousands),
    symbol: format?.kind === 'currency' ? format.symbol ?? '$' : '$',
    denominator: String(format?.kind === 'fraction' ? format.denominator ?? 'one-digit' : 'one-digit'),
    pattern: format?.kind === 'time' ? format.pattern ?? 'hh:mm:ss' : 'hh:mm:ss',
    datePattern: format?.kind === 'date' ? format.pattern ?? 'yyyy-mm-dd' : 'yyyy-mm-dd',
  }
}

/** 预览与提交复用同一份校验和 wire 格式，不在 React 再拼一个版本。 */
function draftFormat(draft: NumberFormatDraft): SpreadsheetNumberFormat | string {
  const { category, digits: text, thousands, symbol, denominator, pattern, datePattern } = draft
  const digits = Number(text)
  if (['number', 'percent', 'currency', 'scientific'].includes(category) &&
    (!/^\d+$/.test(text) || !Number.isInteger(digits) || digits < 0 || digits > 15))
    return 'Enter a whole number of decimal places from 0 to 15.'
  if (!['number', 'percent', 'currency', 'scientific', 'fraction', 'time', 'date', 'text'].includes(category))
    return 'Choose a supported category.'
  // 空字符串表示不显示币种；符号作为普通文本交给 Rust，拒绝控制字符。
  if (category === 'currency' && (symbol.length > 16 || /[\x00-\x1f\x7f]/.test(symbol)))
    return 'Use at most 16 characters for the currency symbol, without control characters.'
  if (category === 'fraction') {
    const named = denominator === 'one-digit' || denominator === 'two-digit' || denominator === 'three-digit'
    const fixed = Number(denominator)
    if (!named && (!/^\d+$/.test(denominator) || !Number.isInteger(fixed) || fixed < 1 || fixed > 0xffff_ffff))
      return 'Use a positive whole-number denominator, at most 4294967295.'
    return { kind: 'fraction', denominator: named ? denominator : fixed }
  } else if (category === 'time') {
    if (!NUMBER_FORMAT_TIME_PATTERNS.some((value) => value === pattern))
      return 'Choose one of the supported time formats.'
    return { kind: 'time', pattern }
  } else if (category === 'date') {
    if (!NUMBER_FORMAT_DATE_PATTERNS.some((value) => value === datePattern))
      return 'Choose one of the supported date formats.'
    return { kind: 'date', pattern: datePattern }
  } else if (category === 'text') return { kind: 'text' }
  return category === 'number' ? { kind: 'number', digits, thousands }
    : category === 'currency' ? { kind: 'currency', digits, symbol } : { kind: category, digits }
}

/** 设置一次提交整个 numberFormat 字段；草稿变化只请求原生预览。 */
export const runNumberFormatPanelAtom = atom(null, async (get, set, action: Action) => {
  const state = get(numberFormatPanelAtom)
  if (state.busy) return false
  if (action === 'close') {
    set(numberFormatPanelAtom, CLOSED)
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  const fail = (error: string) => {
    set(numberFormatPanelAtom, {
      ...state, busy: false, error,
      preview: state.preview ?? { error: PREVIEW_UNAVAILABLE },
    })
    return false
  }
  if (action !== 'open') {
    if (!state.target) return false
    if (connection !== state.target.connection ||
      get(selectionAuthorityWitnessAtom) !== state.target.witness)
      return fail('The selection or workbook changed. Close this dialog and select the target again.')
    if (get(editingSessionAtom).source) return fail('Finish editing the cell before applying a format.')
  }
  if (action === 'open' || typeof action === 'object') {
    if (!connection || get(editingSessionAtom).source) return false
    const selection = get(selectionSnapshotAtom)
    const target = action === 'open' ? {
      connection, witness: get(selectionAuthorityWitnessAtom), sheetId: selection.selection.sheetId,
      addr: toA1(selection.activeCell.row, selection.activeCell.col),
    } : state.target!
    const pending: NumberFormatPanel = {
      ...CLOSED, target, draft: action === 'open'
        ? fromFormat(get(activeCellFormatAtom).numberFormat) : { ...state.draft, ...action.patch },
    }
    set(numberFormatPanelAtom, pending)
    const numberFormat = draftFormat(pending.draft)
    let preview: NonNullable<NumberFormatPanel['preview']>
    if (typeof numberFormat === 'string') preview = { error: numberFormat }
    else {
      try {
        const response = connection.request('format.preview', {
          sheetId: target.sheetId, addr: target.addr, numberFormat,
        })
        // 异步 command 首次让出后发布草稿，不能等网络返回才打开弹窗。
        await Promise.resolve()
        if (get(numberFormatPanelAtom) === pending) set(numberFormatPanelAtom, pending)
        const text = await response
        preview = { text }
      } catch {
        preview = { error: PREVIEW_UNAVAILABLE }
      }
    }
    // 草稿／关闭／提交都会换对象。旧响应不得覆盖新草稿或正在提交的等待态。
    if (get(numberFormatPanelAtom) !== pending) return true
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(selectionAuthorityWitnessAtom) !== target.witness)
      preview = { error: 'The selection or workbook changed. Close this dialog and select the target again.' }
    set(numberFormatPanelAtom, { ...pending, preview })
    return true
  }
  const numberFormat = draftFormat(state.draft)
  if (typeof numberFormat === 'string') return fail(numberFormat)
  const pending = { ...state, busy: true, error: null }
  set(numberFormatPanelAtom, pending)
  const response = set(runSelectionMutationAtom, { kind: 'format', format: { numberFormat } })
  // 先发布等待态，不能等 Worker 完成才通知表单禁用。
  await Promise.resolve()
  if (get(numberFormatPanelAtom) === pending) set(numberFormatPanelAtom, pending)
  const outcome = await response
  if (get(numberFormatPanelAtom) !== pending) return false
  if (get(rustWorkbookConnectionAtom) !== connection) {
    set(numberFormatPanelAtom, CLOSED)
    return false
  }
  if (outcome !== 'completed' && outcome !== 'superseded')
    return fail(outcome === 'blocked'
      ? 'Select an editable range and wait for the worksheet to finish loading.'
      : 'Could not confirm the number format. Check the cells before retrying.')
  set(numberFormatPanelAtom, CLOSED)
  return true
})
