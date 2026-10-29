import { atom } from '@einfach/core'
import { projectionSnapshotBackingAtom } from '../projection/state'
import { projectMergedSelection } from './merged-selection'
import {
  assertNever,
  DEFAULT_SELECTION_BOUNDS,
  DEFAULT_SELECTION_STATE,
  getSelectionRange,
  normalizeSelection,
  normalizeSelectionBounds,
  sameCoord,
} from './geometry'
import {
  copySelection,
  getPrimaryRegion,
  snapshotMultiSelectionState,
  snapshotSelectionBounds,
} from './selection-copy'
import type { Atom, Getter, Setter } from '@einfach/core'
import type { CellRange } from '../shared'
import type { MultiRangeSelectionState, SelectionBounds, SelectionState } from './types'

declare const selectionAuthorityWitnessBrand: unique symbol

/**
 * Opaque identity for the primary-selection target context. Consumers may
 * retain and compare it by reference; only the selection write funnel can
 * rotate it.
 */
export interface SelectionAuthorityWitness {
  readonly [selectionAuthorityWitnessBrand]: true
}

/**
 * Immutable receipt returned by the guarded selection write command. A
 * caller can consume it inside the same @einfach/core writer without
 * re-reading derived selection atoms before the outer transaction flushes.
 */
export interface SelectionAuthorityReceipt {
  readonly selection: SelectionState
  readonly range: CellRange
  readonly witness: SelectionAuthorityWitness
}

export const DEFAULT_MULTI_SELECTION_STATE: MultiRangeSelectionState = Object.freeze({
  regions: Object.freeze([copySelection(DEFAULT_SELECTION_STATE)]),
  primaryIndex: 0,
})

export interface SelectionTargetContext {
  readonly selection: SelectionState
  readonly range: CellRange
}

export interface SelectionAuthorityState {
  readonly bounds: SelectionBounds
  readonly multi: MultiRangeSelectionState
  readonly witness: SelectionAuthorityWitness
}

export interface SelectionWriteAuthority extends SelectionAuthorityState {
  readonly authority: SelectionAuthorityState
}

export function captureSelectionTargetContext(
  multi: MultiRangeSelectionState,
  bounds: SelectionBounds,
): SelectionTargetContext {
  const normalizedBounds = normalizeSelectionBounds(bounds)
  const selection = normalizeSelection(getPrimaryRegion(multi), normalizedBounds)
  return {
    selection,
    range: getSelectionRange(selection, normalizedBounds),
  }
}

function sameSelectionState(left: SelectionState, right: SelectionState): boolean {
  if (left.kind !== right.kind || left.sheetId !== right.sheetId) return false

  switch (left.kind) {
    case 'cell':
    case 'range':
      return (
        (right.kind === 'cell' || right.kind === 'range') &&
        sameCoord(left.anchor, right.anchor) &&
        sameCoord(left.focus, right.focus)
      )
    case 'row':
      return (
        right.kind === 'row' &&
        left.rowAnchor === right.rowAnchor &&
        left.rowFocus === right.rowFocus
      )
    case 'column':
      return (
        right.kind === 'column' &&
        left.colAnchor === right.colAnchor &&
        left.colFocus === right.colFocus
      )
    case 'all':
      return right.kind === 'all'
    default:
      return assertNever(left)
  }
}

export function sameSelectionTargetContext(
  left: SelectionTargetContext,
  right: SelectionTargetContext,
): boolean {
  return (
    sameSelectionState(left.selection, right.selection) &&
    left.range.rowStart === right.range.rowStart &&
    left.range.rowEnd === right.range.rowEnd &&
    left.range.colStart === right.range.colStart &&
    left.range.colEnd === right.range.colEnd
  )
}

export function createSelectionAuthorityWitness(): SelectionAuthorityWitness {
  return Object.freeze({}) as SelectionAuthorityWitness
}

export function createSelectionAuthorityState(
  bounds: SelectionBounds,
  multi: MultiRangeSelectionState,
  witness: SelectionAuthorityWitness,
): SelectionAuthorityState {
  return Object.freeze({ bounds, multi, witness })
}

export const selectionAuthorityStateAtom = atom<SelectionAuthorityState>(
  createSelectionAuthorityState(
    snapshotSelectionBounds(DEFAULT_SELECTION_BOUNDS),
    snapshotMultiSelectionState(DEFAULT_MULTI_SELECTION_STATE),
    createSelectionAuthorityWitness(),
  ),
)
selectionAuthorityStateAtom.debugLabel = 'spreadsheet.selection.internal.authorityState'

export const selectionBoundsStateAtom: Atom<SelectionBounds> = atom(
  (get) => get(selectionAuthorityStateAtom).bounds,
)
selectionBoundsStateAtom.debugLabel = 'spreadsheet.selection.internal.boundsState'

export const _multiSelectionAtom: Atom<MultiRangeSelectionState> = atom((get) =>
  projectMergedSelection(
    get(selectionAuthorityStateAtom).multi,
    get(projectionSnapshotBackingAtom).result,
  ),
)
_multiSelectionAtom.debugLabel = 'spreadsheet.selection._multi'

export function captureSelectionWriteAuthority(get: Getter): SelectionWriteAuthority {
  const authority = get(selectionAuthorityStateAtom)
  return {
    authority,
    bounds: authority.bounds,
    multi: get(_multiSelectionAtom),
    witness: authority.witness,
  }
}

export function selectionWriteAuthorityIsCurrent(
  get: Getter,
  captured: SelectionWriteAuthority,
): boolean {
  return get(selectionAuthorityStateAtom) === captured.authority
}

export const selectionAuthorityWitnessAtom: Atom<SelectionAuthorityWitness> = atom(
  (get) => get(selectionAuthorityStateAtom).witness,
)
selectionAuthorityWitnessAtom.debugLabel = 'spreadsheet.selection.authorityWitness'

export function commitMultiSelectionState(
  get: Getter,
  set: Setter,
  nextState: MultiRangeSelectionState,
): SelectionAuthorityState {
  const nextSnapshot = snapshotMultiSelectionState(
    projectMergedSelection(nextState, get(projectionSnapshotBackingAtom).result),
  )
  const liveAuthority = get(selectionAuthorityStateAtom)
  const previousTarget = captureSelectionTargetContext(liveAuthority.multi, liveAuthority.bounds)
  const nextTarget = captureSelectionTargetContext(nextSnapshot, liveAuthority.bounds)
  const witness = sameSelectionTargetContext(previousTarget, nextTarget)
    ? liveAuthority.witness
    : createSelectionAuthorityWitness()
  const nextAuthority = createSelectionAuthorityState(liveAuthority.bounds, nextSnapshot, witness)
  set(selectionAuthorityStateAtom, nextAuthority)
  return nextAuthority
}

export function createSelectionAuthorityReceipt(
  authority: SelectionAuthorityState,
): SelectionAuthorityReceipt {
  const target = captureSelectionTargetContext(authority.multi, authority.bounds)
  return Object.freeze({
    selection: copySelection(target.selection),
    range: Object.freeze({ ...target.range }),
    witness: authority.witness,
  })
}
