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
import {
  workbookDocumentAtom,
  publishWorkbookSheetStructureAtom,
} from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { historyProjectionRequest } from '../rust-workbook/history-apply'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import type { RustHistoryState } from './rust-history-types'
import type { RustWorkbookSheet } from '../rust-workbook/commands'

const EMPTY: RustHistoryState = { undoCount: 0, redoCount: 0, entries: [], notice: null }
/** 直接读取 Rust 投影里的历史目录，不维护另一份 JS 撤销栈。 */
export const rustHistoryStateAtom = atom((get): RustHistoryState => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' ? (result.history ?? EMPTY) : EMPTY
})
rustHistoryStateAtom.debugLabel = 'spreadsheet.history.rustState'

export const rustHistoryPanelAtom = atom({ open: false, busy: false, error: null as string | null })
rustHistoryPanelAtom.debugLabel = 'spreadsheet.history.panel'

/** 撤销/重做只调用 Rust；当前表被移除才切到相邻表。 */
export const runRustHistoryAtom = atom(
  null,
  async (get, set, action: 'undo' | 'redo' | 'open' | 'close'): Promise<boolean> => {
    const panel = get(rustHistoryPanelAtom)
    if (panel.busy) return false
    if (action === 'open' || action === 'close') {
      set(rustHistoryPanelAtom, { ...panel, open: action === 'open', error: null })
      return true
    }
    if (
      get(editingSessionAtom).source !== null ||
      get(sheetTabsAtom).mutation ||
      get(systemClipboardFeedbackAtom).busy
    )
      return false
    const state = get(rustHistoryStateAtom)
    const entry = state.entries[action === 'undo' ? state.undoCount - 1 : state.undoCount]
    const connection = get(rustWorkbookConnectionAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (!connection || !entry || visible?.kind !== 'visible-window') return false
    const workbook = get(workbookDocumentAtom)
    const sheet = workbook.sheets.find((s) =>
      entry.sheetKey ? s.key === entry.sheetKey : s.index === entry.sheetIndex,
    )
    if (!sheet && !entry.sheetChange) return false
    const fail = (error: string) => {
      set(rustHistoryPanelAtom, { ...panel, busy: false, error })
      return false
    }
    const affected = entry.affectedSheets ?? [entry.sheetIndex]
    if (
      entry.sheetChange
        ? workbook.sheets.some(
            (candidate) =>
              getSheetProtection(get(sheetProtectionAtom), candidate.id).mode === 'protected',
          )
        : affected.some((index) => {
            const target = workbook.sheets.find((candidate) => candidate.index === index)
            return (
              !target ||
              getSheetProtection(get(sheetProtectionAtom), target.id).mode === 'protected'
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
      if (entry.sheetChange && !result.sheets?.length)
        throw new Error('Rust returned no worksheet structure.')
      if (
        result.sheets &&
        (!entry.sheetChange ||
          !validHistorySheets(workbook.sheets, result.sheets, entry.sheetKey, result.sheetId))
      ) {
        throw new Error('Rust returned mismatched worksheet identities.')
      }
      const request = result.sheets
        ? historyProjectionRequest(
            projection,
            result.sheets,
            workbook.sheets.find((s) => s.id === visible.sheetId)!.index,
          )
        : projection
      if (
        (sheet && result.sheetId !== sheet.id) ||
        !validateProjectionResult(result.projection, { request }).ok
      )
        throw new Error('Rust returned a mismatched history result.')
      if (result.sheets) {
        set(publishWorkbookSheetStructureAtom, result.sheets)
        if (request.sheetId !== visible.sheetId) {
          const next = get(workbookDocumentAtom).sheets.find((s) => s.id === request.sheetId)!
          set(activateWorkbookSheetAtom, next)
        }
      }
      if (!entry.sheetChange || result.sheets?.some((candidate) => candidate.id === result.sheetId))
        applyProjectionSizes(get, set, {
          ...result.projection,
          sheetId: result.sheetId,
          window: result.range,
          ...result.sizes,
        })
      set(applyVisibleProjectionAtom, { witness, request, result: result.projection })
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

function validHistorySheets(
  before: readonly RustWorkbookSheet[],
  after: readonly RustWorkbookSheet[],
  targetKey: string | undefined,
  targetId: string,
): boolean {
  if (
    new Set(after.map((sheet) => sheet.id)).size !== after.length ||
    new Set(after.map((sheet) => sheet.key)).size !== after.length
  )
    return false
  if (
    before.some((sheet) => !after.some((next) => next.id === sheet.id) && sheet.key !== targetKey)
  )
    return false
  return after.every((sheet, index) => {
    const previous = before.find((old) => old.id === sheet.id)
    return (
      sheet.index === index &&
      !!sheet.key &&
      Number.isSafeInteger(sheet.rowCount) &&
      (sheet.rowCount ?? 0) > 0 &&
      (sheet.rowCount ?? 0) <= 1_048_576 &&
      Number.isSafeInteger(sheet.colCount) &&
      (sheet.colCount ?? 0) > 0 &&
      (sheet.colCount ?? 0) <= 16_384 &&
      (previous
        ? previous.key === sheet.key &&
          previous.rowCount === sheet.rowCount &&
          previous.colCount === sheet.colCount
        : sheet.key === targetKey && sheet.id === targetId)
    )
  })
}
