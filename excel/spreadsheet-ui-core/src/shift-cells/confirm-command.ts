import { atom } from '@einfach/core'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import type { RustShiftCellsDirection } from '../rust-workbook/shift-cells-commands'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { runSelectionStructureAtom } from '../toolbar/selection-structure-command'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { CLOSED_SHIFT_CELLS_DIALOG, shiftCellsDialogAtom, type ShiftCellsChoice } from './state'

const DIRECTIONS: Partial<Record<ShiftCellsChoice, RustShiftCellsDirection>> = {
  'shift-right': 'insert-right',
  'shift-down': 'insert-down',
  'shift-left': 'delete-left',
  'shift-up': 'delete-up',
}

/** 确认对话框：局部位移只请求一次 Rust；整行/整列复用既有行列插删命令。 */
export const confirmShiftCellsAtom = atom(null, async (get, set): Promise<boolean> => {
  const state = get(shiftCellsDialogAtom)
  if (state.mode === null || state.busy) return false
  const fail = (error: string) => {
    set(shiftCellsDialogAtom, { ...get(shiftCellsDialogAtom), busy: false, error })
    return false
  }
  if (state.choice === 'entire-row' || state.choice === 'entire-column') {
    const axis = state.choice === 'entire-row' ? 'rows' : 'columns'
    set(shiftCellsDialogAtom, CLOSED_SHIFT_CELLS_DIALOG)
    return set(runSelectionStructureAtom, `${state.mode}-${axis}`)
  }
  const direction = DIRECTIONS[state.choice]
  if (!direction || !direction.startsWith(state.mode)) return fail('Choose how to shift the cells.')
  if (
    get(editingSessionAtom).source !== null ||
    get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation ||
    get(systemClipboardFeedbackAtom).busy ||
    get(selectionStructureFeedbackAtom).busy ||
    get(selectionMergeFeedbackAtom).busy
  )
    return false
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const selection = get(selectionSnapshotAtom)
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (
    !connection ||
    !sheet ||
    selection.selection.sheetId !== sheet.id ||
    visible?.kind !== 'visible-window' ||
    visible.sheetId !== sheet.id
  )
    return fail('Wait for the worksheet to finish loading.')
  if (get(selectionRegionsAtom).length !== 1)
    return fail('Select one continuous range to insert or delete cells.')
  // 与行列插删一致：只要求目标工作表未受保护。
  if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
    return fail('Unprotect the worksheet before inserting or deleting cells.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return fail('Could not allocate a projection request.')
  const projection = createVisibleProjectionRequest({
    sheetId: sheet.id,
    requestId,
    window: visible.window,
    viewport: visible.viewport,
    reason: 'toolbar',
  })
  const busy = { ...state, busy: true, error: null }
  set(shiftCellsDialogAtom, busy)
  try {
    const response = connection.request('range.shiftCells', {
      sheetId: sheet.id,
      range: { ...selection.range },
      direction,
      projection,
    })
    await Promise.resolve()
    if (get(shiftCellsDialogAtom) === busy) set(shiftCellsDialogAtom, busy)
    const result = await response
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    if (!validateProjectionResult(result.projection, { request: projection }).ok)
      throw new Error('Rust returned a mismatched insert or delete cells result.')
    set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(shiftCellsDialogAtom, CLOSED_SHIFT_CELLS_DIALOG)
    return true
  } catch (cause) {
    if (get(rustWorkbookConnectionAtom) !== connection) return false
    return fail(cause instanceof Error ? cause.message : String(cause))
  }
})
confirmShiftCellsAtom.debugLabel = 'spreadsheet.shiftCells.confirm'
