import { atom } from '@einfach/core'
import { editingSessionAtom, startEditingAtom } from '../editing/session-atoms'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { selectionVisibilityFeedbackAtom } from '../toolbar/selection-visibility-command'
import { selectionSizePanelAtom } from '../toolbar/selection-size-command'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { projectionSnapshotAtom } from '../projection'
import {
  selectCellAtom, selectionAuthorityWitnessAtom, selectionRegionsAtom, selectionSnapshotAtom,
} from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import type { QuickFormula } from '../rust-workbook/quick-formula-commands'

export type { QuickFormula } from '../rust-workbook/quick-formula-commands'
const feedbackAtom = atom<{ busy: boolean; error: string | null }>({ busy: false, error: null })
export const quickFormulaFeedbackAtom = atom((get) => get(feedbackAtom))
const canStartAtom = atom((get) => Boolean(
  get(rustWorkbookConnectionAtom) && get(activeWorkbookSheetAtom) &&
  !get(editingSessionAtom).source && !get(activeEditingCommitTicketAtom) &&
  !get(sheetTabsAtom).mutation && !get(systemClipboardFeedbackAtom).busy &&
  !get(rustHistoryPanelAtom).busy && !get(selectionStructureFeedbackAtom).busy &&
  !get(selectionMergeFeedbackAtom).busy && !get(selectionVisibilityFeedbackAtom).busy &&
  !get(selectionSizePanelAtom).busy,
))
export const quickFormulaAvailableAtom = atom((get) => get(canStartAtom) && !get(feedbackAtom).busy)

/** 原生负责范围推断；这里只把只读建议交给已有编辑会话，确认/撤销仍走单格编辑。 */
export const runQuickFormulaAtom = atom(null, async (get, set, functionName: QuickFormula) => {
  if (!get(quickFormulaAvailableAtom)) return false
  const connection = get(rustWorkbookConnectionAtom)!
  const sheet = get(activeWorkbookSheetAtom)!
  const selection = get(selectionSnapshotAtom)
  const authority = get(selectionAuthorityWitnessAtom)
  const fail = (error: string) => { set(feedbackAtom, { busy: false, error }); return false }
  if (get(selectionRegionsAtom).length !== 1 ||
    !['cell', 'range'].includes(selection.selection.kind) || selection.selection.sheetId !== sheet.id)
    return fail('Select one continuous cell range for a quick formula.')
  if (!['sum', 'average', 'count'].includes(functionName)) return fail('Choose SUM, AVERAGE or COUNT.')
  const pending = { busy: true, error: null }
  set(feedbackAtom, pending)
  try {
    const response = connection.request('formula.suggest', {
      sheetId: sheet.id, range: selection.range, function: functionName,
    })
    // 异步命令离开当前 atom 写入批次后发布 pending，确保 DOM 收到禁用状态。
    await Promise.resolve()
    set(feedbackAtom, pending)
    const result = await response
    // 只读请求期间用户可以继续导航；迟到的建议不能抢回选区或替换新草稿。
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    if (!get(canStartAtom) || get(activeWorkbookSheetAtom) !== sheet ||
      get(selectionAuthorityWitnessAtom) !== authority)
      return fail('The selection or worksheet changed. Choose the quick formula again.')
    const { target, input } = result
    // 滚动/工具栏换行产生的新投影不等于数据变化，只拒绝落后于当前 Rust 版本的建议。
    const revision = get(projectionSnapshotAtom).result?.revision
    if (!target || !Number.isSafeInteger(target.row) || !Number.isSafeInteger(target.col) ||
      target.row < 0 || target.col < 0 ||
      target.row >= sheet.rowCount || target.col >= sheet.colCount ||
      typeof input !== 'string' || !input.startsWith(`=${functionName.toUpperCase()}(`) ||
      !Number.isSafeInteger(result.revision) || result.revision < 0 ||
      (typeof revision === 'number' && result.revision < revision))
      return fail('Rust returned an invalid quick formula suggestion.')
    const permission = set(resolveContentMutationAtom, {
      kind: 'set-cell-input', sheetId: sheet.id, cell: target,
    })
    if (permission.status !== 'allowed') return fail(permission.diagnostic.message)
    set(selectCellAtom, { sheetId: sheet.id, coord: target })
    set(scrollToCellAtom, { coord: target, rowAlign: 'nearest', colAlign: 'nearest' })
    set(startEditingAtom, { sheetId: sheet.id, cell: target, draft: input, source: 'formula-bar' })
    set(feedbackAtom, { busy: false, error: null })
    return true
  } catch (cause) {
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    return fail(cause instanceof Error ? cause.message : String(cause))
  } finally {
    if (get(feedbackAtom) === pending) set(feedbackAtom, { busy: false, error: null })
  }
})
