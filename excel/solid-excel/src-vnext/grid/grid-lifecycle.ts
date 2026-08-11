import { onCleanup, onMount } from 'solid-js'
import {
  cancelPointerAtom,
  notifyActiveSheetChangedAtom,
  selectionAtom,
  setSelectionBoundsAtom,
  setViewportMetricsAtom,
  setWorkspaceActiveSheetAtom,
  viewportFreezeAtom,
  viewportMetricsAtom,
  workspaceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { spreadsheetProjectionSnapshotAtom } from '../provider'
import type { GridProjectionControllerApi } from './grid-projection-controller'
import { type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

type GridLifecycleRuntime = GridRuntimeBase &
  Pick<GridViewStateApi, 'refreshSpillRegion'> &
  Pick<GridProjectionControllerApi, 'requestProjection' | 'loadProjection' | 'refreshViewportProjection' | 'refreshEffectiveFreezeProjection' | 'initializeFreezeProjection' | 'syncViewportSizeFromElement' | 'syncScrollElementToViewport'>

export function installGridLifecycle(runtime: GridLifecycleRuntime) {
  const { props, store, backend, dom, refreshSpillRegion, requestProjection, loadProjection, refreshViewportProjection, refreshEffectiveFreezeProjection, initializeFreezeProjection, syncViewportSizeFromElement, syncScrollElementToViewport } = runtime
  let resizeObserver: ResizeObserver | null = null
  const unsubscribers: Array<() => void> = []

  onMount(() => {
    initializeFreezeProjection()
    refreshSpillRegion()
    // These narrow subscriptions start imperative work only. The render tree
    // consumes the same atoms directly through @einfach/solid accessors.
    unsubscribers.push(store.sub(selectionAtom, refreshSpillRegion))
    unsubscribers.push(store.sub(spreadsheetProjectionSnapshotAtom, refreshSpillRegion))
    unsubscribers.push(store.sub(viewportMetricsAtom, refreshViewportProjection))
    unsubscribers.push(store.sub(viewportFreezeAtom, refreshEffectiveFreezeProjection))
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
    refreshViewportProjection()
    syncViewportSizeFromElement()
    syncScrollElementToViewport()
    const scrollRoot = dom.scrollRoot()
    if (typeof ResizeObserver !== 'undefined' && scrollRoot) {
      resizeObserver = new ResizeObserver(syncViewportSizeFromElement)
      resizeObserver.observe(scrollRoot)
    }
  })

  onCleanup(() => {
    resizeObserver?.disconnect()
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    dom.cancelDragSelection()
    dom.cancelResize()
    dom.cancelFill()
    store.setter(cancelPointerAtom)
  })
}
