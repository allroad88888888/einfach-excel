import { atom } from '@einfach/core'
import { projectionSnapshotBackingAtom } from '../projection/state'
import { mergedActiveCell } from './merged-selection'
import { getActiveCell, getSelectionRange, normalizeSelection } from './geometry'
import {
  copySelection,
  copySelectionRegions,
  getPrimaryRegion,
  sameNormalizedSelectionBounds,
  snapshotSelectionBounds,
  toMultiRange,
} from './selection-copy'
import {
  _multiSelectionAtom,
  captureSelectionWriteAuthority,
  commitMultiSelectionState,
  createSelectionAuthorityState,
  createSelectionAuthorityWitness,
  selectionAuthorityStateAtom,
  selectionBoundsStateAtom,
  selectionWriteAuthorityIsCurrent,
} from './selection-authority'
import { snapshotSelectionBoundsInput, snapshotSelectionInput } from './selection-input-snapshot'
import type { CellRange } from '../shared'
import type {
  ActiveSelectionCell,
  SelectionBounds,
  SelectionSnapshot,
  SelectionState,
} from './types'

type SelectionBoundsUpdate = SelectionBounds | ((previous: SelectionBounds) => SelectionBounds)

/**
 * Controlled facade preserving direct AtomEntity-style writes, including
 * updater functions. Any normalized sheet-size change rotates selection
 * authority because a ticketed range may be larger than the owned focus that
 * is currently projected into the public selection.
 */
export const selectionBoundsAtom = atom(
  (get) => snapshotSelectionBounds(get(selectionBoundsStateAtom)),
  (get, set, update: SelectionBoundsUpdate): void => {
    const captured = captureSelectionWriteAuthority(get)
    let proposedBounds: unknown
    try {
      proposedBounds =
        typeof update === 'function' ? update(snapshotSelectionBounds(captured.bounds)) : update
    } catch {
      return
    }
    const nextBounds = snapshotSelectionBoundsInput(proposedBounds)
    if (nextBounds.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const witness = sameNormalizedSelectionBounds(captured.bounds, nextBounds.value)
      ? captured.witness
      : createSelectionAuthorityWitness()
    set(
      selectionAuthorityStateAtom,
      createSelectionAuthorityState(nextBounds.value, captured.multi, witness),
    )
  },
)
selectionBoundsAtom.debugLabel = 'spreadsheet.selection.bounds'

export const selectionAtom = atom(
  (get): SelectionState => copySelection(getPrimaryRegion(get(_multiSelectionAtom))),
  (get, set, state: SelectionState) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextSelection = snapshotSelectionInput(state)
    if (nextSelection.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    commitMultiSelectionState(
      get,
      set,
      toMultiRange(normalizeSelection(nextSelection.value, captured.bounds)),
    )
  },
)
selectionAtom.debugLabel = 'spreadsheet.selection.state'

export const selectionRegionsAtom = atom((get): readonly SelectionState[] =>
  copySelectionRegions(get(_multiSelectionAtom).regions),
)
selectionRegionsAtom.debugLabel = 'spreadsheet.selection.regions'

/** 所有可见选区的几何；普通区、冻结区和合并格共享，不复制可写状态。 */
export const selectionRangesAtom = atom((get): readonly CellRange[] => {
  const bounds = get(selectionBoundsAtom)
  return get(selectionRegionsAtom).map((region) => getSelectionRange(region, bounds))
})

export const primarySelectionRegionAtom = atom(
  (get): SelectionState => copySelection(getPrimaryRegion(get(_multiSelectionAtom))),
)
primarySelectionRegionAtom.debugLabel = 'spreadsheet.selection.primaryRegion'

export const activeCellAtom = atom((get): ActiveSelectionCell => {
  const bounds = get(selectionBoundsStateAtom)
  return Object.freeze(
    mergedActiveCell(
      getActiveCell(getPrimaryRegion(get(_multiSelectionAtom)), bounds),
      get(projectionSnapshotBackingAtom).result,
    ),
  )
})
activeCellAtom.debugLabel = 'spreadsheet.selection.activeCell'

export const selectionRangeAtom = atom((get): CellRange => {
  const bounds = get(selectionBoundsStateAtom)
  return Object.freeze(getSelectionRange(getPrimaryRegion(get(_multiSelectionAtom)), bounds))
})
selectionRangeAtom.debugLabel = 'spreadsheet.selection.range'

export const selectionSnapshotAtom = atom((get): SelectionSnapshot => {
  const bounds = get(selectionBoundsStateAtom)
  const selection = copySelection(
    normalizeSelection(getPrimaryRegion(get(_multiSelectionAtom)), bounds),
  )

  return Object.freeze({
    selection,
    activeCell: get(activeCellAtom),
    range: Object.freeze(getSelectionRange(selection, bounds)),
  })
})
selectionSnapshotAtom.debugLabel = 'spreadsheet.selection.snapshot'
