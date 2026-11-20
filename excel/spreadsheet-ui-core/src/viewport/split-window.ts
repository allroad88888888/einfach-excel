import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { readWorkbookDisplayRangeAtom } from '../host/display-range'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { CellRange } from '../shared'
import { getAxisOffsetForIndex } from './axis-geometry'
import { runFreezeAtom } from './freeze-command'
import { viewportGeometrySizesAtom } from './geometry-sizes'
import { viewportMetricsAtom } from './metrics'
import { projectedFreezeAtom } from './projected-freeze'
import {
  activeSplitPaneAtom,
  clearSheetSplitWindowAtom,
  EMPTY_SPLIT_WINDOW,
  resetSplitWindowStateAtom,
  resolveSplitPaneForMode,
  splitPaneGenerationsAtom,
  splitPaneProjectionsAtom,
  splitPaneSizesAtom,
  splitWindowBySheetAtom,
  splitWindowModeOf,
  type SheetSplitWindow,
  type SplitPaneId,
  type SplitPaneSize,
  type SplitWindowMode,
} from './split-window-state'

export {
  activeSplitPaneAtom,
  clearSheetSplitWindowAtom,
  EMPTY_SPLIT_WINDOW,
  resetSplitWindowStateAtom,
  resolveSplitPaneForMode,
  splitPaneProjectionsAtom,
  splitPaneSizesAtom,
  splitWindowBySheetAtom,
  splitWindowModeOf,
  type SheetSplitWindow,
  type SplitPaneId,
  type SplitPaneSize,
  type SplitWindowMode,
}

export const MIN_SPLIT_RATIO = 0.15
export const MAX_SPLIT_RATIO = 0.85
export const DEFAULT_SPLIT_RATIO = 0.5

export type SplitWindowAction = 'selection' | 'horizontal' | 'vertical' | 'clear'

export interface ActiveSplitWindowState extends SheetSplitWindow {
  readonly sheetId: string | null
  readonly mode: SplitWindowMode
}

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, Math.round(ratio * 1000) / 1000))
}

/** Active worksheet split-window configuration. */
export const activeSheetSplitWindowAtom = atom((get): ActiveSplitWindowState => {
  const sheetId = get(activeWorkbookSheetAtom)?.id ?? null
  const entry = sheetId === null ? undefined : get(splitWindowBySheetAtom)[sheetId]
  const state = entry ?? EMPTY_SPLIT_WINDOW
  return {
    ...state,
    sheetId,
    mode: splitWindowModeOf(state),
  }
})
activeSheetSplitWindowAtom.debugLabel = 'spreadsheet.viewport.activeSplitWindow'

function computeSelectionRatio(offset: number, scroll: number, viewportSize: number): number {
  if (viewportSize <= 0) return DEFAULT_SPLIT_RATIO
  const relative = (offset - scroll) / viewportSize
  if (relative <= MIN_SPLIT_RATIO || relative >= MAX_SPLIT_RATIO) return DEFAULT_SPLIT_RATIO
  return clampSplitRatio(relative)
}

/** Configures split panes for the active sheet; unfreezes first when mutually exclusive. */
export const runSplitWindowAtom = atom(
  null,
  async (get, set, action: SplitWindowAction): Promise<boolean> => {
    if (get(editingSessionAtom).source !== null) return false
    const sheet = get(activeWorkbookSheetAtom)
    if (!sheet) return false
    if (action === 'clear') {
      set(clearSheetSplitWindowAtom, sheet.id)
      return true
    }
    const freeze = get(projectedFreezeAtom)
    if (freeze && freeze.sheetId === sheet.id && (freeze.rows > 0 || freeze.cols > 0)) {
      const unfrozen = await set(runFreezeAtom, 'unfreeze')
      if (!unfrozen) return false
    }
    const metrics = get(viewportMetricsAtom)
    const sizes = get(viewportGeometrySizesAtom)
    const selection = get(selectionSnapshotAtom)
    const active = selection.selection.sheetId === sheet.id
      ? selection.activeCell
      : { row: 0, col: 0 }
    const rowHeights = sizes.rowHeightsBySheet[sheet.id]
    const colWidths = sizes.colWidthsBySheet[sheet.id]
    const rowOffset = getAxisOffsetForIndex(
      active.row,
      sheet.rowCount,
      metrics.rowHeight,
      rowHeights,
    )
    const colOffset = getAxisOffsetForIndex(
      active.col,
      sheet.colCount,
      metrics.colWidth,
      colWidths,
    )

    let horizontalRatio: number | null = null
    let verticalRatio: number | null = null
    let secondaryScrollTop = metrics.scrollTop
    let secondaryScrollLeft = metrics.scrollLeft

    if (action === 'horizontal') {
      horizontalRatio = DEFAULT_SPLIT_RATIO
      secondaryScrollTop = Math.max(
        0,
        metrics.scrollTop + Math.round(metrics.viewportHeight * DEFAULT_SPLIT_RATIO),
      )
    } else if (action === 'vertical') {
      verticalRatio = DEFAULT_SPLIT_RATIO
      secondaryScrollLeft = Math.max(
        0,
        metrics.scrollLeft + Math.round(metrics.viewportWidth * DEFAULT_SPLIT_RATIO),
      )
    } else if (action === 'selection') {
      if (active.row === 0 && active.col === 0) {
        horizontalRatio = DEFAULT_SPLIT_RATIO
        verticalRatio = DEFAULT_SPLIT_RATIO
        secondaryScrollTop = Math.max(
          0,
          metrics.scrollTop + Math.round(metrics.viewportHeight * DEFAULT_SPLIT_RATIO),
        )
        secondaryScrollLeft = Math.max(
          0,
          metrics.scrollLeft + Math.round(metrics.viewportWidth * DEFAULT_SPLIT_RATIO),
        )
      } else {
        if (active.row > 0) {
          horizontalRatio = computeSelectionRatio(
            rowOffset,
            metrics.scrollTop,
            metrics.viewportHeight,
          )
          secondaryScrollTop = Math.max(0, rowOffset)
        }
        if (active.col > 0) {
          verticalRatio = computeSelectionRatio(
            colOffset,
            metrics.scrollLeft,
            metrics.viewportWidth,
          )
          secondaryScrollLeft = Math.max(0, colOffset)
        }
      }
    }

    set(splitWindowBySheetAtom, {
      ...get(splitWindowBySheetAtom),
      [sheet.id]: {
        horizontalRatio,
        verticalRatio,
        secondaryScrollTop,
        secondaryScrollLeft,
      },
    })
    return true
  },
)
runSplitWindowAtom.debugLabel = 'spreadsheet.viewport.runSplitWindow'

