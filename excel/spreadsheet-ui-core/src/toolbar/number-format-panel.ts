import { atom } from '@einfach/core'
import type { SpreadsheetNumberFormat } from '../backend'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeCellFormatAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import { selectionAuthorityWitnessAtom, type SelectionAuthorityWitness } from '../selection'
import { runSelectionMutationAtom } from './selection-mutation-command'

type Category = 'number' | 'percent' | 'currency' | 'scientific' | 'fraction' | 'time'
export const NUMBER_FORMAT_TIME_PATTERNS = [
  'h:mm', 'hh:mm', 'h:mm:ss', 'hh:mm:ss', 'h:mm AM/PM', 'h:mm:ss AM/PM', 'mm:ss', '[h]:mm:ss',
] as const
export const NUMBER_FORMAT_FRACTIONS = ['one-digit', 'two-digit', 'three-digit', '2', '4', '8', '16', '10', '100'] as const
interface NumberFormatDraft {
  category: Category
  digits: string
  thousands: boolean
  symbol: string
  denominator: string
  pattern: string
}
interface NumberFormatPanel {
  draft: NumberFormatDraft
  target: { witness: SelectionAuthorityWitness; connection: RustWorkbookConnection } | null
  busy: boolean
  error: string | null
}
const CLOSED: NumberFormatPanel = {
  draft: { category: 'number', digits: '2', thousands: false, symbol: '$',
    denominator: 'one-digit', pattern: 'hh:mm:ss' },
  target: null, busy: false, error: null,
}

/** 只存弹窗草稿；已应用格式与数值始终来自 Rust。 */
export const numberFormatPanelAtom = atom<NumberFormatPanel>(CLOSED)
type Action = 'open' | 'close' | 'apply' | { type: 'draft'; patch: Partial<NumberFormatDraft> }

function fromFormat(format: SpreadsheetNumberFormat | undefined): NumberFormatDraft {
  const category = format?.kind === 'currency' || format?.kind === 'scientific' ||
    format?.kind === 'fraction' || format?.kind === 'time' ? format.kind
    : format?.kind === 'percent' || format?.kind === 'percentage' ? 'percent' : 'number'
  return {
    category,
    digits: String((format && 'digits' in format ? format.digits : undefined) ?? (category === 'percent' ? 0 : 2)),
    thousands: !!(format && 'thousands' in format && format.thousands),
    symbol: format?.kind === 'currency' ? format.symbol ?? '$' : '$',
    denominator: String(format?.kind === 'fraction' ? format.denominator ?? 'one-digit' : 'one-digit'),
    pattern: format?.kind === 'time' ? format.pattern ?? 'hh:mm:ss' : 'hh:mm:ss',
  }
}

/** 设置一次提交整个 numberFormat 字段，不修改原数值或其它样式。 */
export const runNumberFormatPanelAtom = atom(null, async (get, set, action: Action) => {
  const state = get(numberFormatPanelAtom)
  if (state.busy) return false
  if (action === 'close') {
    set(numberFormatPanelAtom, CLOSED)
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (action === 'open') {
    if (!connection || get(editingSessionAtom).source) return false
    set(numberFormatPanelAtom, {
      ...CLOSED, draft: fromFormat(get(activeCellFormatAtom).numberFormat),
      target: { connection, witness: get(selectionAuthorityWitnessAtom) },
    })
    return true
  }
  if (!state.target) return false
  if (typeof action === 'object') {
    set(numberFormatPanelAtom, {
      ...state, draft: { ...state.draft, ...action.patch }, error: null,
    })
    return true
  }
  const fail = (error: string) => {
    set(numberFormatPanelAtom, { ...state, busy: false, error })
    return false
  }
  if (connection !== state.target.connection ||
    get(selectionAuthorityWitnessAtom) !== state.target.witness)
    return fail('The selection or workbook changed. Close this dialog and select the target again.')
  if (get(editingSessionAtom).source) return fail('Finish editing the cell before applying a format.')
  const { category, digits: text, thousands, symbol, denominator, pattern } = state.draft
  const digits = Number(text)
  if (category !== 'fraction' && category !== 'time' &&
    (!/^\d+$/.test(text) || !Number.isInteger(digits) || digits < 0 || digits > 15))
    return fail('Enter a whole number of decimal places from 0 to 15.')
  if (!['number', 'percent', 'currency', 'scientific', 'fraction', 'time'].includes(category))
    return fail('Choose a supported category.')
  // 空字符串表示不显示币种；符号作为普通文本交给 Rust，拒绝控制字符。
  if (category === 'currency' && (symbol.length > 16 || /[\x00-\x1f\x7f]/.test(symbol)))
    return fail('Use at most 16 characters for the currency symbol, without control characters.')
  let numberFormat: SpreadsheetNumberFormat
  if (category === 'fraction') {
    const named = denominator === 'one-digit' || denominator === 'two-digit' || denominator === 'three-digit'
    const fixed = Number(denominator)
    if (!named && (!/^\d+$/.test(denominator) || !Number.isInteger(fixed) || fixed < 1 || fixed > 0xffff_ffff))
      return fail('Use a positive whole-number denominator, at most 4294967295.')
    numberFormat = { kind: 'fraction', denominator: named ? denominator : fixed }
  } else if (category === 'time') {
    if (!NUMBER_FORMAT_TIME_PATTERNS.some((value) => value === pattern))
      return fail('Choose one of the supported time formats.')
    numberFormat = { kind: 'time', pattern }
  } else numberFormat = category === 'number' ? { kind: 'number', digits, thousands }
    : category === 'currency' ? { kind: 'currency', digits, symbol } : { kind: category, digits }
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
