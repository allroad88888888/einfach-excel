import type { Getter, Setter } from '@einfach/core'
import type { DisplayCell, ProjectionRequestId, ProjectionRevision, RangeProjectionResult } from '../backend/types'
import { primarySelectionRegionAtom, selectionAuthorityWitnessAtom, selectionRangeAtom } from '../selection'
import type { CellRange } from '../shared'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import { REMOVE_DUPLICATES_READ_STALE_ERROR } from './constants'
import { lifecycleFor, sameRange, snapshotRange, validRange, validRevision } from './domain'
import { activeRemoveDuplicatesReadAtom, removeDuplicatesErrorStateAtom, removeDuplicatesLifecycleAtom, removeDuplicatesLifecycleStateAtom, removeDuplicatesOpenAtom } from './state'
import type { RemoveDuplicatesReadTicket } from './state'
import type { RemoveDuplicatesReadOutcome } from './types'

export function readTicketContextIsCurrent(get: Getter, ticket: RemoveDuplicatesReadTicket): boolean { const active = get(activeRemoveDuplicatesReadAtom); const lifecycle = get(removeDuplicatesLifecycleAtom); return active === ticket && get(removeDuplicatesOpenAtom) && lifecycle.status === 'read-pending' && lifecycle.sessionId === ticket.sessionId && lifecycle.readRequestId === ticket.requestId && lifecycle.sheetId === ticket.sheetId }
export function readTicketAuthorityIsCurrent(get: Getter, ticket: RemoveDuplicatesReadTicket): boolean { return get(selectionAuthorityWitnessAtom) === ticket.selectionWitness && get(workspaceActiveSheetAuthorityWitnessAtom) === ticket.workspaceActiveSheetWitness && get(primarySelectionRegionAtom).sheetId === ticket.sheetId && get(workspaceSessionAtom).activeSheetId === ticket.sheetId && sameRange(get(selectionRangeAtom), ticket.range) }
export function markReadStale(set: Setter, ticket: RemoveDuplicatesReadTicket): RemoveDuplicatesReadOutcome { set(removeDuplicatesErrorStateAtom, REMOVE_DUPLICATES_READ_STALE_ERROR); set(removeDuplicatesLifecycleStateAtom, lifecycleFor('read-stale', ticket.sessionId, ticket.sheetId, ticket.requestId)); set(activeRemoveDuplicatesReadAtom, null); return 'stale' }

interface ExactReadAcknowledgementSnapshot { readonly kind: 'range'; readonly requestId: ProjectionRequestId; readonly sheetId: string; readonly range: Readonly<CellRange>; readonly revision: ProjectionRevision; readonly truncated: boolean | undefined; readonly cells: readonly DisplayCell[] }
export type ReadAcknowledgementClassification = Readonly<{ status: 'exact'; acknowledgement: ExactReadAcknowledgementSnapshot }> | Readonly<{ status: 'stale' }> | Readonly<{ status: 'failed'; retainTicket: boolean }>
const STALE_READ_ACKNOWLEDGEMENT: ReadAcknowledgementClassification = Object.freeze({ status: 'stale' })
const FAILED_READ_ACKNOWLEDGEMENT: ReadAcknowledgementClassification = Object.freeze({ status: 'failed', retainTicket: false })
const THREW_READING_READ_ACKNOWLEDGEMENT: ReadAcknowledgementClassification = Object.freeze({ status: 'failed', retainTicket: true })
function validDisplayCellValueKind(value: unknown): value is DisplayCell['valueKind'] { return value === undefined || value === 'blank' || value === 'number' || value === 'string' || value === 'boolean' || value === 'error' }
export function classifyReadAcknowledgement(acknowledgement: unknown, ticket: RemoveDuplicatesReadTicket): ReadAcknowledgementClassification {
  try {
    if (typeof acknowledgement !== 'object' || acknowledgement === null) return FAILED_READ_ACKNOWLEDGEMENT
    const result = acknowledgement as RangeProjectionResult
    const kind = result.kind; const requestId = result.requestId; const sheetId = result.sheetId; const rangeValue = result.range; const revision = result.revision; const truncated = result.truncated; const cellsValue = result.cells
    if (typeof rangeValue !== 'object' || rangeValue === null) return FAILED_READ_ACKNOWLEDGEMENT
    const range = snapshotRange(rangeValue)
    if (kind !== 'range' || !Number.isSafeInteger(requestId) || typeof sheetId !== 'string' || !validRange(range)) return FAILED_READ_ACKNOWLEDGEMENT
    if ((truncated !== undefined && typeof truncated !== 'boolean') || truncated === true || !validRevision(revision) || !Array.isArray(cellsValue)) return FAILED_READ_ACKNOWLEDGEMENT
    const length = cellsValue.length
    if (!Number.isSafeInteger(length) || length < 0) return FAILED_READ_ACKNOWLEDGEMENT
    const cells: DisplayCell[] = []; const seenCoordinates = new Set<string>()
    for (let index = 0; index < length; index += 1) {
      const cellValue = cellsValue[index]
      if (typeof cellValue !== 'object' || cellValue === null) return FAILED_READ_ACKNOWLEDGEMENT
      const row = cellValue.row; const col = cellValue.col; const displayValue = cellValue.displayValue; const valueKind = cellValue.valueKind
      if (typeof row !== 'number' || !Number.isSafeInteger(row) || typeof col !== 'number' || !Number.isSafeInteger(col) || row < ticket.range.rowStart || row > ticket.range.rowEnd || col < ticket.range.colStart || col > ticket.range.colEnd || typeof displayValue !== 'string' || !validDisplayCellValueKind(valueKind)) return FAILED_READ_ACKNOWLEDGEMENT
      const coordinateKey = `${row}:${col}`; if (seenCoordinates.has(coordinateKey)) return FAILED_READ_ACKNOWLEDGEMENT; seenCoordinates.add(coordinateKey)
      cells.push(valueKind === undefined ? Object.freeze({ row, col, displayValue }) : Object.freeze({ row, col, displayValue, valueKind }))
    }
    if (requestId !== ticket.requestId || sheetId !== ticket.sheetId || !sameRange(range, ticket.range)) return STALE_READ_ACKNOWLEDGEMENT
    return Object.freeze({ status: 'exact', acknowledgement: Object.freeze({ kind, requestId, sheetId, range, revision, truncated, cells: Object.freeze(cells) }) })
  } catch { return THREW_READING_READ_ACKNOWLEDGEMENT }
}
