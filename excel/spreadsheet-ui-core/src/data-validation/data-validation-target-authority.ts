import type { Getter } from '@einfach/core'
import {
  selectionAuthorityWitnessAtom,
  selectionSnapshotAtom,
  type SelectionAuthorityWitness,
} from '../selection'
import {
  workspaceActiveSheetAuthorityWitnessAtom,
  workspaceSessionAtom,
  type WorkspaceActiveSheetAuthorityWitness,
} from '../workspace'

export type DataValidationTargetAuthority =
  | {
      readonly source: 'explicit'
      readonly sheetId: string
    }
  | {
      readonly source: 'workspace'
      readonly sheetId: string
      readonly workspaceWitness: WorkspaceActiveSheetAuthorityWitness
    }
  | {
      readonly source: 'selection'
      readonly sheetId: string
      readonly workspaceWitness: WorkspaceActiveSheetAuthorityWitness
      readonly selectionWitness: SelectionAuthorityWitness
    }

export function captureDataValidationTargetAuthority(
  get: Getter,
  explicitSheetId: string | undefined,
): DataValidationTargetAuthority | null {
  // Presence is a hard authority branch: an invalid explicit id must not use fallback state.
  if (explicitSheetId !== undefined) {
    return explicitSheetId.length > 0
      ? Object.freeze({ source: 'explicit', sheetId: explicitSheetId })
      : null
  }
  try {
    const workspaceWitness = get(workspaceActiveSheetAuthorityWitnessAtom)
    const workspaceSession = get(workspaceSessionAtom)
    const workspaceSheetId = workspaceSession.activeSheetId
    if (get(workspaceActiveSheetAuthorityWitnessAtom) !== workspaceWitness) return null
    if (workspaceSheetId !== null && workspaceSheetId.length > 0) {
      return Object.freeze({ source: 'workspace', sheetId: workspaceSheetId, workspaceWitness })
    }
    const selectionWitness = get(selectionAuthorityWitnessAtom)
    const selectionSnapshot = get(selectionSnapshotAtom)
    const selectionSheetId = selectionSnapshot.selection.sheetId
    if (
      get(workspaceActiveSheetAuthorityWitnessAtom) !== workspaceWitness ||
      get(selectionAuthorityWitnessAtom) !== selectionWitness
    ) {
      return null
    }
    return selectionSheetId.length > 0
      ? Object.freeze({
          source: 'selection',
          sheetId: selectionSheetId,
          workspaceWitness,
          selectionWitness,
        })
      : null
  } catch {
    return null
  }
}

export function dataValidationTargetAuthorityIsCurrent(
  get: Getter,
  authority: DataValidationTargetAuthority,
): boolean {
  if (authority.source === 'explicit') return true
  try {
    if (get(workspaceActiveSheetAuthorityWitnessAtom) !== authority.workspaceWitness) return false
    return (
      authority.source === 'workspace' ||
      get(selectionAuthorityWitnessAtom) === authority.selectionWitness
    )
  } catch {
    return false
  }
}
