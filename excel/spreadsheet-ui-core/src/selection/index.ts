export { EXCEL_MAX_ROWS, EXCEL_MAX_COLS } from '../shared/grid-coordinates'

export * from './types'

export {
  DEFAULT_SELECTION_BOUNDS,
  DEFAULT_SELECTION_STATE,
  normalizeSelectionBounds,
  clampCellCoord,
  normalizeSelection,
  getSelectionRange,
  getActiveCell,
  moveSelection,
} from './geometry'
export type { SelectionAuthorityWitness, SelectionAuthorityReceipt } from './selection-authority'
export { selectionAuthorityWitnessAtom } from './selection-authority'
export { MAX_SELECTION_REGIONS } from './selection-input-snapshot'
export {
  selectionBoundsAtom,
  selectionAtom,
  selectionRegionsAtom,
  selectionRangesAtom,
  primarySelectionRegionAtom,
  activeCellAtom,
  selectionRangeAtom,
  selectionSnapshotAtom,
} from './selection-state-atoms'
export {
  setSelectionBoundsAtom,
  setSelectionAtom,
  setSelectionWithAuthorityReceiptAtom,
  selectionAuthorityReceiptIsCurrentAtom,
  setPrimaryRegionAtom,
} from './selection-write-atoms'
export { selectCellAtom, selectRowsAtom, selectColumnsAtom, selectAllAtom } from './select-commands'
export {
  addSelectionRegionAtom,
  setMultiRegionSelectionAtom,
  setMultiRegionSelectionWithAuthorityReceiptAtom,
  clearNonPrimaryRegionsAtom,
} from './multi-region-commands'
export type { SetMultiRegionSelectionInput } from './multi-region-commands'
