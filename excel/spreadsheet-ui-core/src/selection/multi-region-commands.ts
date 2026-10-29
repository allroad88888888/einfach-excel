import { atom } from '@einfach/core'
import { DEFAULT_SELECTION_STATE, normalizeSelection } from './geometry'
import { copySelection, getPrimaryRegion, snapshotMultiSelectionState } from './selection-copy'
import {
  _multiSelectionAtom,
  captureSelectionWriteAuthority,
  commitMultiSelectionState,
  createSelectionAuthorityReceipt,
  selectionWriteAuthorityIsCurrent,
} from './selection-authority'
import type { SelectionAuthorityReceipt } from './selection-authority'
import {
  snapshotAddSelectionRegionInput,
  snapshotClearSelectionRegionsInput,
  snapshotSetMultiRegionSelectionInput,
} from './command-input-snapshot'
import { MAX_SELECTION_REGIONS } from './selection-input-snapshot'
import type {
  AddSelectionRegionInput,
  ClearSelectionRegionsInput,
  SelectionRegion,
  SelectionState,
} from './types'

export const addSelectionRegionAtom = atom(
  (get) => snapshotMultiSelectionState(get(_multiSelectionAtom)),
  (get, set, input: AddSelectionRegionInput) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotAddSelectionRegionInput(input)
    if (
      nextInput.kind === 'invalid' ||
      captured.multi.regions.length >= MAX_SELECTION_REGIONS ||
      !selectionWriteAuthorityIsCurrent(get, captured)
    ) {
      return
    }
    const region = normalizeSelection(nextInput.value.region, captured.bounds) as SelectionRegion
    const regions = [...captured.multi.regions, region]
    const primaryIndex =
      nextInput.value.makePrimary === false ? captured.multi.primaryIndex : regions.length - 1
    commitMultiSelectionState(get, set, { regions, primaryIndex })
  },
)
addSelectionRegionAtom.debugLabel = 'spreadsheet.selection.addRegion'

/**
 * Replace the entire selection with a list of regions in one atomic write.
 * Used by features like Go To Special that need to surface N matches as a
 * single multi-region selection without N separate add-region writes — each
 * of which would fire a separate atom-change notification and re-render
 * subscribers N times.
 *
 * `primaryIndex` defaults to 0 when omitted. Empty input falls back to the
 * default empty cell selection at (0,0) of the current selection's sheet so
 * subscribers always observe a well-formed primary region.
 */
export interface SetMultiRegionSelectionInput {
  readonly regions: readonly SelectionState[]
  readonly primaryIndex?: number
}

export const setMultiRegionSelectionAtom = atom(
  (get) => snapshotMultiSelectionState(get(_multiSelectionAtom)),
  (get, set, input: SetMultiRegionSelectionInput) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotSetMultiRegionSelectionInput(input)
    if (nextInput.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    if (nextInput.value.regions.length === 0) {
      const currentSheet =
        getPrimaryRegion(captured.multi)?.sheetId ?? DEFAULT_SELECTION_STATE.sheetId
      commitMultiSelectionState(get, set, {
        regions: [{ ...DEFAULT_SELECTION_STATE, sheetId: currentSheet }],
        primaryIndex: 0,
      })
      return
    }
    const regions = nextInput.value.regions.map((region) =>
      normalizeSelection(region, captured.bounds),
    )
    const primaryIndex = nextInput.value.primaryIndex ?? 0
    commitMultiSelectionState(get, set, { regions, primaryIndex })
  },
)
setMultiRegionSelectionAtom.debugLabel = 'spreadsheet.selection.setMultiRegion'

/** Multi-range pointer writes consume the committed primary before the outer atom flush. */
export const setMultiRegionSelectionWithAuthorityReceiptAtom = atom(
  null,
  (get, set, input: SetMultiRegionSelectionInput): SelectionAuthorityReceipt | null => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotSetMultiRegionSelectionInput(input)
    if (
      nextInput.kind === 'invalid' ||
      nextInput.value.regions.length === 0 ||
      !selectionWriteAuthorityIsCurrent(get, captured)
    )
      return null
    const authority = commitMultiSelectionState(get, set, {
      regions: nextInput.value.regions.map((region) => normalizeSelection(region, captured.bounds)),
      primaryIndex: nextInput.value.primaryIndex ?? 0,
    })
    return createSelectionAuthorityReceipt(authority)
  },
)
setMultiRegionSelectionWithAuthorityReceiptAtom.debugLabel =
  'spreadsheet.selection.setMultiRegionWithAuthorityReceipt'

export const clearNonPrimaryRegionsAtom = atom(
  (get) => snapshotMultiSelectionState(get(_multiSelectionAtom)),
  (get, set, input?: ClearSelectionRegionsInput) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotClearSelectionRegionsInput(input)
    if (nextInput.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    if (nextInput.value?.keepPrimary) {
      const primary = copySelection(getPrimaryRegion(captured.multi))
      commitMultiSelectionState(get, set, { regions: [primary], primaryIndex: 0 })
      return
    }

    commitMultiSelectionState(get, set, {
      regions: [DEFAULT_SELECTION_STATE],
      primaryIndex: 0,
    })
  },
)
clearNonPrimaryRegionsAtom.debugLabel = 'spreadsheet.selection.clearNonPrimary'
