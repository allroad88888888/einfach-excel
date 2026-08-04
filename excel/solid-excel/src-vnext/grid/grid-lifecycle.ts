import { onCleanup, onMount } from 'solid-js'
import {
  activeSpillRegionAtom,
  cancelPointerAtom,
  editingSessionAtom,
  filterSortStateAtom,
  notifyActiveSheetChangedAtom,
  outlineAtom,
  pointerSessionAtom,
  presenceStateAtom,
  selectionAtom,
  setSelectionBoundsAtom,
  setViewportMetricsAtom,
  setWorkspaceActiveSheetAtom,
  viewportFilterHiddenAtom,
  viewportFreezeAtom,
  viewportHiddenAtom,
  viewportMetricsAtom,
  viewportShowGridlinesAtom,
  viewportShowHeadingsAtom,
  viewportSizeOverridesAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { spreadsheetProjectionSnapshotAtom } from '../provider'
import { type GridRuntime } from './grid-runtime'

export function installGridLifecycle(runtime: GridRuntime) {
  const { props, store, backend, bumpRender, bumpRenderAndProbeSpill, refreshSpillRegion, requestProjection, loadProjection, refreshViewportProjection, refreshEffectiveFreezeProjection, initializeFreezeProjection, syncViewportSizeFromElement, syncScrollElementToViewport } = runtime
  let resizeObserver: ResizeObserver | null = null
  const unsubscribers: Array<() => void> = []

  onMount(() => {
    initializeFreezeProjection()
    unsubscribers.push(
      store.sub(spreadsheetProjectionSnapshotAtom, bumpRenderAndProbeSpill),
      store.sub(viewportMetricsAtom, refreshViewportProjection),
      store.sub(viewportSizeOverridesAtom, bumpRender),
      store.sub(viewportHiddenAtom, bumpRender),
      store.sub(viewportFilterHiddenAtom, bumpRender),
      store.sub(outlineAtom, bumpRender),
      store.sub(viewportFreezeAtom, refreshEffectiveFreezeProjection),
      store.sub(pointerSessionAtom, bumpRender),
      store.sub(presenceStateAtom, bumpRender),
      store.sub(filterSortStateAtom, bumpRender),
      store.sub(viewportShowGridlinesAtom, bumpRender),
      store.sub(viewportShowHeadingsAtom, bumpRender),
      store.sub(selectionAtom, bumpRenderAndProbeSpill),
      store.sub(activeSpillRegionAtom, bumpRender),
      store.sub(editingSessionAtom, bumpRender),
    )
    refreshSpillRegion()
    const unsubscribeContentChanges = backend.subscribeContentChanges?.(() => void loadProjection(requestProjection()))
    if (unsubscribeContentChanges) unsubscribers.push(unsubscribeContentChanges)

    if (store.getter(workspaceSessionAtom).activeSheetId === null) {
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: props.sheetId })
    }
    let lastActiveSheetId = store.getter(workspaceSessionAtom).activeSheetId
    unsubscribers.push(store.sub(workspaceSessionAtom, () => {
      const nextSheetId = store.getter(workspaceSessionAtom).activeSheetId
      if (nextSheetId !== lastActiveSheetId) {
        lastActiveSheetId = nextSheetId
        store.setter(notifyActiveSheetChangedAtom, nextSheetId)
      }
    }))

    store.setter(setViewportMetricsAtom, props.viewport)
    store.setter(setSelectionBoundsAtom, { rowCount: props.viewport.rowCount, colCount: props.viewport.colCount })
    syncViewportSizeFromElement()
    syncScrollElementToViewport()
    const scrollRoot = runtime.scrollRoot as HTMLDivElement | undefined
    if (typeof ResizeObserver !== 'undefined' && scrollRoot) {
      resizeObserver = new ResizeObserver(syncViewportSizeFromElement)
      resizeObserver.observe(scrollRoot)
    }
  })

  onCleanup(() => {
    resizeObserver?.disconnect()
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    runtime.cancelDragSelection()
    runtime.cancelResize()
    runtime.cancelFill()
    store.setter(cancelPointerAtom)
  })
}
