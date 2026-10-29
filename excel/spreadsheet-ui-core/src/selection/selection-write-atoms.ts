import { atom } from '@einfach/core'
import { normalizeSelection } from './geometry'
import {
  copySelection,
  getPrimaryRegion,
  sameNormalizedSelectionBounds,
  snapshotMultiSelectionState,
  toMultiRange,
} from './selection-copy'
import {
  _multiSelectionAtom,
  captureSelectionTargetContext,
  captureSelectionWriteAuthority,
  commitMultiSelectionState,
  createSelectionAuthorityReceipt,
  createSelectionAuthorityState,
  createSelectionAuthorityWitness,
  sameSelectionTargetContext,
  selectionAuthorityStateAtom,
  selectionWriteAuthorityIsCurrent,
} from './selection-authority'
import type { SelectionAuthorityReceipt } from './selection-authority'
import {
  snapshotCellRangeInput,
  snapshotSelectionBoundsInput,
  snapshotSelectionInput,
} from './selection-input-snapshot'
import { selectionAtom, selectionBoundsAtom } from './selection-state-atoms'
import type { SelectionBounds, SelectionState } from './types'

export const setSelectionBoundsAtom = atom(
  (get) => get(selectionBoundsAtom),
  (get, set, bounds: SelectionBounds) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextBounds = snapshotSelectionBoundsInput(bounds)
    if (nextBounds.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const nextMulti = snapshotMultiSelectionState({
      regions: captured.multi.regions.map((region) => normalizeSelection(region, nextBounds.value)),
      primaryIndex: captured.multi.primaryIndex,
    })
    const boundsChanged = !sameNormalizedSelectionBounds(captured.bounds, nextBounds.value)
    const targetChanged = !sameSelectionTargetContext(
      captureSelectionTargetContext(captured.multi, captured.bounds),
      captureSelectionTargetContext(nextMulti, nextBounds.value),
    )
    const witness =
      boundsChanged || targetChanged ? createSelectionAuthorityWitness() : captured.witness
    set(
      selectionAuthorityStateAtom,
      createSelectionAuthorityState(nextBounds.value, nextMulti, witness),
    )
  },
)
setSelectionBoundsAtom.debugLabel = 'spreadsheet.selection.setBounds'

export const setSelectionAtom = atom(
  (get) => get(selectionAtom),
  (get, set, selection: SelectionState) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextSelection = snapshotSelectionInput(selection)
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
setSelectionAtom.debugLabel = 'spreadsheet.selection.set'

/**
 * Guarded selection command for core features that must retain ownership of
 * the selection they just projected. The receipt is sourced from the private
 * authority state written by this command, so it remains coherent inside the
 * current @einfach/core transaction before derived atoms are flushed.
 */
export const setSelectionWithAuthorityReceiptAtom = atom(
  null,
  (get, set, selection: SelectionState): SelectionAuthorityReceipt | null => {
    const captured = captureSelectionWriteAuthority(get)
    const nextSelection = snapshotSelectionInput(selection)
    if (nextSelection.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return null
    }
    const authority = commitMultiSelectionState(
      get,
      set,
      toMultiRange(normalizeSelection(nextSelection.value, captured.bounds)),
    )
    return createSelectionAuthorityReceipt(authority)
  },
)
setSelectionWithAuthorityReceiptAtom.debugLabel = 'spreadsheet.selection.setWithAuthorityReceipt'

/**
 * Validates a guarded-write receipt against the private authority aggregate.
 * This command intentionally avoids derived selection projections: callers
 * may need to validate immediately after a guarded write, before the outer
 * @einfach/core transaction has flushed derived atom caches.
 */
export const selectionAuthorityReceiptIsCurrentAtom = atom(
  null,
  (get, _set, receipt: SelectionAuthorityReceipt): boolean => {
    const authorityAtStart = get(selectionAuthorityStateAtom)
    let witness: unknown
    let selectionCandidate: unknown
    let rangeCandidate: unknown
    try {
      witness = receipt.witness
      selectionCandidate = receipt.selection
      rangeCandidate = receipt.range
    } catch {
      return false
    }
    const selection = snapshotSelectionInput(selectionCandidate)
    const range = snapshotCellRangeInput(rangeCandidate)
    if (
      selection.kind === 'invalid' ||
      range.kind === 'invalid' ||
      get(selectionAuthorityStateAtom) !== authorityAtStart ||
      witness !== authorityAtStart.witness
    ) {
      return false
    }
    return sameSelectionTargetContext(
      captureSelectionTargetContext(get(_multiSelectionAtom), authorityAtStart.bounds),
      { selection: selection.value, range: range.value },
    )
  },
)
selectionAuthorityReceiptIsCurrentAtom.debugLabel =
  'spreadsheet.selection.authorityReceiptIsCurrent'

export const setPrimaryRegionAtom = atom(
  (get) => copySelection(getPrimaryRegion(get(_multiSelectionAtom))),
  (get, set, state: SelectionState) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextSelection = snapshotSelectionInput(state)
    if (nextSelection.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const regions = captured.multi.regions.slice()
    regions[captured.multi.primaryIndex] = normalizeSelection(nextSelection.value, captured.bounds)
    commitMultiSelectionState(get, set, {
      regions,
      primaryIndex: captured.multi.primaryIndex,
    })
  },
)
setPrimaryRegionAtom.debugLabel = 'spreadsheet.selection.setPrimaryRegion'
