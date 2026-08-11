import type { Store } from '@einfach/core'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import type { SpreadsheetGridProps } from './SpreadsheetGrid'
import type { GridAtomAccessors } from './grid-atom-accessors'
import type { GridDomAdapter } from './grid-dom-adapter'
import type { GridAutoFitControllerApi } from './grid-auto-fit-controller'
import type { GridClipboardApi } from './grid-clipboard'
import type { GridContextMenuApi } from './grid-context-menu'
import type { GridEditNavigationApi } from './grid-edit-navigation'
import type { GridEditingControllerApi } from './grid-editing-controller'
import type { GridFillControllerApi } from './grid-fill-controller'
import type { GridFillHandleApi } from './grid-fill-handle'
import type { GridFormatControllerApi } from './grid-format-controller'
import type { GridKeyboardControllerApi } from './grid-keyboard-controller'
import type { GridLayoutApi } from './grid-layout'
import type { GridOverlayControllerApi } from './grid-overlay-controller'
import type { GridOutlineStateApi } from './grid-outline-state'
import type { GridPointerSelectionApi } from './grid-pointer-selection'
import type { GridProjectionControllerApi } from './grid-projection-controller'
import type { GridResizeControllerApi } from './grid-resize-controller'
import type { GridSelectionApi } from './grid-selection'
import type { GridViewStateApi } from './grid-view-state'

/** Stable, concrete inputs shared by every grid feature. */
export interface GridRuntimeBase {
  readonly props: SpreadsheetGridProps
  readonly store: Store
  readonly backend: SpreadsheetBackend
  readonly atoms: GridAtomAccessors
  readonly dom: GridDomAdapter
}

/** The one composition-time adapter installed after view-state is available. */
export interface GridHydrationApi {
  hydrateViewportSizeProjection: () => Promise<void>
}

/**
 * The composed grid contract. Each method originates in a named feature
 * installer, so consumers cannot add arbitrary properties to the runtime.
 */
export interface GridRuntime extends
  GridRuntimeBase,
  GridHydrationApi,
  GridViewStateApi,
  GridProjectionControllerApi,
  GridSelectionApi,
  GridOutlineStateApi,
  GridLayoutApi,
  GridAutoFitControllerApi,
  GridEditingControllerApi,
  GridContextMenuApi,
  GridPointerSelectionApi,
  GridFillControllerApi,
  GridFillHandleApi,
  GridResizeControllerApi,
  GridEditNavigationApi,
  GridClipboardApi,
  GridFormatControllerApi,
  GridKeyboardControllerApi,
  GridOverlayControllerApi {}

class GridRuntimeHost implements GridRuntimeBase {
  readonly props
  readonly store
  readonly backend
  readonly atoms
  readonly dom

  constructor(seed: GridRuntimeBase) {
    this.props = seed.props
    this.store = seed.store
    this.backend = seed.backend
    this.atoms = seed.atoms
    this.dom = seed.dom
  }
}

interface GridRuntimeHost extends GridRuntime {}

/** Attach one explicitly typed feature API to the local composition host. */
export function installGridFeature<Runtime extends object, Feature extends object>(
  runtime: Runtime,
  feature: Feature,
): Feature {
  Object.assign(runtime, feature)
  return feature
}

export function createGridRuntime(seed: GridRuntimeBase): GridRuntime {
  return new GridRuntimeHost(seed)
}
