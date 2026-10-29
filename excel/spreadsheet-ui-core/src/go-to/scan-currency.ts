import type { Getter } from '@einfach/core'
import { selectionAuthorityWitnessAtom, selectionSnapshotAtom } from '../selection'
import { sheetTabsSheetsAtom } from '../sheet-tabs'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import {
  goToLocatorAtom,
  goToModeAtom,
  goToOpenAtom,
  goToSessionSequenceAtom,
  goToSpecialScanStateAtom,
  type GoToSpecialScanState,
} from './session-state'
import { sameLocator } from './value-snapshots'

export function goToSpecialLaunchIsCurrent(
  get: Getter,
  sessionId: number,
  workspaceWitness: unknown,
  selectionWitness: unknown,
): boolean {
  return (
    get(goToOpenAtom) &&
    get(goToModeAtom) === 'special' &&
    get(goToSessionSequenceAtom) === sessionId &&
    get(workspaceActiveSheetAuthorityWitnessAtom) === workspaceWitness &&
    get(selectionAuthorityWitnessAtom) === selectionWitness
  )
}

export function goToSpecialTicketIsCurrent(
  get: Getter,
  ticket: GoToSpecialScanState,
  workspaceWitness: unknown,
  selectionWitness: unknown,
): boolean {
  const live = get(goToSpecialScanStateAtom)
  const activeSheetId =
    get(workspaceSessionAtom).activeSheetId ??
    get(selectionSnapshotAtom).selection.sheetId ??
    get(sheetTabsSheetsAtom)[0]?.id ??
    ''
  return (
    goToSpecialLaunchIsCurrent(get, ticket.sessionId, workspaceWitness, selectionWitness) &&
    live.status === 'scanning' &&
    live.sessionId === ticket.sessionId &&
    live.requestId === ticket.requestId &&
    live.sheetId === ticket.sheetId &&
    live.locator !== null &&
    ticket.locator !== null &&
    sameLocator(live.locator, ticket.locator) &&
    sameLocator(get(goToLocatorAtom), ticket.locator) &&
    activeSheetId === ticket.sheetId &&
    get(selectionAuthorityWitnessAtom) === selectionWitness
  )
}
