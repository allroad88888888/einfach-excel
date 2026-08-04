import { createEffect } from 'solid-js'
import {
  hydrateSheetProtectionAtom,
  hydrateViewportFreezeAtom,
  hydrateViewportHiddenAtom,
  hydrateViewportSizeProjectionAtom,
  viewportMetricsAtom,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider'
import { SpreadsheetGridView } from './SpreadsheetGridView'
import { installGridAutoFitController } from './grid-auto-fit-controller'
import { installGridClipboard } from './grid-clipboard'
import { installGridContextMenu } from './grid-context-menu'
import { installGridEditNavigation } from './grid-edit-navigation'
import { installGridEditingController } from './grid-editing-controller'
import { installGridFillController } from './grid-fill-controller'
import { installGridFillHandle } from './grid-fill-handle'
import { installGridFormatController } from './grid-format-controller'
import { installGridKeyboardController } from './grid-keyboard-controller'
import { installGridLayout } from './grid-layout'
import { installGridLifecycle } from './grid-lifecycle'
import { installGridOutlineState } from './grid-outline-state'
import { installGridOverlayController } from './grid-overlay-controller'
import { installGridPointerSelection } from './grid-pointer-selection'
import { installGridProjectionController } from './grid-projection-controller'
import { installGridResizeController } from './grid-resize-controller'
import { createGridRuntime } from './grid-runtime'
import { installGridSelection } from './grid-selection'
import { installGridViewState } from './grid-view-state'

export interface SpreadsheetGridProps {
  sheetId: string
  viewport: ViewportMetrics
  class?: string
  'data-testid'?: string
}

/** Thin composition root for the virtualized spreadsheet grid. */
export function SpreadsheetGrid(props: SpreadsheetGridProps) {
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const runtime = createGridRuntime({
    props,
    store,
    backend,
    gridRoot: undefined as HTMLDivElement | undefined,
    scrollRoot: undefined as HTMLDivElement | undefined,
    cancelDragSelection: () => undefined,
    cancelResize: () => undefined,
    cancelFill: () => undefined,
  })

  installGridViewState(runtime)

  // Keep metadata loading on UI-core commands; the grid never reads these
  // persisted view facts from the backend directly.
  runtime.hydrateViewportSizeProjection = async () => {
    const window = runtime.getRenderedVisibleWindow()
    if (window.rowEnd < window.rowStart || window.colEnd < window.colStart) return
    const outcome = await store.setter(hydrateViewportSizeProjectionAtom, {
      source: backend,
      sheetId: props.sheetId,
      window,
    })
    if (outcome === 'ready') runtime.bumpRender()
  }

  createEffect(() => {
    void store.setter(hydrateViewportFreezeAtom, { source: backend, sheetId: props.sheetId })
    const metrics = store.getter(viewportMetricsAtom)
    void store.setter(hydrateViewportHiddenAtom, {
      source: backend,
      sheetId: props.sheetId,
      rowCount: metrics.rowCount > 0 ? metrics.rowCount : props.viewport.rowCount,
      colCount: metrics.colCount > 0 ? metrics.colCount : props.viewport.colCount,
    })
    void store.setter(hydrateSheetProtectionAtom, { source: backend, sheetId: props.sheetId })
  })

  installGridProjectionController(runtime)
  installGridSelection(runtime)
  installGridLayout(runtime)
  installGridOutlineState(runtime)
  installGridAutoFitController(runtime)
  installGridEditingController(runtime)
  installGridContextMenu(runtime)
  installGridPointerSelection(runtime)
  installGridFillController(runtime)
  installGridFillHandle(runtime)
  installGridResizeController(runtime)
  installGridEditNavigation(runtime)
  installGridClipboard(runtime)
  installGridFormatController(runtime)
  installGridKeyboardController(runtime)
  installGridOverlayController(runtime)
  installGridLifecycle(runtime)

  return <SpreadsheetGridView runtime={runtime} />
}
