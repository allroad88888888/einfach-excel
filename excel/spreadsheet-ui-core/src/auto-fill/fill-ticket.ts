import { atom, type Getter, type Setter } from '@einfach/core'
import type { ProjectionRevision, RangeProjectionResult } from '../backend/types'
import { filterSortStateAtom } from '../filter-sort'
import {
  releaseHistoryProducerReservationAtom,
  type HistoryEntryRecorder,
  type HistoryProducerReservation,
} from '../history'
import {
  primarySelectionRegionAtom,
  selectionAuthorityWitnessAtom,
  selectionRangeAtom,
  type SelectionAuthorityWitness,
} from '../selection'
import type { CellRange } from '../shared'
import {
  workspaceActiveSheetAuthorityWitnessAtom,
  workspaceSessionAtom,
  type WorkspaceActiveSheetAuthorityWitness,
} from '../workspace'
import type { AutoFillMutationPath, AutoFillOutcome } from './command-contract'
import { sameRange } from './fill-range-geometry'

export interface AutoFillTicket {
  readonly id: number
  readonly sheetId: string
  readonly sourceRange: Readonly<CellRange>
  readonly authorityRange: Readonly<CellRange>
  readonly requiresUnfiltered: boolean
  readonly selectionWitness: SelectionAuthorityWitness
  readonly workspaceWitness: WorkspaceActiveSheetAuthorityWitness
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly historyReservation: HistoryProducerReservation
}

export interface MutationSuccess {
  readonly path: AutoFillMutationPath
  readonly affectedRange: Readonly<CellRange>
  readonly historyEntries: number
  readonly committedStale?: boolean
}

export interface ProjectionWitness {
  readonly requestId: RangeProjectionResult['requestId']
  readonly revision: ProjectionRevision
}

export type MutationAttempt =
  | { readonly kind: 'not-used'; readonly fillRangeWitness?: ProjectionWitness }
  | { readonly kind: 'success'; readonly value: MutationSuccess }
  | { readonly kind: 'terminal'; readonly outcome: AutoFillOutcome }

export const autoFillSequenceAtom = atom(0)
autoFillSequenceAtom.debugLabel = 'spreadsheet.autoFill.internal.sequence'

export const activeAutoFillTicketAtom = atom<AutoFillTicket | null>(null)
activeAutoFillTicketAtom.debugLabel = 'spreadsheet.autoFill.internal.activeTicket'

export function ticketIsCurrent(get: Getter, ticket: AutoFillTicket): boolean {
  return get(activeAutoFillTicketAtom) === ticket
}

export function ticketAuthorityIsCurrent(get: Getter, ticket: AutoFillTicket): boolean {
  return (
    get(selectionAuthorityWitnessAtom) === ticket.selectionWitness &&
    get(workspaceActiveSheetAuthorityWitnessAtom) === ticket.workspaceWitness &&
    get(primarySelectionRegionAtom).sheetId === ticket.sheetId &&
    get(workspaceSessionAtom).activeSheetId === ticket.sheetId &&
    sameRange(get(selectionRangeAtom), ticket.authorityRange)
  )
}

export function ticketFilterAllowsMutation(get: Getter, ticket: AutoFillTicket): boolean {
  return (
    !ticket.requiresUnfiltered ||
    (get(filterSortStateAtom)[ticket.sheetId]?.rules.length ?? 0) === 0
  )
}

export function ticketMutationContextIsCurrent(get: Getter, ticket: AutoFillTicket): boolean {
  return (
    ticketIsCurrent(get, ticket) &&
    ticketAuthorityIsCurrent(get, ticket) &&
    ticketFilterAllowsMutation(get, ticket)
  )
}

export function blockedAuthorityReason(
  get: Getter,
  sheetId: string,
  authorityRange: Readonly<CellRange>,
): AutoFillOutcome | null {
  if (
    get(primarySelectionRegionAtom).sheetId !== sheetId ||
    !sameRange(get(selectionRangeAtom), authorityRange)
  ) {
    return { status: 'blocked', reason: 'selection-mismatch' }
  }
  if (get(workspaceSessionAtom).activeSheetId !== sheetId) {
    return { status: 'blocked', reason: 'active-sheet-mismatch' }
  }
  return null
}

export function finishTicket(set: Setter, get: Getter, ticket: AutoFillTicket): boolean {
  if (!ticketIsCurrent(get, ticket)) return false
  if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) return false
  set(activeAutoFillTicketAtom, null)
  return true
}
