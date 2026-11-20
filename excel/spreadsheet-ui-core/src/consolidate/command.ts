import { atom, type Getter } from '@einfach/core'
import { readWorksheetReference } from '../advanced-filter/reference'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { editingSessionAtom } from '../editing/session-atoms'
import { nativeFilterFeedbackAtom } from '../filter/command'
import { hostControlsAtom } from '../host/state'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { coordToA1 } from '../name-box/address'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
  validateProjectionResult,
} from '../projection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionSnapshotAtom } from '../selection'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { sortFeedbackAtom } from '../sort/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { selectionSizePanelAtom } from '../toolbar/selection-size-command'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionVisibilityFeedbackAtom } from '../toolbar/selection-visibility-command'
import type {
  ConsolidateFunction,
  ConsolidatePreview,
  ConsolidateReport,
  ConsolidateRequest,
} from '../rust-workbook/consolidate-commands'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { CellCoord } from '../shared'

export interface ConsolidateContext {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly destination: CellCoord
  readonly destinationA1: string
  readonly busy: boolean
  readonly disabled: boolean
}

export interface ConsolidatePreviewInput {
  readonly function: ConsolidateFunction
  readonly references: readonly string[]
  readonly destination?: string
  readonly topRow: boolean
  readonly leftColumn: boolean
  readonly createLinks: boolean
}

export interface ConsolidatePreviewResult extends ConsolidatePreview {
  readonly request: ConsolidateRequest
  readonly revision: number
}

function isWorkbookBusy(get: Getter): boolean {
  return (
    get(editingSessionAtom).source !== null ||
    get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation !== null ||
    get(nativeFilterFeedbackAtom).busy ||
    get(nativeTableFeedbackAtom).busy ||
    get(selectionMergeFeedbackAtom).busy ||
    get(systemClipboardFeedbackAtom).busy ||
    get(selectionVisibilityFeedbackAtom).busy ||
    get(selectionSizePanelAtom).busy ||
    get(selectionStructureFeedbackAtom).busy ||
    get(sortFeedbackAtom).busy
  )
}

export const consolidateContextAtom = atom((get): ConsolidateContext | null => {
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return null
  const selection = get(selectionSnapshotAtom)
  const destination = selection.activeCell
  const host = get(hostControlsAtom)
  const busy = isWorkbookBusy(get)
  const ready = get(projectionSnapshotAtom).status === 'ready'
  return {
    connection,
    sheetId: sheet.id,
    destination,
    destinationA1: coordToA1(destination),
    busy,
    disabled: !ready || busy || host.readOnly || host.busy,
  }
})
consolidateContextAtom.debugLabel = 'spreadsheet.consolidate.context'

export const previewConsolidateAtom = atom(
  null,
  async (get, _set, input: ConsolidatePreviewInput): Promise<ConsolidatePreviewResult> => {
    const context = get(consolidateContextAtom)
    if (!context) throw new Error('Wait for the worksheet to finish loading.')
    if (input.references.length === 0) {
      throw new Error('Add between 1 and 32 source ranges to consolidate.')
    }
    const sources = input.references.map((text) => {
      const resolved = readWorksheetReference(get, text)
      if (!resolved) {
        throw new Error('Enter valid worksheet references for every source range.')
      }
      return resolved
    })
    let sheetId = context.sheetId
    let destination = context.destination
    if (input.destination?.trim()) {
      const parsedDest = readWorksheetReference(get, input.destination)
      if (!parsedDest) {
        throw new Error('Choose a destination cell within the worksheet.')
      }
      sheetId = parsedDest.sheetId
      destination = { row: parsedDest.range.rowStart, col: parsedDest.range.colStart }
    }
    const request: ConsolidateRequest = {
      function: input.function,
      sources,
      sheetId,
      destination,
      topRow: input.topRow,
      leftColumn: input.leftColumn,
      createLinks: input.createLinks,
    }
    const preview = await context.connection.request('consolidate.preview', request)
    if (get(rustWorkbookConnectionAtom) !== context.connection) {
      throw new Error('The workbook changed.')
    }
    return { ...preview, request }
  },
)
previewConsolidateAtom.debugLabel = 'spreadsheet.consolidate.preview'

export const applyConsolidateAtom = atom(
  null,
  async (
    get,
    set,
    input: {
      readonly preview: ConsolidatePreviewResult
      readonly confirmOverwrite: boolean
    },
  ): Promise<ConsolidateReport> => {
    const connection = get(rustWorkbookConnectionAtom)
    const activeSheet = get(activeWorkbookSheetAtom)
    const witness = get(projectionSnapshotAtom)
    const visible = witness.request
    if (
      !connection ||
      !activeSheet ||
      witness.status !== 'ready' ||
      visible?.kind !== 'visible-window' ||
      visible.sheetId !== activeSheet.id
    ) {
      throw new Error('Wait for the worksheet to finish loading.')
    }
    const host = get(hostControlsAtom)
    if (isWorkbookBusy(get) || host.busy) {
      throw new Error('Finish the current worksheet operation first.')
    }
    const { preview, confirmOverwrite } = input
    if (preview.overwrittenCells > 0 && !confirmOverwrite) {
      throw new Error('Confirm overwriting the occupied destination cells before consolidating.')
    }
    if (
      preview.request.createLinks &&
      getSheetProtection(get(sheetProtectionAtom), preview.request.sheetId).mode === 'protected'
    ) {
      throw new Error('This worksheet is protected. Unprotect it before changing locked cells.')
    }
    const permission = set(resolveContentMutationAtom, {
      kind: 'consolidate',
      sheetId: preview.request.sheetId,
      range: preview.target,
    })
    if (permission.status === 'blocked') throw new Error(permission.diagnostic.message)
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) throw new Error('Could not allocate a projection request.')
    const projection = createVisibleProjectionRequest({
      sheetId: visible.sheetId,
      window: visible.window,
      viewport: visible.viewport,
      requestId,
      reason: 'toolbar',
    })
    const result = await connection.request('consolidate.apply', {
      ...preview.request,
      expectedRevision: preview.revision,
      projection,
      ...(preview.overwrittenCells > 0
        ? { approval: { count: preview.overwrittenCells, target: preview.target } }
        : {}),
    })
    if (get(rustWorkbookConnectionAtom) !== connection) {
      throw new Error('The workbook changed.')
    }
    const validated = validateProjectionResult(result.projection, { request: projection })
    if (!validated.ok) {
      throw new Error('The data was consolidated. Refresh the worksheet before trying again.')
    }
    const applied = set(applyVisibleProjectionAtom, {
      witness,
      request: projection,
      result: result.projection,
    })
    if (applied.status === 'rejected') {
      throw new Error('The data was consolidated. Refresh the worksheet before trying again.')
    }
    return {
      target: result.target,
      changedCells: result.changedCells,
      linkedGroups: result.linkedGroups,
    }
  },
)
applyConsolidateAtom.debugLabel = 'spreadsheet.consolidate.apply'
