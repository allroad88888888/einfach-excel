import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
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
import { workbookDocumentAtom } from '../runtime/workbook-document'
import type { RustHistoryState } from './rust-history-types'

const EMPTY: RustHistoryState = { undoCount: 0, redoCount: 0, entries: [], notice: null }
/** 直接读取 Rust 投影里的历史目录，不维护另一份 JS 撤销栈。 */
export const rustHistoryStateAtom = atom((get): RustHistoryState => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' ? (result.history ?? EMPTY) : EMPTY
})
rustHistoryStateAtom.debugLabel = 'spreadsheet.history.rustState'

export const rustHistoryPanelAtom = atom({ open: false, busy: false, error: null as string | null })
rustHistoryPanelAtom.debugLabel = 'spreadsheet.history.panel'

/** 撤销/重做只调用 Rust；当前工作表不跳走，跨表依赖结果同样会刷新。 */
export const runRustHistoryAtom = atom(
  null,
  async (get, set, action: 'undo' | 'redo' | 'open' | 'close'): Promise<boolean> => {
    const panel = get(rustHistoryPanelAtom)
    if (panel.busy) return false
    if (action === 'open' || action === 'close') {
      set(rustHistoryPanelAtom, { ...panel, open: action === 'open', error: null })
      return true
    }
    if (get(editingSessionAtom).source !== null) return false
    const state = get(rustHistoryStateAtom)
    const entry = state.entries[action === 'undo' ? state.undoCount - 1 : state.undoCount]
    const connection = get(rustWorkbookConnectionAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (!connection || !entry || visible?.kind !== 'visible-window') return false
    const sheet = get(workbookDocumentAtom).sheets.find((s) => s.index === entry.sheetIndex)
    if (!sheet) return false
    const fail = (error: string) => {
      set(rustHistoryPanelAtom, { ...panel, busy: false, error })
      return false
    }
    const affected = entry.affectedSheets ?? [entry.sheetIndex]
    const workbook = get(workbookDocumentAtom)
    if (
      affected.some((index) => {
        const target = workbook.sheets.find((candidate) => candidate.index === index)
        return (
          !target || getSheetProtection(get(sheetProtectionAtom), target.id).mode === 'protected'
        )
      })
    )
      return fail('Unprotect the affected worksheet before undoing or redoing.')
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      requestId,
      reason: 'toolbar',
    })
    set(rustHistoryPanelAtom, { ...panel, busy: true, error: null })
    try {
      const result = await connection.request('history.apply', { direction: action, projection })
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      if (
        result.sheetId !== sheet.id ||
        !validateProjectionResult(result.projection, { request: projection }).ok
      )
        throw new Error('Rust returned a mismatched history result.')
      applyProjectionSizes(get, set, {
        ...result.projection,
        sheetId: result.sheetId,
        window: result.range,
        ...result.sizes,
      })
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(rustHistoryPanelAtom, { ...panel, busy: false, error: null })
      return true
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      return fail(error instanceof Error ? error.message : String(error))
    } finally {
      if (get(rustHistoryPanelAtom).busy)
        set(rustHistoryPanelAtom, { open: false, busy: false, error: null })
    }
  },
)
runRustHistoryAtom.debugLabel = 'spreadsheet.history.runRust'
