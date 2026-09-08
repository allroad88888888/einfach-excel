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
import { applyProjectionSizes } from '../projection/projection-sizes'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import {
  activeWorkbookSheetAtom,
  publishWorkbookSheetAtom,
  syncWorkbookCanvasAtom,
  workbookDocumentAtom,
} from '../runtime/workbook-document'
import {
  structureSheet,
  structureProjectionRequest,
  structureSizeRange,
  type StructureAction,
} from '../rust-workbook/structure-geometry'
import { selectionSnapshotAtom } from '../selection'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { validSheetVisibility, applySheetVisibility } from '../viewport/hidden-state'
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
    // 插删会改写跨表公式；保护能力尚未由原生统一管理，不能绕开受保护的引用表。
    if (
      get(workbookDocumentAtom).sheets.some(
        (item) => getSheetProtection(get(sheetProtectionAtom), item.id).mode === 'protected',
      )
    )
      return fail('Unprotect the worksheets before inserting or deleting rows and columns.')
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
      const request = structureProjectionRequest(projection, expected)
      const sizeRange = structureSizeRange(sheet, expected)
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
      if (
        result.sheet.id !== expected.id ||
        result.sheet.key !== expected.key ||
        result.sheet.index !== expected.index ||
        result.sheet.name !== expected.name ||
        result.sheet.rowCount !== expected.rowCount ||
        result.sheet.colCount !== expected.colCount ||
        !validateProjectionResult(result.projection, { request }).ok ||
        !validSheetVisibility(result.projection.visibility) ||
        Object.entries(sizeRange).some(
          ([key, value]) => result.range[key as keyof typeof sizeRange] !== value,
        )
      )
        throw new Error('Rust returned a mismatched structural result.')
      applyProjectionSizes(get, set, {
        ...result.projection,
        window: result.range,
        ...result.sizes,
      })
      applySheetVisibility(get, set, sheet.id, result.projection.visibility!)
      set(publishWorkbookSheetAtom, { ...sheet, ...result.sheet })
      set(applyVisibleProjectionAtom, { witness, request, result: result.projection })
      set(syncWorkbookCanvasAtom)
      set(selectionStructureFeedbackAtom, { busy: false, error: null })
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