export interface SetSplitWindowRatioInput {
  readonly axis: 'horizontal' | 'vertical'
  /** Clamped into [0.15, 0.85], or null to remove that axis split. */
  readonly ratio: number | null
}

/** Updates one split divider ratio (e.g. via drag or keyboard), or clears that axis when null. */
export const setSplitWindowRatioAtom = atom(
  null,
  (get, set, input: SetSplitWindowRatioInput): void => {
    const sheetId = get(activeWorkbookSheetAtom)?.id
    if (!sheetId) return
    const current = get(splitWindowBySheetAtom)[sheetId]
    if (!current) return
    const value = input.ratio === null ? null : clampSplitRatio(input.ratio)
    const next: SheetSplitWindow = input.axis === 'horizontal'
      ? { ...current, horizontalRatio: value }
      : { ...current, verticalRatio: value }
    if (splitWindowModeOf(next) === 'none') {
      set(clearSheetSplitWindowAtom, sheetId)
      return
    }
    if (
      next.horizontalRatio === current.horizontalRatio &&
      next.verticalRatio === current.verticalRatio
    ) {
      return
    }
    if (input.ratio === null) {
      set(activeSplitPaneAtom, null)
    }
    set(splitWindowBySheetAtom, { ...get(splitWindowBySheetAtom), [sheetId]: next })
  },
)
setSplitWindowRatioAtom.debugLabel = 'spreadsheet.viewport.setSplitWindowRatio'

export interface SetSplitWindowScrollInput {
  readonly scrollTop?: number
  readonly scrollLeft?: number
}

/** Updates the independent scroll coordinates for secondary split panes on the active sheet. */
export const setSplitWindowScrollAtom = atom(
  null,
  (get, set, input: SetSplitWindowScrollInput): void => {
    const sheetId = get(activeWorkbookSheetAtom)?.id
    if (!sheetId) return
    const current = get(splitWindowBySheetAtom)[sheetId]
    if (!current) return
    const nextTop =
      input.scrollTop === undefined || !Number.isFinite(input.scrollTop)
        ? current.secondaryScrollTop
        : Math.max(0, Math.round(input.scrollTop))
    const nextLeft =
      input.scrollLeft === undefined || !Number.isFinite(input.scrollLeft)
        ? current.secondaryScrollLeft
        : Math.max(0, Math.round(input.scrollLeft))
    if (nextTop === current.secondaryScrollTop && nextLeft === current.secondaryScrollLeft) return
    set(splitWindowBySheetAtom, {
      ...get(splitWindowBySheetAtom),
      [sheetId]: {
        ...current,
        secondaryScrollTop: nextTop,
        secondaryScrollLeft: nextLeft,
      },
    })
  },
)
setSplitWindowScrollAtom.debugLabel = 'spreadsheet.viewport.setSplitWindowScroll'

export interface SetSplitPaneSizeInput {
  readonly pane: SplitPaneId
  readonly width: number
  readonly height: number
}

/** Records measured viewport size for a secondary split pane. */
export const setSplitPaneSizeAtom = atom(null, (get, set, input: SetSplitPaneSizeInput): void => {
  const width = Math.max(1, Math.round(input.width))
  const height = Math.max(1, Math.round(input.height))
  const current = get(splitPaneSizesAtom)
  const existing = current[input.pane]
  if (existing && existing.width === width && existing.height === height) return
  set(splitPaneSizesAtom, { ...current, [input.pane]: { width, height } })
})
setSplitPaneSizeAtom.debugLabel = 'spreadsheet.viewport.setSplitPaneSize'

export interface RunSplitPaneProjectionInput {
  readonly pane: SplitPaneId
  readonly sheetId: string
  readonly range: CellRange
}

/** Fetches a bounded Rust display projection for one secondary split pane. */
export const runSplitPaneProjectionAtom = atom(
  null,
  async (get, set, input: RunSplitPaneProjectionInput): Promise<boolean> => {
    const gens = get(splitPaneGenerationsAtom)
    const nextGen = (gens[input.pane] ?? 0) + 1
    set(splitPaneGenerationsAtom, { ...gens, [input.pane]: nextGen })
    const outcome = await set(readWorkbookDisplayRangeAtom, {
      sheetId: input.sheetId,
      range: input.range,
    })
    if (get(splitPaneGenerationsAtom)[input.pane] !== nextGen) return false
    if (get(activeWorkbookSheetAtom)?.id !== input.sheetId) return false
    if (outcome.status !== 'ok') return false
    set(splitPaneProjectionsAtom, {
      ...get(splitPaneProjectionsAtom),
      [input.pane]: outcome.snapshot,
    })
    return true
  },
)
runSplitPaneProjectionAtom.debugLabel = 'spreadsheet.viewport.runSplitPaneProjection'
