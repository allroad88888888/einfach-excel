import { atom, type Atom } from '@einfach/core'
import type {
  OpenToolbarDropdownInput, OpenToolbarPaletteInput, ToolbarActiveSurface,
  ToolbarIntent, ToolbarUiState,
} from './types'

/** 已有工具栏弹层状态的叶节点；颜色界面不加载旧格式传输/历史控制器。 */
export function createToolbarUiState(): ToolbarUiState {
  return Object.freeze({
    activeSurface: null,
  })
}

export function createToolbarSurfaceIntent(surface: ToolbarActiveSurface): ToolbarIntent {
  const snapshot = Object.freeze({ kind: surface.kind, id: surface.id })
  return Object.freeze({
    type: 'toolbar.surface.open',
    source: 'toolbar',
    surface: snapshot,
  })
}

const toolbarUiStateBackingAtom = atom<ToolbarUiState>(Object.freeze(createToolbarUiState()))
toolbarUiStateBackingAtom.debugLabel = 'spreadsheet.toolbar.uiBacking'

/** Read-only Core-owned toolbar surface state; adapters use typed commands for transitions. */
export const toolbarUiStateAtom: Atom<ToolbarUiState> = atom((get) =>
  get(toolbarUiStateBackingAtom),
)
toolbarUiStateAtom.debugLabel = 'spreadsheet.toolbar.ui'

export const toolbarIntentBackingAtom = atom<ToolbarIntent | null>(null)
toolbarIntentBackingAtom.debugLabel = 'spreadsheet.toolbar.intentBacking'

/** Read-only Core-owned intent projection; only typed toolbar commands write its backing atom. */
export const toolbarIntentAtom: Atom<ToolbarIntent | null> = atom((get) =>
  get(toolbarIntentBackingAtom),
)
toolbarIntentAtom.debugLabel = 'spreadsheet.toolbar.intent'

export const toolbarActiveSurfaceAtom: Atom<ToolbarActiveSurface | null> = atom(
  (get) => get(toolbarUiStateBackingAtom).activeSurface,
)
toolbarActiveSurfaceAtom.debugLabel = 'spreadsheet.toolbar.activeSurface'

export const openToolbarDropdownAtom = atom(
  (get) => get(toolbarUiStateBackingAtom),
  (_get, set, input: OpenToolbarDropdownInput) => {
    const surface: ToolbarActiveSurface = Object.freeze({
      kind: 'dropdown',
      id: input.dropdown,
    })

    set(
      toolbarUiStateBackingAtom,
      Object.freeze({
        activeSurface: surface,
      }),
    )
    set(toolbarIntentBackingAtom, createToolbarSurfaceIntent(surface))
    return surface
  },
)
openToolbarDropdownAtom.debugLabel = 'spreadsheet.toolbar.openDropdown'

export const openToolbarPaletteAtom = atom(
  (get) => get(toolbarUiStateBackingAtom),
  (_get, set, input: OpenToolbarPaletteInput) => {
    const surface: ToolbarActiveSurface = Object.freeze({
      kind: 'palette',
      id: input.palette,
    })

    set(
      toolbarUiStateBackingAtom,
      Object.freeze({
        activeSurface: surface,
      }),
    )
    set(toolbarIntentBackingAtom, createToolbarSurfaceIntent(surface))
    return surface
  },
)
openToolbarPaletteAtom.debugLabel = 'spreadsheet.toolbar.openPalette'

export const closeToolbarSurfaceAtom = atom(
  (get) => get(toolbarUiStateBackingAtom),
  (_get, set) => {
    set(
      toolbarUiStateBackingAtom,
      Object.freeze({
        activeSurface: null,
      }),
    )
    set(
      toolbarIntentBackingAtom,
      Object.freeze({
        type: 'toolbar.surface.close',
        source: 'toolbar',
      }),
    )
    return null
  },
)
closeToolbarSurfaceAtom.debugLabel = 'spreadsheet.toolbar.closeSurface'

export const clearToolbarIntentAtom = atom(
  (get) => get(toolbarIntentBackingAtom),
  (_get, set) => {
    set(toolbarIntentBackingAtom, null)
    return null
  },
)
clearToolbarIntentAtom.debugLabel = 'spreadsheet.toolbar.clearIntent'
