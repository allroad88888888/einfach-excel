import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import type { DisplayCell, ProjectionRequestId, RangeProjectionRequest } from '../backend/types'
import type { HistoryProducerReservation } from '../history'
import type { SelectionAuthorityWitness } from '../selection'
import { getFilterHiddenRowsForSheet, viewportFilterHiddenAtom } from '../viewport/effective-hidden'
import type { WorkspaceActiveSheetAuthorityWitness } from '../workspace'
import { findDuplicateRows } from './algorithm'
import { EMPTY_CELLS, EMPTY_KEY_COLUMNS, immutableReadonlySet, lifecycleFor, snapshotScanResult } from './domain'
import type { RemoveDuplicatesCapabilityState, RemoveDuplicatesComparison, RemoveDuplicatesControllerPort, RemoveDuplicatesLifecycleState, RemoveDuplicatesMutationTarget, RemoveDuplicatesRange, RemoveDuplicatesScanResult, RemoveDuplicatesSessionSnapshot, RemoveRowsExactRequest, RemoveRowsExactResult } from './types'

export interface RemoveDuplicatesReadTicket { readonly sessionId: number; readonly requestId: ProjectionRequestId; readonly sheetId: string; readonly range: Readonly<{ rowStart: number; rowEnd: number; colStart: number; colEnd: number }>; readonly selectionWitness: SelectionAuthorityWitness; readonly workspaceActiveSheetWitness: WorkspaceActiveSheetAuthorityWitness; readonly source: RemoveDuplicatesControllerPort; readonly execute: NonNullable<RemoveDuplicatesControllerPort['readRangeProjection']>; readonly request: Readonly<RangeProjectionRequest>; readonly timeoutMs: number }
export interface RemoveDuplicatesMutationTicket { readonly sessionId: number; readonly selectionWitness: SelectionAuthorityWitness; readonly workspaceActiveSheetWitness: WorkspaceActiveSheetAuthorityWitness; readonly target: RemoveDuplicatesMutationTarget; readonly request: RemoveRowsExactRequest; readonly historyReservation: HistoryProducerReservation; readonly acknowledgement: RemoveRowsExactResult | null; readonly source: RemoveDuplicatesControllerPort; readonly execute: NonNullable<RemoveDuplicatesControllerPort['removeRowsExact']>; readonly refreshProjection: (sheetId: string) => Promise<void>; readonly timeoutMs: number; readonly readRequestId: ProjectionRequestId | null }

const INITIAL_CAPABILITY: RemoveDuplicatesCapabilityState = Object.freeze({ canRead: false, canRemove: false })
const INITIAL_LIFECYCLE: RemoveDuplicatesLifecycleState = Object.freeze({ status: 'closed', sessionId: 0, readRequestId: null, mutationRequestId: null, sheetId: null })
export const removeDuplicatesOpenStateAtom = atom(false)
export const removeDuplicatesRangeStateAtom = atom<RemoveDuplicatesRange | null>(null)
export const removeDuplicatesCellsStateAtom = atom<readonly DisplayCell[]>(EMPTY_CELLS)
export const removeDuplicatesKeyColumnsStateAtom = atom<ReadonlySet<number>>(EMPTY_KEY_COLUMNS)
export const removeDuplicatesComparisonStateAtom = atom<RemoveDuplicatesComparison>('exact')
export const removeDuplicatesExcludeHeaderStateAtom = atom(true)
export const removeDuplicatesSessionSequenceStateAtom = atom(0)
export const removeDuplicatesReadSequenceStateAtom = atom(0)
export const removeDuplicatesMutationSequenceStateAtom = atom(0)
export const removeDuplicatesSessionStateAtom = atom<RemoveDuplicatesSessionSnapshot | null>(null)
export const removeDuplicatesLifecycleStateAtom = atom<RemoveDuplicatesLifecycleState>(INITIAL_LIFECYCLE)
export const removeDuplicatesCapabilityStateAtom = atom<RemoveDuplicatesCapabilityState>(INITIAL_CAPABILITY)
export const removeDuplicatesErrorStateAtom = atom('')
export const activeRemoveDuplicatesReadAtom = atom<RemoveDuplicatesReadTicket | null>(null)
export const activeRemoveDuplicatesMutationAtom = atom<RemoveDuplicatesMutationTicket | null>(null)

export const removeDuplicatesOpenAtom: Atom<boolean> = atom((get) => get(removeDuplicatesOpenStateAtom))
export const removeDuplicatesRangeAtom: Atom<RemoveDuplicatesRange | null> = atom((get) => get(removeDuplicatesRangeStateAtom))
export const removeDuplicatesScanInputCellsAtom: Atom<readonly DisplayCell[]> = atom((get) => get(removeDuplicatesCellsStateAtom))
export const removeDuplicatesKeyColumnsAtom: Atom<ReadonlySet<number>> = atom((get) => get(removeDuplicatesKeyColumnsStateAtom))
export const removeDuplicatesComparisonAtom: Atom<RemoveDuplicatesComparison> = atom((get) => get(removeDuplicatesComparisonStateAtom))
export const removeDuplicatesExcludeHeaderAtom: Atom<boolean> = atom((get) => get(removeDuplicatesExcludeHeaderStateAtom))
export const removeDuplicatesSessionAtom: Atom<RemoveDuplicatesSessionSnapshot | null> = atom((get) => get(removeDuplicatesSessionStateAtom))
export const removeDuplicatesLifecycleAtom: Atom<RemoveDuplicatesLifecycleState> = atom((get) => get(removeDuplicatesLifecycleStateAtom))
export const removeDuplicatesCapabilityAtom: Atom<RemoveDuplicatesCapabilityState> = atom((get) => get(removeDuplicatesCapabilityStateAtom))
export const removeDuplicatesErrorAtom: Atom<string> = atom((get) => get(removeDuplicatesErrorStateAtom))
export const removeDuplicatesSessionIdAtom: Atom<number> = atom((get) => get(removeDuplicatesSessionSequenceStateAtom))
export const removeDuplicatesReadRequestIdAtom: Atom<number> = atom((get) => get(removeDuplicatesReadSequenceStateAtom))
export const removeDuplicatesMutationRequestIdAtom: Atom<number> = atom((get) => get(removeDuplicatesMutationSequenceStateAtom))
export const removeDuplicatesMutationTargetAtom: Atom<RemoveDuplicatesMutationTarget | null> = atom((get) => get(activeRemoveDuplicatesMutationAtom)?.target ?? null)

