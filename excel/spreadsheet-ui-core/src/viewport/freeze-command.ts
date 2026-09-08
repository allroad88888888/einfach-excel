import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { selectionVisibilityFeedbackAtom } from '../toolbar/selection-visibility-command'
import { selectionSizePanelAtom } from '../toolbar/selection-size-command'

export type FreezeAction = 'first-row' | 'first-column' | 'selection' | 'unfreeze'
export const freezeFeedbackAtom = atom({ busy: false, error: null as string | null })
freezeFeedbackAtom.debugLabel = 'spreadsheet.viewport.freezeFeedback'

/** 三个入口只改 Rust 的两个计数；不写单元格，不再发第二次投影刷新。 */
export const runFreezeAtom = atom(
  null,
  async (get, set, action: FreezeAction): Promise<boolean> => {
    if (!['first-row', 'first-column', 'selection', 'unfreeze'].includes(action)) return false
    if (
      get(freezeFeedbackAtom).busy ||
      get(editingSessionAtom).source !== null ||
      get(rustHistoryPanelAtom).busy ||
      get(sheetTabsAtom).mutation ||
      get(systemClipboardFeedbackAtom).busy ||
      get(selectionStructureFeedbackAtom).busy ||
      get(selectionMergeFeedbackAtom).busy ||
      get(selectionVisibilityFeedbackAtom).busy ||
      get(selectionSizePanelAtom).busy
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
      witness.status !== 'ready' ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== sheet.id ||
      selection.selection.sheetId !== sheet.id
    )
      return false
    const rows = action === 'first-row' ? 1 : action === 'selection' ? selection.activeCell.row : 0
    const cols =
      action === 'first-column' ? 1 : action === 'selection' ? selection.activeCell.col : 0
    const fail = (error: string) => {
      set(freezeFeedbackAtom, { busy: false, error })
      return false
    }
    if (rows >= sheet.rowCount || cols >= sheet.colCount)
      return fail('Keep at least one scrollable row and column.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    const busy = { busy: true, error: null }
    set(freezeFeedbackAtom, busy)
    try {
      const pending = connection.request('sheet.freeze', {
        sheetId: sheet.id,
        rows,
        cols,
        projection,
      })
      await Promise.resolve()
      set(freezeFeedbackAtom, busy)
      const result = await pending
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        !validateProjectionResult(result.projection, { request: projection }).ok ||
        result.projection.freeze?.rows !== rows ||
        result.projection.freeze.cols !== cols
      )
        throw new Error('Rust returned a mismatched freeze result.')
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(freezeFeedbackAtom, { busy: false, error: null })
      return true
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(freezeFeedbackAtom).busy) set(freezeFeedbackAtom, { busy: false, error: null })
    }
  },
)
runFreezeAtom.debugLabel = 'spreadsheet.viewport.runFreeze'
