import { atom } from '@einfach/core'
import type { CellValueRule, FormulaRule, TopBottomRule, NativeConditionalFormatRule } from './types'
import { editingSessionAtom } from '../editing/session-atoms'
import { parseA1Cell, parseA1Range, rangeToA1 } from '../name-box'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest, issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { ConditionalFormatChange } from '../rust-workbook/conditional-format-commands'

interface Panel {
  sheetId: string | null
  connection: RustWorkbookConnection | null
  ruleId?: string
  revision: number
  priority: number
  range: string
  rule: NativeConditionalFormatRule
  busy: boolean
  error: string
}
const CLOSED: Panel = {
  sheetId: null, connection: null, revision: 0, priority: 0, range: '', busy: false, error: '',
  rule: { kind: 'cell-value', operator: 'gt', value: '', format: { bgColor: '#ffc7ce', fgColor: '#9c0006' } },
}
/** 唯一持久目录来自原生投影；这个 atom 仅保存对话框草稿。 */
export const nativeConditionalFormatPanelAtom = atom<Panel>(CLOSED)
export const nativeConditionalFormatsAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  const config = result?.kind === 'visible-window' && result.sheetId === get(activeWorkbookSheetAtom)?.id
    ? result.conditionalFormats : undefined
  // 列表顺序直接反映 Rust 的优先级；不保存第二份可写目录。
  return config && { ...config, rules: [...config.rules].sort((a, b) => a.priority - b.priority) }
})
type Action = 'open' | 'close' | 'new' | 'save'
  | { type: 'kind'; kind: NativeConditionalFormatRule['kind'] }
  | { type: 'edit'; id: string }
  | { type: 'remove' | 'duplicate' | 'enable' | 'disable' | 'move-up' | 'move-down'; id: string }
  | { type: 'draft'; range?: string; rule?: Partial<Omit<CellValueRule, 'kind'> & Omit<FormulaRule, 'kind'> & Omit<TopBottomRule, 'kind'>> }

/** 一个入口负责草稿与提交；规则判断不进入 TS，复用现有可见投影发布。 */
export const runNativeConditionalFormatAtom = atom(null, async (
  get, set, action: Action,
): Promise<boolean> => {
  const state = get(nativeConditionalFormatPanelAtom)
  if (state.busy) return false
  if (action === 'close') { set(nativeConditionalFormatPanelAtom, CLOSED); return true }
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  const config = get(nativeConditionalFormatsAtom)
  if (!sheet || !connection || !config) return false
  const fail = (error: string) => {
    set(nativeConditionalFormatPanelAtom, { ...state, busy: false, error })
    return false
  }
  if (action === 'open' || action === 'new') {
    if (get(editingSessionAtom).source) return false
    set(nativeConditionalFormatPanelAtom, {
      ...CLOSED, sheetId: sheet.id, connection, revision: config.revision,
      // 新规则位于最高优先级，不重编号其它规则。
      priority: Math.min(0, ...config.rules.map((rule) => rule.priority)) - 1,
      range: get(selectionRegionsAtom).length === 1 ? rangeToA1(get(selectionSnapshotAtom).range) : '',
      error: get(selectionRegionsAtom).length === 1 ? '' : 'Choose one continuous range.',
    })
    return true
  }
  if (state.sheetId !== sheet.id || state.connection !== connection)
    return fail('The workbook or worksheet changed. Close and reopen Conditional formatting.')
  if (typeof action === 'object' && action.type === 'kind') {
    const common = { format: { ...state.rule.format },
      ...(state.rule.enabled === undefined ? {} : { enabled: state.rule.enabled }) }
    // 换种类从新草稿开始，不能把 operator/value 等旧字段混进公式或排名规则。
    const rule: NativeConditionalFormatRule = action.kind === 'formula'
      ? { ...common, kind: 'formula', formula: '' }
      : action.kind === 'top-bottom'
        ? { ...common, kind: 'top-bottom', direction: 'top', count: 10, percent: false }
        : { ...common, kind: 'cell-value', operator: 'gt', value: '' }
    set(nativeConditionalFormatPanelAtom, { ...state, rule, error: '' })
    return true
  }
  if (typeof action === 'object' && action.type === 'draft') {
    set(nativeConditionalFormatPanelAtom, { ...state, error: '',
      ...(action.range === undefined ? {} : { range: action.range }),
      rule: { ...state.rule, ...action.rule },
    })
    return true
  }
  if (typeof action === 'object' && action.type === 'edit') {
    const entry = config.rules.find((rule) => rule.id === action.id)
    if (!entry || (entry.rule.kind !== 'cell-value' && entry.rule.kind !== 'formula' && entry.rule.kind !== 'top-bottom'))
      return fail('This rule type cannot be edited here yet.')
    set(nativeConditionalFormatPanelAtom, { ...state, error: '', ruleId: entry.id,
      rule: { ...entry.rule, format: { ...entry.rule.format } }, priority: entry.priority,
      range: rangeToA1(entry.scope.range), revision: config.revision,
    })
    return true
  }
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy)
    return fail('Finish the current edit or history operation first.')
  if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
    return fail('Unprotect the worksheet before changing conditional formatting.')
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (visible?.kind !== 'visible-window' || visible.sheetId !== sheet.id)
    return fail('Wait for the worksheet to finish loading.')
  let change: ConditionalFormatChange
  if (typeof action === 'object') {
    if (!config.rules.some((rule) => rule.id === action.id))
      return fail('The rule no longer exists.')
    change = { action: action.type, ruleId: action.id, revision: config.revision }
  } else {
    const cell = parseA1Cell(state.range)
    const range = parseA1Range(state.range) ?? (cell
      ? { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col } : null)
    if (!range || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount)
      return fail('Enter a cell or range inside this worksheet, for example A1:A100.')
    let rule = state.rule
    if (rule.kind === 'cell-value' && rule.operator !== 'between' && rule.operator !== 'not-between') {
      const { value2: _unused, ...single } = rule
      rule = single
    }
    change = { action: 'set', revision: state.revision, ruleId: state.ruleId,
      scope: { range }, priority: state.priority,
      rule }
  }
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  const pendingState = { ...state, busy: true, error: '' }
  set(nativeConditionalFormatPanelAtom, pendingState)
  try {
    const pending = connection.request('conditionalFormat.change', {
      ...change, sheetId: sheet.id, projection,
    })
    await Promise.resolve()
    if (get(nativeConditionalFormatPanelAtom) === pendingState)
      set(nativeConditionalFormatPanelAtom, pendingState)
    const result = await pending
    if (get(rustWorkbookConnectionAtom) !== connection) {
      set(nativeConditionalFormatPanelAtom, CLOSED)
      return false
    }
    if (!validateProjectionResult(result.projection, { request: projection }).ok ||
      !result.projection.conditionalFormats)
      throw new Error('Rust returned a mismatched conditional-format result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(nativeConditionalFormatPanelAtom, CLOSED)
    return true
  } catch (error) {
    if (get(rustWorkbookConnectionAtom) !== connection) {
      set(nativeConditionalFormatPanelAtom, CLOSED)
      return false
    }
    return fail(error instanceof Error ? error.message : String(error))
  }
})