export const removeDuplicatesPreviewAtom: Atom<RemoveDuplicatesScanResult | null> = atom((get) => {
  if (!get(removeDuplicatesOpenAtom)) return null
  const range = get(removeDuplicatesRangeAtom)
  if (range === null) return null
  const keyColumns = get(removeDuplicatesKeyColumnsAtom); const excludeHeader = get(removeDuplicatesExcludeHeaderAtom)
  const ignoredColumns: number[] = []; let inRangeCount = 0
  for (const col of keyColumns) { if (col >= range.startCol && col <= range.endCol) inRangeCount += 1; else ignoredColumns.push(col) }
  ignoredColumns.sort((left, right) => left - right)
  if (inRangeCount === 0) return snapshotScanResult({ duplicateRows: [], scannedRows: 0, uniqueRows: 0, ignoredColumns, headerRow: excludeHeader && range.startRow <= range.endRow ? range.startRow : null, noKeyColumns: true })
  const sheetId = get(removeDuplicatesLifecycleAtom).sheetId
  const hiddenRows = sheetId === null ? [] : getFilterHiddenRowsForSheet(get(viewportFilterHiddenAtom), sheetId)
  return snapshotScanResult(findDuplicateRows({ cells: get(removeDuplicatesScanInputCellsAtom), range, keyColumns, comparison: get(removeDuplicatesComparisonAtom), excludeHeader, hiddenRows }))
})

function blocksClose(status: RemoveDuplicatesLifecycleState['status']): boolean { return status === 'mutation-pending' || status === 'local-acknowledged' || status === 'refreshing' || status === 'refresh-failed' || status === 'outcome-unknown' }
export const removeDuplicatesCanEditAtom = atom((get) => get(removeDuplicatesOpenAtom) && get(removeDuplicatesLifecycleAtom).status === 'editing' && get(activeRemoveDuplicatesMutationAtom) === null)
export const removeDuplicatesCanCloseAtom = atom((get) => get(removeDuplicatesOpenAtom) && get(activeRemoveDuplicatesMutationAtom) === null && !blocksClose(get(removeDuplicatesLifecycleAtom).status))
export const removeDuplicatesCanRetryReadAtom = atom((get) => { const status = get(removeDuplicatesLifecycleAtom).status; return status === 'read-stale' || status === 'read-failed' })
export const removeDuplicatesBusyAtom = atom((get) => { const status = get(removeDuplicatesLifecycleAtom).status; return status === 'read-pending' || status === 'mutation-pending' || status === 'local-acknowledged' || status === 'refreshing' })
export const removeDuplicatesCanConfirmAtom = atom((get) => { const lifecycle = get(removeDuplicatesLifecycleAtom); const active = get(activeRemoveDuplicatesMutationAtom); if (lifecycle.status === 'refresh-failed' && active !== null && active.acknowledgement !== null && active.sessionId === lifecycle.sessionId) return true; if (lifecycle.status !== 'editing' || active !== null || get(removeDuplicatesSessionAtom) === null || !get(removeDuplicatesCapabilityAtom).canRemove) return false; const preview = get(removeDuplicatesPreviewAtom); return preview !== null && !preview.noKeyColumns && preview.duplicateRows.length > 0 })

for (const [state, label] of [[removeDuplicatesOpenStateAtom, 'open.state'], [removeDuplicatesRangeStateAtom, 'range.state'], [removeDuplicatesCellsStateAtom, 'cells.state'], [removeDuplicatesKeyColumnsStateAtom, 'keyColumns.state'], [removeDuplicatesComparisonStateAtom, 'comparison.state'], [removeDuplicatesExcludeHeaderStateAtom, 'excludeHeader.state'], [removeDuplicatesSessionStateAtom, 'session.state'], [removeDuplicatesLifecycleStateAtom, 'lifecycle.state'], [activeRemoveDuplicatesReadAtom, 'activeRead'], [activeRemoveDuplicatesMutationAtom, 'activeMutation']] as const) state.debugLabel = `spreadsheet.removeDuplicates.${label}`
for (const [state, label] of [[removeDuplicatesOpenAtom, 'open'], [removeDuplicatesRangeAtom, 'range'], [removeDuplicatesScanInputCellsAtom, 'scanInputCells'], [removeDuplicatesKeyColumnsAtom, 'keyColumns'], [removeDuplicatesComparisonAtom, 'comparison'], [removeDuplicatesExcludeHeaderAtom, 'excludeHeader'], [removeDuplicatesSessionAtom, 'session'], [removeDuplicatesLifecycleAtom, 'lifecycle'], [removeDuplicatesCapabilityAtom, 'capability'], [removeDuplicatesErrorAtom, 'error'], [removeDuplicatesPreviewAtom, 'preview']] as const) state.debugLabel = `spreadsheet.removeDuplicates.${label}`

export { EMPTY_CELLS, EMPTY_KEY_COLUMNS, blocksClose, immutableReadonlySet, lifecycleFor }
