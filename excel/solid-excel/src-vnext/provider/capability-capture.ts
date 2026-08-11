import type { Store } from '@einfach/core'
import {
  captureFilterSortCapabilityAtom,
  captureFindReplaceCapabilityAtom,
  capturePasteSpecialCapabilityAtom,
  captureRemoveDuplicatesCapabilityAtom,
  captureSortRangeCapabilityAtom,
  captureSpillRegionCapabilityAtom,
  captureTableCapabilityAtom,
  captureTextToColumnsCapabilityAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { captureCustomFormulasCapabilityAtom } from './atoms'

/** Capture every provider-owned backend capability projection in one place. */
export function captureWorkbookCapabilities(store: Store, backend: SpreadsheetBackend): void {
  store.setter(capturePasteSpecialCapabilityAtom, backend)
  store.setter(captureSpillRegionCapabilityAtom, backend)
  store.setter(captureFilterSortCapabilityAtom, backend)
  store.setter(captureSortRangeCapabilityAtom, backend)
  store.setter(captureFindReplaceCapabilityAtom, backend)
  store.setter(captureRemoveDuplicatesCapabilityAtom, backend)
  store.setter(captureTextToColumnsCapabilityAtom, backend)
  store.setter(captureTableCapabilityAtom, backend)
  store.setter(captureCustomFormulasCapabilityAtom, backend)
}
