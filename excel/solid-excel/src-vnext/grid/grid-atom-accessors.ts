import { useAtomValue } from '@einfach/solid'
import {
  activeSpillRegionAtom,
  editingDraftAtom,
  editingSessionAtom,
  effectiveHiddenAtom,
  filterSortStateAtom,
  outlineAtom,
  pointerSessionAtom,
  presenceStateAtom,
  remoteCursorsAtom,
  selectionRegionsAtom,
  selectionSnapshotAtom,
  viewportFreezeAtom,
  viewportHiddenAtom,
  viewportMetricsAtom,
  viewportShowGridlinesAtom,
  viewportShowHeadingsAtom,
  viewportSizeOverridesAtom,
} from '@einfach/spreadsheet-ui-core'
import { spreadsheetProjectionSnapshotAtom } from '../provider'

/** Direct, fine-grained Solid subscriptions used by the grid render tree. */
export function useGridAtomAccessors() {
  return {
    projectionSnapshot: useAtomValue(spreadsheetProjectionSnapshotAtom),
    activeSpillRegion: useAtomValue(activeSpillRegionAtom),
    viewportMetrics: useAtomValue(viewportMetricsAtom),
    selectionSnapshot: useAtomValue(selectionSnapshotAtom),
    selectionRegions: useAtomValue(selectionRegionsAtom),
    editingSession: useAtomValue(editingSessionAtom),
    editingDraft: useAtomValue(editingDraftAtom),
    sizeOverrides: useAtomValue(viewportSizeOverridesAtom),
    hiddenState: useAtomValue(effectiveHiddenAtom),
    viewportHidden: useAtomValue(viewportHiddenAtom),
    viewportFreeze: useAtomValue(viewportFreezeAtom),
    outlineState: useAtomValue(outlineAtom),
    pointerSession: useAtomValue(pointerSessionAtom),
    filterSortState: useAtomValue(filterSortStateAtom),
    remoteCursors: useAtomValue(remoteCursorsAtom),
    presenceState: useAtomValue(presenceStateAtom),
    showGridlines: useAtomValue(viewportShowGridlinesAtom),
    showHeadings: useAtomValue(viewportShowHeadingsAtom),
  }
}

export type GridAtomAccessors = ReturnType<typeof useGridAtomAccessors>
