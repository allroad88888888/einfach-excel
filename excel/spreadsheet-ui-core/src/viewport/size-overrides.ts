import { atom, type Setter } from '@einfach/core'
import type {
  SetViewportColumnWidthInput,
  SetViewportRowHeightInput,
  ViewportSizeOverrideState,
} from './types'

export const MIN_VIEWPORT_ROW_HEIGHT = 16
export const MAX_VIEWPORT_ROW_HEIGHT = 512
export const MIN_VIEWPORT_COL_WIDTH = 40
export const MAX_VIEWPORT_COL_WIDTH = 1024

export const DEFAULT_VIEWPORT_SIZE_OVERRIDES: ViewportSizeOverrideState = {
  rowHeightsBySheet: {},
  colWidthsBySheet: {},
}

function normalizeDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeFallbackDimension(value: number, fallback: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : fallback))
}

function normalizeSparseIndex(value: number): number | null {
  return Number.isInteger(value) && value >= 0 ? value : null
}

export function getViewportRowHeight(
  state: ViewportSizeOverrideState,
  sheetId: string,
  rowIndex: number,
  fallback: number,
): number {
  const row = normalizeSparseIndex(rowIndex)
  if (row === null) return normalizeFallbackDimension(fallback, 24)
  return state.rowHeightsBySheet[sheetId]?.[String(row)] ?? normalizeFallbackDimension(fallback, 24)
}

export function getViewportColumnWidth(
  state: ViewportSizeOverrideState,
  sheetId: string,
  colIndex: number,
  fallback: number,
): number {
  const col = normalizeSparseIndex(colIndex)
  if (col === null) return normalizeFallbackDimension(fallback, 96)
  return state.colWidthsBySheet[sheetId]?.[String(col)] ?? normalizeFallbackDimension(fallback, 96)
}

export function setViewportRowHeight(
  state: ViewportSizeOverrideState,
  input: SetViewportRowHeightInput,
): ViewportSizeOverrideState {
  const row = normalizeSparseIndex(input.rowIndex)
  if (row === null || input.sheetId.length === 0) return state
  return {
    ...state,
    rowHeightsBySheet: {
      ...state.rowHeightsBySheet,
      [input.sheetId]: {
        ...state.rowHeightsBySheet[input.sheetId],
        [String(row)]: normalizeDimension(
          input.heightPx,
          MIN_VIEWPORT_ROW_HEIGHT,
          MAX_VIEWPORT_ROW_HEIGHT,
        ),
      },
    },
  }
}

export function setViewportColumnWidth(
  state: ViewportSizeOverrideState,
  input: SetViewportColumnWidthInput,
): ViewportSizeOverrideState {
  const col = normalizeSparseIndex(input.colIndex)
  if (col === null || input.sheetId.length === 0) return state
  return {
    ...state,
    colWidthsBySheet: {
      ...state.colWidthsBySheet,
      [input.sheetId]: {
        ...state.colWidthsBySheet[input.sheetId],
        [String(col)]: normalizeDimension(
          input.widthPx,
          MIN_VIEWPORT_COL_WIDTH,
          MAX_VIEWPORT_COL_WIDTH,
        ),
      },
    },
  }
}

export const viewportSizeOverridesAtom = atom<ViewportSizeOverrideState>(
  DEFAULT_VIEWPORT_SIZE_OVERRIDES,
)
viewportSizeOverridesAtom.debugLabel = 'spreadsheet.viewport.sizeOverrides'

export const viewportMetadataProjectionIdentityAtom = atom<Readonly<object>>(Object.freeze({}))
viewportMetadataProjectionIdentityAtom.debugLabel =
  'spreadsheet.viewport.metadataProjectionIdentity'

export function rotateViewportMetadataProjectionIdentity(set: Setter): void {
  set(viewportMetadataProjectionIdentityAtom, Object.freeze({}))
}

export const setViewportRowHeightAtom = atom(
  (get) => get(viewportSizeOverridesAtom),
  (get, set, input: SetViewportRowHeightInput): ViewportSizeOverrideState => {
    const state = get(viewportSizeOverridesAtom)
    const next = setViewportRowHeight(state, input)
    set(viewportSizeOverridesAtom, next)
    if (next !== state) rotateViewportMetadataProjectionIdentity(set)
    return next
  },
)
setViewportRowHeightAtom.debugLabel = 'spreadsheet.viewport.setRowHeight'

export const setViewportColumnWidthAtom = atom(
  (get) => get(viewportSizeOverridesAtom),
  (get, set, input: SetViewportColumnWidthInput): ViewportSizeOverrideState => {
    const state = get(viewportSizeOverridesAtom)
    const next = setViewportColumnWidth(state, input)
    set(viewportSizeOverridesAtom, next)
    if (next !== state) rotateViewportMetadataProjectionIdentity(set)
    return next
  },
)
setViewportColumnWidthAtom.debugLabel = 'spreadsheet.viewport.setColumnWidth'
