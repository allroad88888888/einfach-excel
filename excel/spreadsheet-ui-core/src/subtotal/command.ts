import { atom } from '@einfach/core'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { editingSessionAtom } from '../editing/session-atoms'
import { hostControlsAtom } from '../host/state'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { createVisibleProjectionRequest, issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { structureSheetAfterEdits } from '../rust-workbook/structure-geometry'
import { publishStructureProjection } from '../rust-workbook/structure-projection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { SubtotalAction, SubtotalList } from '../rust-workbook/subtotal-commands'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import type { CellRange } from '../shared'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { selectionSizePanelAtom } from '../toolbar/selection-size-command'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionVisibilityFeedbackAtom } from '../toolbar/selection-visibility-command'

export interface SubtotalSelection {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly range: CellRange
  readonly disabled: boolean
}

export const subtotalSelectionAtom = atom((get): SubtotalSelection | null => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const selection = get(selectionSnapshotAtom)
  if (!connection || !sheet || selection.selection.sheetId !== sheet.id ||
    get(selectionRegionsAtom).length !== 1) return null
  const host = get(hostControlsAtom)
  return { connection, sheetId: sheet.id, range: selection.range,
    disabled: host.readOnly || host.busy || !host.allowSheetStructure ||
      get(editingSessionAtom).source !== null || get(selectionStructureFeedbackAtom).busy,
  }
})

export const inspectSubtotalListAtom = atom(null, async (get, _set, input: {
  readonly sheetId: string
  readonly range: CellRange
}): Promise<SubtotalList> => {
  const context = get(subtotalSelectionAtom)
  if (!context || context.sheetId !== input.sheetId) throw new Error('The worksheet changed.')
  const list = await context.connection.request('subtotal.inspect', input)
  const current = get(subtotalSelectionAtom)
  if (current?.connection !== context.connection || current.sheetId !== input.sheetId)
    throw new Error('The worksheet changed.')
  return list
})

export const changeSubtotalListAtom = atom(null, async (get, set, input: {
  readonly sheetId: string
  readonly list: SubtotalList
  readonly action: SubtotalAction
}): Promise<boolean> => {
  const context = get(subtotalSelectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  if (!context || sheet?.id !== input.sheetId || visible?.kind !== 'visible-window' ||
    visible.sheetId !== input.sheetId || witness.status !== 'ready')
    throw new Error('Wait for the worksheet to finish loading.')
  if (context.disabled || get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation || get(selectionStructureFeedbackAtom).busy ||
    get(selectionMergeFeedbackAtom).busy || get(systemClipboardFeedbackAtom).busy ||
    get(selectionVisibilityFeedbackAtom).busy || get(selectionSizePanelAtom).busy ||
    get(nativeTableFeedbackAtom).busy)
    throw new Error('Finish the current worksheet operation first.')
  if (getSheetProtection(get(sheetProtectionAtom), sheet.id).mode === 'protected')
    throw new Error('Unprotect the worksheet before inserting or deleting rows and columns.')
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) throw new Error('Could not allocate a projection request.')
  const projection = createVisibleProjectionRequest({
    sheetId: sheet.id, requestId, window: visible.window, viewport: visible.viewport, reason: 'toolbar',
  })
  const busy = { busy: true, error: null }
  set(selectionStructureFeedbackAtom, busy)
  try {
    const pending = context.connection.request('subtotal.change', {
      sheetId: input.sheetId, range: input.list.range, action: input.action,
      expectedRevision: input.list.revision, projection,
    })
    await Promise.resolve()
    if (get(subtotalSelectionAtom)?.connection === context.connection)
      set(selectionStructureFeedbackAtom, busy)
    const result = await pending
    if (get(subtotalSelectionAtom)?.connection !== context.connection)
      throw new Error('The workbook changed.')
    if (!result.changed) return false
    const expected = structureSheetAfterEdits(sheet, result.edits)
    publishStructureProjection(get, set, { before: sheet, expected, projection, witness, result })
    return true
  } finally {
    if (get(selectionStructureFeedbackAtom) === busy)
      set(selectionStructureFeedbackAtom, { busy: false, error: null })
  }
})
subtotalSelectionAtom.debugLabel = 'spreadsheet.subtotal.selection'
inspectSubtotalListAtom.debugLabel = 'spreadsheet.subtotal.inspect'
changeSubtotalListAtom.debugLabel = 'spreadsheet.subtotal.change'
