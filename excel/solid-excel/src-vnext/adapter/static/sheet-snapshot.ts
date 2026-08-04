// 一句话：一张 sheet 全部可撤销事实的深拷贝与整体还原。

import type { RangeFormatLayer } from '@einfach/spreadsheet-ui-core'
import {
  cloneCell,
  cloneConditionalFormatRuleEntry,
  cloneFormat,
} from '@einfach/spreadsheet-ui-core'
import type { FullSheetCapture } from './history-delta'
import type { StaticBackendState } from './state'

export function cloneRangeFormatLayers(layers: readonly RangeFormatLayer[]): RangeFormatLayer[] {
  return layers.map((layer) => ({ range: { ...layer.range }, format: cloneFormat(layer.format) }))
}

export function captureFullSheet(state: StaticBackendState, sheetId: string): FullSheetCapture {
  return {
    cells: new Map(
      Array.from(state.cellsBySheet.get(sheetId) ?? [], ([key, cell]) => [key, cloneCell(cell)]),
    ),
    cellFormats: new Map(
      Array.from(state.cellFormatsBySheetId.get(sheetId) ?? [], ([key, format]) => [
        key,
        cloneFormat(format),
      ]),
    ),
    rangeFormats: cloneRangeFormatLayers(state.rangeFormatsBySheetId.get(sheetId) ?? []),
    conditionalFormatRules: (state.conditionalFormatRulesBySheetId.get(sheetId) ?? []).map(
      cloneConditionalFormatRuleEntry,
    ),
    mergeRanges: (state.mergeRangesBySheetId.get(sheetId) ?? []).map((r) => ({ ...r })),
    rowHeights: new Map(state.rowHeightsBySheetId.get(sheetId) ?? []),
    colWidths: new Map(state.colWidthsBySheetId.get(sheetId) ?? []),
    hiddenRows: new Set(state.hiddenRowsBySheetId.get(sheetId) ?? []),
    hiddenCols: new Set(state.hiddenColsBySheetId.get(sheetId) ?? []),
    filterHiddenRows: new Set(state.filterHiddenRowsBySheetId.get(sheetId) ?? []),
    freeze: state.freezeBySheetId.has(sheetId) ? { ...state.freezeBySheetId.get(sheetId)! } : null,
  }
}

export function restoreFullSheet(
  state: StaticBackendState,
  sheetId: string,
  capture: FullSheetCapture,
): void {
  // Ownership transfer is safe: a delta is applied at most once (popped
  // from its stack) and the symmetric inverse is captured separately.
  state.cellsBySheet.set(sheetId, capture.cells)
  state.cellFormatsBySheetId.set(sheetId, capture.cellFormats)
  state.rangeFormatsBySheetId.set(sheetId, capture.rangeFormats)
  state.conditionalFormatRulesBySheetId.set(sheetId, capture.conditionalFormatRules)
  state.mergeRangesBySheetId.set(sheetId, capture.mergeRanges)
  state.rowHeightsBySheetId.set(sheetId, capture.rowHeights)
  state.colWidthsBySheetId.set(sheetId, capture.colWidths)
  if (capture.hiddenRows.size === 0) {
    state.hiddenRowsBySheetId.delete(sheetId)
  } else {
    state.hiddenRowsBySheetId.set(sheetId, new Set(capture.hiddenRows))
  }
  if (capture.hiddenCols.size === 0) {
    state.hiddenColsBySheetId.delete(sheetId)
  } else {
    state.hiddenColsBySheetId.set(sheetId, new Set(capture.hiddenCols))
  }
  if (capture.filterHiddenRows.size === 0) {
    state.filterHiddenRowsBySheetId.delete(sheetId)
  } else {
    state.filterHiddenRowsBySheetId.set(sheetId, new Set(capture.filterHiddenRows))
  }
  if (capture.freeze === null) {
    state.freezeBySheetId.delete(sheetId)
  } else {
    state.freezeBySheetId.set(sheetId, { ...capture.freeze })
  }
}
