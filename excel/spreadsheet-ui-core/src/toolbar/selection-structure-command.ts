import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import {
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import {
  activeWorkbookSheetAtom,
} from '../runtime/workbook-document'
import {
  structureSheet,
  structureProjectionRequest,
  type StructureAction,
} from '../rust-workbook/structure-geometry'
import { publishStructureProjection } from '../rust-workbook/structure-projection'
import { selectionSnapshotAtom } from '../selection'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { recordRepeatIntentAtom } from '../repeat/state'
import { selectionStructureFeedbackAtom } from './selection-structure-state'
import { selectionMergeFeedbackAtom } from './selection-merge-state'
import { selectionVisibilityFeedbackAtom } from './selection-visibility-command'
import { selectionSizePanelAtom } from './selection-size-command'

/** 一次插删只请求 Rust 一次；这里计算画布数量，不移动任何单元格数据。 */
export const runSelectionStructureAtom = atom(
  null,
  async (get, set, action: StructureAction): Promise<boolean> => {
    if (
      get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy ||
      get(editingSessionAtom).source !== null ||
      get(rustHistoryPanelAtom).busy ||
      get(sheetTabsAtom).mutation ||
      get(systemClipboardFeedbackAtom).busy ||
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
      set(selectionStructureFeedbackAtom, { busy: false, error })
      return false
    }
    // 与 Rust 一致：只锁被编辑工作表的几何；勾选对应保护权限时放行。
    const protection = getSheetProtection(get(sheetProtectionAtom), sheet.id)
    const allowedByPermission =
      action === 'insert-rows'
        ? Boolean(protection.permissions?.insertRows)
        : action === 'insert-columns'
          ? Boolean(protection.permissions?.insertColumns)
          : action === 'delete-rows'
            ? Boolean(protection.permissions?.deleteRows)
            : Boolean(protection.permissions?.deleteColumns)
    if (protection.mode === 'protected' && !allowedByPermission)
      return fail('Unprotect the worksheet before inserting or deleting rows and columns.')
    try {
      const rows = action.endsWith('rows')
      const range = selection.range
      const edit = {
        action,
        at: rows ? range.rowStart : range.colStart,
        count: rows ? range.rowEnd - range.rowStart + 1 : range.colEnd - range.colStart + 1,
      }
      const expected = structureSheet(sheet, edit)
      const requestId = set(issueProjectionRequestIdAtom)
      if (requestId === null) return false
      const projection = createVisibleProjectionRequest({
        sheetId: sheet.id,
        requestId,
        window: visible.window,
        viewport: visible.viewport,
        reason: 'toolbar',
      })
      structureProjectionRequest(projection, expected)
      const busy = { busy: true, error: null }
      set(selectionStructureFeedbackAtom, busy)
      const pending = connection.request('sheet.editStructure', {
        sheetId: sheet.id,
        edit,
        projection,
      })
      await Promise.resolve()
      set(selectionStructureFeedbackAtom, busy)
      const result = await pending
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      publishStructureProjection(get, set, { before: sheet, expected, projection, witness, result })
      set(selectionStructureFeedbackAtom, { busy: false, error: null })
      set(recordRepeatIntentAtom, { kind: 'structure', action })
      return true
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(selectionStructureFeedbackAtom).busy)
        set(selectionStructureFeedbackAtom, { busy: false, error: null })
    }
  },
)
runSelectionStructureAtom.debugLabel = 'spreadsheet.structure.runSelection'
