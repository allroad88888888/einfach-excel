import { atom } from '@einfach/core'
import type { NativeDataValidationOperator, NativeDataValidationRule } from './native-rule'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { parseA1Cell, parseA1Range, rangeToA1 } from '../name-box/address'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest, issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'

interface Draft {
  range: string
  kind: NativeDataValidationRule['kind']
  operator: NativeDataValidationOperator
  min: string
  max: string
  items: string
  ignoreBlank: boolean
}
interface Panel extends Draft {
  sheetId: string | null
  connection: RustWorkbookConnection | null
  busy: boolean
  error: string
}
const CLOSED: Panel = { sheetId: null, connection: null, busy: false, error: '',
  range: '', kind: 'whole-number', operator: 'between', min: '0', max: '100', items: '', ignoreBlank: true }
/** 只保留表单草稿；已有规则每次打开时向 Rust 读取。 */
export const nativeDataValidationPanelAtom = atom<Panel>(CLOSED)

export const runNativeDataValidationAtom = atom(null, async (get, set,
  action: 'open' | 'close' | 'save' | 'clear' | Partial<Draft>,
): Promise<boolean> => {
  const state = get(nativeDataValidationPanelAtom)
  if (action === 'close') {
    if (state.busy) return false
    set(nativeDataValidationPanelAtom, CLOSED)
    return true
  }
  if (state.busy) return false
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return false
  const fail = (error: unknown) => {
    // 旧 Worker 的失败与成功一样不能泄漏到新工作簿。
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id) {
      const current = get(nativeDataValidationPanelAtom)
      if (current.connection === connection && current.sheetId === sheet.id)
        set(nativeDataValidationPanelAtom, CLOSED)
      return false
    }
    set(nativeDataValidationPanelAtom, { ...get(nativeDataValidationPanelAtom), busy: false,
      error: error instanceof Error ? error.message : String(error) })
    return false
  }
  if (action === 'open') {
    if (get(editingSessionAtom).source) return false
    const selection = get(selectionSnapshotAtom)
    const pending = { ...CLOSED, sheetId: sheet.id, connection, busy: true,
      range: get(selectionRegionsAtom).length === 1 ? rangeToA1(selection.range) : '' }
    set(nativeDataValidationPanelAtom, pending)
    try {
      const rule = await connection.request('validation.read', { sheetId: sheet.id,
        row: selection.activeCell.row, col: selection.activeCell.col })
      if (get(nativeDataValidationPanelAtom) !== pending ||
        get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== sheet.id) {
        if (get(nativeDataValidationPanelAtom) === pending)
          set(nativeDataValidationPanelAtom, CLOSED)
        return false
      }
      set(nativeDataValidationPanelAtom, { ...pending, busy: false,
        ...(rule ? { kind: rule.kind, ignoreBlank: rule.ignoreBlank,
          ...(rule.kind === 'list' ? { items: rule.items.join('\n') }
            : { min: String(rule.min), max: String(rule.max), operator: rule.operator ?? 'between' }) } : {}),
        error: pending.range ? '' : 'Choose one continuous range.',
      })
      return true
    } catch (error) { return fail(error) }
  }
  if (state.sheetId !== sheet.id || state.connection !== connection)
    return fail('The workbook changed. Close and reopen Data validation.')
  if (typeof action === 'object') {
    // 类型变化仅重置表单边界，不在 UI Core 把日期换算成工作簿数值。
    const defaults = action.kind && action.kind !== state.kind
      ? action.kind === 'date' ? { min: '1900-01-01', max: '9999-12-31' }
        : action.kind === 'time' ? { min: '00:00', max: '23:59:59' }
          : { min: '0', max: action.kind === 'decimal' ? '1' : '100' }
      : {}
    set(nativeDataValidationPanelAtom, { ...state, ...defaults, ...action, error: '' })
    return true
  }
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy)
    return fail('Finish the current edit or history operation first.')
  if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
    return fail('Unprotect the worksheet before changing data validation.')
  const cell = parseA1Cell(state.range)
  const range = parseA1Range(state.range) ?? (cell
    ? { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col } : null)
  if (!range || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount)
    return fail('Enter a cell or range inside this worksheet, for example A1:A100.')
  const twoBounds = state.operator === 'between' || state.operator === 'not-between'
  if (action === 'save' && state.kind !== 'list' && (!state.min.trim() || (twoBounds && !state.max.trim())))
    return fail(twoBounds ? 'Enter both minimum and maximum.' : 'Enter the comparison value.')
  // 单值条件只提交可见输入，不让隐藏的旧 maximum 参与规则定义。
  const max = twoBounds ? state.max : state.min
  const comparison = state.operator === 'between' ? {} : { operator: state.operator }
  const rule: NativeDataValidationRule | null = action === 'clear' ? null
    : state.kind === 'list' ? { kind: 'list', items: state.items.split(/\r?\n/),
      ignoreBlank: state.ignoreBlank }
      : state.kind === 'date' || state.kind === 'time'
        ? { kind: state.kind, min: state.min, max, ...comparison, ignoreBlank: state.ignoreBlank }
      : { kind: state.kind, min: Number(state.min), max: Number(max), ...comparison,
        ignoreBlank: state.ignoreBlank }
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (visible?.kind !== 'visible-window' || visible.sheetId !== sheet.id)
    return fail('Wait for the worksheet to finish loading.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  set(nativeDataValidationPanelAtom, { ...state, busy: true, error: '' })
  try {
    const result = await connection.request('validation.change', {
      sheetId: sheet.id, range, rule, projection })
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id) {
      set(nativeDataValidationPanelAtom, CLOSED)
      return false
    }
    if (!validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched data-validation result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(nativeDataValidationPanelAtom, CLOSED)
    return true
  } catch (error) { return fail(error) }
})
