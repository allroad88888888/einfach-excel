import { atom } from '@einfach/core'
import type { VisibleProjectionResult } from '../contracts'

export type SplitWindowMode = 'none' | 'horizontal' | 'vertical' | 'quad'

export type SplitPaneId = 'bottom' | 'right' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface SplitPaneSize {
  readonly width: number
  readonly height: number
}

export interface SheetSplitWindow {
  /** Horizontal split divider position in [0.15, 0.85], or null when unsplit vertically. */
  readonly horizontalRatio: number | null
  /** Vertical split divider position in [0.15, 0.85], or null when unsplit horizontally. */
  readonly verticalRatio: number | null
  /** Independent vertical scroll offset for bottom split panes (px). */
  readonly secondaryScrollTop: number
  /** Independent horizontal scroll offset for right split panes (px). */
  readonly secondaryScrollLeft: number
}

export const EMPTY_SPLIT_WINDOW: SheetSplitWindow = Object.freeze({
  horizontalRatio: null,
  verticalRatio: null,
  secondaryScrollTop: 0,
  secondaryScrollLeft: 0,
})

/** Per-sheet split-window layout state; session-only view state like zoom. */
export const splitWindowBySheetAtom = atom<Readonly<Record<string, SheetSplitWindow>>>({})
splitWindowBySheetAtom.debugLabel = 'spreadsheet.viewport.splitWindowBySheet'

/** Bounded Rust display snapshots cached for secondary split panes. */
export const splitPaneProjectionsAtom = atom<
  Readonly<Partial<Record<SplitPaneId, VisibleProjectionResult>>>
>({})
splitPaneProjectionsAtom.debugLabel = 'spreadsheet.viewport.splitPaneProjections'

/** Measured client dimensions for secondary split panes. */
export const splitPaneSizesAtom = atom<Readonly<Partial<Record<SplitPaneId, SplitPaneSize>>>>({})
splitPaneSizesAtom.debugLabel = 'spreadsheet.viewport.splitPaneSizes'

/** Per-store generation counters used to drop stale split-pane projection reads. */
export const splitPaneGenerationsAtom = atom<Readonly<Partial<Record<SplitPaneId, number>>>>({})
splitPaneGenerationsAtom.debugLabel = 'spreadsheet.viewport.splitPaneGenerations'

/** Secondary split pane that last received pointer/double-click focus (null = primary pane). */
export const activeSplitPaneAtom = atom<SplitPaneId | null>(null)
activeSplitPaneAtom.debugLabel = 'spreadsheet.viewport.activeSplitPane'

export function splitWindowModeOf(state: SheetSplitWindow): SplitWindowMode {
  const hasH = state.horizontalRatio !== null
  const hasV = state.verticalRatio !== null
  if (hasH && hasV) return 'quad'
  if (hasH) return 'horizontal'
  if (hasV) return 'vertical'
  return 'none'
}

export function resolveSplitPaneForMode(
  mode: SplitWindowMode,
  pane: SplitPaneId | null,
): SplitPaneId | null {
  if (mode === 'none' || pane === null) return null
  if (mode === 'horizontal') {
    return pane === 'bottom' || pane === 'bottom-left' || pane === 'bottom-right'
      ? 'bottom'
      : null
  }
  if (mode === 'vertical') {
    return pane === 'right' || pane === 'top-right' || pane === 'bottom-right'
      ? 'right'
      : null
  }
  return pane === 'top-right' || pane === 'bottom-left' || pane === 'bottom-right'
    ? pane
    : null
}

export const resetSplitWindowStateAtom = atom(null, (_get, set): void => {
  set(splitWindowBySheetAtom, {})
  set(splitPaneProjectionsAtom, {})
  set(splitPaneSizesAtom, {})
  set(splitPaneGenerationsAtom, {})
  set(activeSplitPaneAtom, null)
})
resetSplitWindowStateAtom.debugLabel = 'spreadsheet.viewport.resetSplitWindowState'

export const clearSheetSplitWindowAtom = atom(null, (get, set, sheetId: string): void => {
  set(activeSplitPaneAtom, null)
  const current = get(splitWindowBySheetAtom)
  if (!(sheetId in current)) return
  const next = { ...current }
  delete next[sheetId]
  set(splitWindowBySheetAtom, next)
  set(splitPaneProjectionsAtom, {})
})
clearSheetSplitWindowAtom.debugLabel = 'spreadsheet.viewport.clearSplitWindow'
