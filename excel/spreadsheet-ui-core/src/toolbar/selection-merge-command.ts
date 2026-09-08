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
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { selectionStructureFeedbackAtom } from './selection-structure-state'
import { selectionVisibilityFeedbackAtom } from './selection-visibility-command'
import { selectionSizePanelAtom } from './selection-size-command'
import { selectionMergeFeedbackAtom } from './selection-merge-state'

export type SelectionMergeAction = 'merge' | 'center' | 'unmerge' | 'confirm' | 'cancel'

/** 三种合并动作共用一个原生命令；只有用户确认后才允许 Rust 删除其它格内容。 */
export const runSelectionMergeAtom = atom(
  null,
  async (get, set, action: SelectionMergeAction): Promise<boolean> => {
    const state = get(selectionMergeFeedbackAtom)
    if (state.busy) return false
    if (action === 'cancel') {
      set(selectionMergeFeedbackAtom, { busy: false, error: null, pending: null })
      return true
    }
    if (
      get(editingSessionAtom).source !== null ||
      get(rustHistoryPanelAtom).busy ||
      get(sheetTabsAtom).mutation ||
      get(systemClipboardFeedbackAtom).busy ||
      get(selectionStructureFeedbackAtom).busy ||
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
      selection.selection.sheetId !== sheet.id ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== sheet.id
    )
      return false
    const fail = (error: string) => {
      set(selectionMergeFeedbackAtom, { busy: false, error, pending: null })
      return false
    }
    if (get(selectionRegionsAtom).length !== 1)
      return fail('Select one continuous range to merge cells.')
    if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
      return fail('Unprotect the worksheet before merging cells.')
    const pending = state.pending
    if (
      action === 'confirm' &&
      (!pending ||
        pending.sheetId !== sheet.id ||
        pending.sheetKey !== sheet.key ||
        Object.entries(pending.range).some(
          ([key, value]) => selection.range[key as keyof typeof selection.range] !== value,
        ))
    )
      return fail('The selection changed. Choose Merge again.')
    const operation = action === 'confirm' ? pending!.action : action
    const range = { ...selection.range }
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      requestId,
      window: visible.window,
      reason: 'toolbar',
    })
    const busy = { ...state, busy: true, error: null }
    set(selectionMergeFeedbackAtom, busy)
    try {
      const response = connection.request('range.merge', {
        sheetId: sheet.id,
        range,
        action: operation,
        discard: action === 'confirm',
        projection,
      })
      await Promise.resolve()
      set(selectionMergeFeedbackAtom, busy)
      const result = await response
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        !validateProjectionResult(result.projection, { request: projection }).ok ||
        !result.projection.mergedRanges
      )
        throw new Error('Rust returned a mismatched merge result.')
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(selectionMergeFeedbackAtom, { busy: false, error: null, pending: null })
      return true
    } catch (cause) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      const error = cause instanceof Error ? cause.message : String(cause)
      if (error === 'MERGE_CONTENT_CONFIRMATION_REQUIRED' && operation !== 'unmerge') {
        set(selectionMergeFeedbackAtom, {
          busy: false,
          error: null,
          pending: { sheetId: sheet.id, sheetKey: sheet.key, range, action: operation },
        })
        return false
      }
      return fail(error)
    } finally {
      const current = get(selectionMergeFeedbackAtom)
      if (current.busy) set(selectionMergeFeedbackAtom, { ...current, busy: false })
    }
  },
)
runSelectionMergeAtom.debugLabel = 'spreadsheet.merge.runSelection'
