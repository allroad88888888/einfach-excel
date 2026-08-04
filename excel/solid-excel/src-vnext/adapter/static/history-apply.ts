// 一句话：施加一个增量，并回传对称的反向增量。

import {
  cloneCell,
  cloneConditionalFormatRuleEntry,
  cloneFilterSortState,
  cloneFormat,
  cloneNamedRange,
} from '@einfach/spreadsheet-ui-core'
import type { SheetDelta, StateDelta } from './history-delta'
import { captureFullSheet, cloneRangeFormatLayers, restoreFullSheet } from './sheet-snapshot'
import type { StaticBackendState } from './state'
import { getDimensionMap, getOrCreateCellFormats, getOrCreateSheetCells } from './state'

function applyEntryDelta<V>(
  live: Map<string, V>,
  recorded: Map<string, V | null>,
  cloneValue: (value: V) => V,
): Map<string, V | null> {
  const inverse = new Map<string, V | null>()
  for (const [key, before] of recorded) {
    const current = live.get(key)
    inverse.set(key, current === undefined ? null : cloneValue(current))
    if (before === null) {
      live.delete(key)
    } else {
      live.set(key, before)
    }
  }
  return inverse
}

function applyDimensionDelta(
  live: Map<number, number>,
  recorded: Map<number, number | null>,
): Map<number, number | null> {
  const inverse = new Map<number, number | null>()
  for (const [index, before] of recorded) {
    inverse.set(index, live.get(index) ?? null)
    if (before === null) {
      live.delete(index)
    } else {
      live.set(index, before)
    }
  }
  return inverse
}

function applyHiddenIndexDelta(
  hiddenBySheetId: Map<string, Set<number>>,
  sheetId: string,
  recorded: Map<number, boolean>,
): Map<number, boolean> {
  const live = hiddenBySheetId.get(sheetId) ?? new Set<number>()
  const inverse = new Map<number, boolean>()
  for (const [index, wasHidden] of recorded) {
    inverse.set(index, live.has(index))
    if (wasHidden) {
      live.add(index)
    } else {
      live.delete(index)
    }
  }
  if (live.size === 0) {
    hiddenBySheetId.delete(sheetId)
  } else {
    hiddenBySheetId.set(sheetId, live)
  }
  return inverse
}

/**
 * Apply a delta (restore its before-values) and return the symmetric
 * inverse delta capturing the values being overwritten — undo produces
 * the redo entry and vice versa.
 */
export function applyStateDelta(state: StaticBackendState, delta: StateDelta): StateDelta {
  const inverse: StateDelta = { sheetDeltas: new Map() }

  if (delta.sheetsMeta) {
    inverse.sheetsMeta = state.sheets.map((s) => ({ ...s }))
    state.sheets = delta.sheetsMeta.map((s) => ({ ...s }))
  }
  if (delta.namedRanges) {
    inverse.namedRanges = state.namedRanges.map(cloneNamedRange)
    state.namedRanges = delta.namedRanges.map(cloneNamedRange)
  }
  for (const [sheetId, sheet] of delta.sheetDeltas) {
    const inverseSheet: SheetDelta = {}

    if (sheet.fullSheet) {
      inverseSheet.fullSheet = captureFullSheet(state, sheetId)
      restoreFullSheet(state, sheetId, sheet.fullSheet)
    } else {
      if (sheet.cells) {
        inverseSheet.cells = applyEntryDelta(
          getOrCreateSheetCells(state, sheetId),
          sheet.cells,
          cloneCell,
        )
      }
      if (sheet.cellFormats) {
        inverseSheet.cellFormats = applyEntryDelta(
          getOrCreateCellFormats(state, sheetId),
          sheet.cellFormats,
          cloneFormat,
        )
      }
      if (sheet.rangeFormats) {
        inverseSheet.rangeFormats = cloneRangeFormatLayers(
          state.rangeFormatsBySheetId.get(sheetId) ?? [],
        )
        state.rangeFormatsBySheetId.set(sheetId, cloneRangeFormatLayers(sheet.rangeFormats))
      }
      if (sheet.conditionalFormatRules) {
        inverseSheet.conditionalFormatRules = (
          state.conditionalFormatRulesBySheetId.get(sheetId) ?? []
        ).map(cloneConditionalFormatRuleEntry)
        state.conditionalFormatRulesBySheetId.set(
          sheetId,
          sheet.conditionalFormatRules.map(cloneConditionalFormatRuleEntry),
        )
      }
      if (sheet.mergeRanges) {
        inverseSheet.mergeRanges = (state.mergeRangesBySheetId.get(sheetId) ?? []).map((r) => ({
          ...r,
        }))
        state.mergeRangesBySheetId.set(
          sheetId,
          sheet.mergeRanges.map((r) => ({ ...r })),
        )
      }
      if (sheet.rowHeights) {
        inverseSheet.rowHeights = applyDimensionDelta(
          getDimensionMap(state.rowHeightsBySheetId, sheetId),
          sheet.rowHeights,
        )
      }
      if (sheet.colWidths) {
        inverseSheet.colWidths = applyDimensionDelta(
          getDimensionMap(state.colWidthsBySheetId, sheetId),
          sheet.colWidths,
        )
      }
      if (sheet.hiddenRows) {
        inverseSheet.hiddenRows = applyHiddenIndexDelta(
          state.hiddenRowsBySheetId,
          sheetId,
          sheet.hiddenRows,
        )
      }
      if (sheet.hiddenCols) {
        inverseSheet.hiddenCols = applyHiddenIndexDelta(
          state.hiddenColsBySheetId,
          sheetId,
          sheet.hiddenCols,
        )
      }
      if (sheet.freeze !== undefined) {
        const current = state.freezeBySheetId.get(sheetId)
        inverseSheet.freeze = current ? { ...current } : null
        if (sheet.freeze === null) {
          state.freezeBySheetId.delete(sheetId)
        } else {
          state.freezeBySheetId.set(sheetId, { ...sheet.freeze })
        }
      }
      if (sheet.filter !== undefined) {
        // Whole-filter swap (rules + derived hidden rows) — REPLACE semantics,
        // the static twin of the worker's `restoreFilters`. Capture the current
        // filter as the symmetric inverse, then restore the recorded before.
        const currentRules = state.filterSortBySheetId.get(sheetId)
        const currentHidden = state.filterHiddenRowsBySheetId.get(sheetId)
        inverseSheet.filter = {
          rules: currentRules ? cloneFilterSortState(currentRules) : null,
          hiddenRows: currentHidden ? new Set(currentHidden) : null,
        }
        if (sheet.filter.rules === null) {
          state.filterSortBySheetId.delete(sheetId)
        } else {
          state.filterSortBySheetId.set(sheetId, cloneFilterSortState(sheet.filter.rules))
        }
        if (sheet.filter.hiddenRows === null || sheet.filter.hiddenRows.size === 0) {
          state.filterHiddenRowsBySheetId.delete(sheetId)
        } else {
          state.filterHiddenRowsBySheetId.set(sheetId, new Set(sheet.filter.hiddenRows))
        }
      }
    }

    inverse.sheetDeltas.set(sheetId, inverseSheet)
  }

  return inverse
}
