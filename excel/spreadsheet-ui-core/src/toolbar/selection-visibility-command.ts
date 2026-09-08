import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom, selectCellAtom, selectionAuthorityWitnessAtom } from '../selection'
import { sheetProtectionAtom, getSheetProtection } from '../protection'
import { scrollToCellAtom } from '../viewport/metrics'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { validSheetVisibility } from '../viewport/hidden-state'
import { validateProjectionResult } from '../projection/contracts'
import { selectionStructureFeedbackAtom } from './selection-structure-state'
import { selectionMergeFeedbackAtom } from './selection-merge-state'

export const selectionVisibilityFeedbackAtom = atom({ busy: false, error: null as string | null })
export type SelectionVisibilityAction = 'hide-rows' | 'hide-columns' | 'unhide' | 'unhide-all'

/** 一次隐藏手势只发一个原生命令；Rust 确认后才更新显示与选择位置。 */
export const runSelectionVisibilityAtom = atom(
  null,
  async (get, set, action: SelectionVisibilityAction): Promise<boolean> => {
    if (
      get(selectionVisibilityFeedbackAtom).busy ||
      get(editingSessionAtom).source !== null ||
      get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy
    )
      return false
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    const selection = get(selectionSnapshotAtom)
    const selectionAuthority = get(selectionAuthorityWitnessAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (
      !connection ||
      !sheet ||
      sheet.id !== selection.selection.sheetId ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== sheet.id
    )
      return false
    const fail = (error: string) => {
      set(selectionVisibilityFeedbackAtom, { busy: false, error })
      return false
    }
    if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
      return fail('Unprotect the worksheet before hiding or showing rows and columns.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: sheet.id,
      requestId,
      window: visible.window,
      viewport: visible.viewport,
      reason: 'toolbar',
    })
    const busy = { busy: true, error: null }
    set(selectionVisibilityFeedbackAtom, busy)
    try {
      const pending = connection.request('range.visibility', {
        sheetId: sheet.id,
        range:
          action === 'unhide-all'
            ? { rowStart: 0, colStart: 0, rowEnd: sheet.rowCount - 1, colEnd: sheet.colCount - 1 }
            : selection.range,
        action: action === 'unhide-all' ? 'unhide' : action,
        projection,
      })
      // 异步 atom 续体负责通知 busy，不能一直等 Worker 返回才禁用菜单。
      await Promise.resolve()
      set(selectionVisibilityFeedbackAtom, busy)
      const result = await pending
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        !validateProjectionResult(result.projection, { request: projection }).ok ||
        !validSheetVisibility(result.projection.visibility)
      )
        throw new Error('Rust returned a mismatched visibility result.')
      const applied = set(applyVisibleProjectionAtom, {
        witness,
        request: projection,
        result: result.projection,
      })
      // 投影刷新会重建选区快照；只在用户实际改变选区时放弃位置修复。
      if (applied.status === 'applied' && get(selectionAuthorityWitnessAtom) === selectionAuthority) {
        const geometry = get(viewportGeometrySizesAtom)
        // 隐藏当前活动格后落到后一个可见行/列；末端则向前找，全隐藏时保留坐标供恢复。
        const nextIndex = (
          start: number,
          count: number,
          sizes: Record<string, number> | undefined,
        ) => {
          for (let index = start; index < count; index++) if (sizes?.[index] !== 0) return index
          for (let index = start - 1; index >= 0; index--) if (sizes?.[index] !== 0) return index
          return start
        }
        const current = selection.activeCell
        const coord = {
          row: nextIndex(current.row, sheet.rowCount, geometry.rowHeightsBySheet[sheet.id]),
          col: nextIndex(current.col, sheet.colCount, geometry.colWidthsBySheet[sheet.id]),
        }
        if (coord.row !== current.row || coord.col !== current.col)
          set(selectCellAtom, { sheetId: sheet.id, coord })
        set(scrollToCellAtom, { coord })
      }
      set(selectionVisibilityFeedbackAtom, { busy: false, error: null })
      return true
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(selectionVisibilityFeedbackAtom).busy)
        set(selectionVisibilityFeedbackAtom, { busy: false, error: null })
    }
  },
)
selectionVisibilityFeedbackAtom.debugLabel = 'spreadsheet.viewport.visibilityFeedback'
runSelectionVisibilityAtom.debugLabel = 'spreadsheet.viewport.runVisibility'
