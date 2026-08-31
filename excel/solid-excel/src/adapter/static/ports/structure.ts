// 一句话：行列插入删除端口。

import type { StaticSpreadsheetBackend } from '../backend-contract'
import { shiftFilterHiddenRows, shiftHiddenIndexSet } from '../hidden-rows'
import { beginUndoableMutation, recordFullSheetBefore } from '../history-record'
import { structuralMutationResult } from '../mutation-result'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import {
  getDimensionMap,
  getOrCreateCellFormats,
  getOrCreateRangeFormats,
  getOrCreateSheetCells,
} from '../state'
import {
  shiftColumns,
  shiftDimensionMap,
  shiftFreezeConfig,
  shiftMergeRanges,
  shiftRows,
} from '../structural-shift'
import { applyTableShift } from '../tables/geometry-shift'

export function createStructurePorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'insertRows' | 'deleteRows' | 'insertColumns' | 'deleteColumns'> {
  return {
    async insertRows(request) {
      beginUndoableMutation(state)
      recordFullSheetBefore(state, request.sheetId)
      shiftRows(
        getOrCreateSheetCells(state, request.sheetId),
        getOrCreateCellFormats(state, request.sheetId),
        getOrCreateRangeFormats(state, request.sheetId),
        request.rowIndex,
        request.count,
        1,
      )
      shiftDimensionMap(
        getDimensionMap(state.rowHeightsBySheetId, request.sheetId),
        request.rowIndex,
        request.count,
        1,
      )
      const hiddenRows = state.hiddenRowsBySheetId.get(request.sheetId)
      if (hiddenRows) shiftHiddenIndexSet(hiddenRows, request.rowIndex, request.count, 1)
      shiftFilterHiddenRows(state, request.sheetId, request.rowIndex, request.count, 1)
      shiftMergeRanges(state, request.sheetId, 'row', request.rowIndex, request.count, 1)
      shiftFreezeConfig(state, request.sheetId, 'row', request.rowIndex, request.count, 1)
      applyTableShift(state, request.sheetId, 'row', request.rowIndex, request.count, 1)
      state.revision = bumpRevision(state.revision)
      return structuralMutationResult(request, state.revision)
    },
    async deleteRows(request) {
      beginUndoableMutation(state)
      recordFullSheetBefore(state, request.sheetId)
      shiftRows(
        getOrCreateSheetCells(state, request.sheetId),
        getOrCreateCellFormats(state, request.sheetId),
        getOrCreateRangeFormats(state, request.sheetId),
        request.rowIndex,
        request.count,
        -1,
      )
      shiftDimensionMap(
        getDimensionMap(state.rowHeightsBySheetId, request.sheetId),
        request.rowIndex,
        request.count,
        -1,
      )
      const hiddenRows = state.hiddenRowsBySheetId.get(request.sheetId)
      if (hiddenRows) {
        shiftHiddenIndexSet(hiddenRows, request.rowIndex, request.count, -1)
        if (hiddenRows.size === 0) state.hiddenRowsBySheetId.delete(request.sheetId)
      }
      shiftFilterHiddenRows(state, request.sheetId, request.rowIndex, request.count, -1)
      shiftMergeRanges(state, request.sheetId, 'row', request.rowIndex, request.count, -1)
      shiftFreezeConfig(state, request.sheetId, 'row', request.rowIndex, request.count, -1)
      applyTableShift(state, request.sheetId, 'row', request.rowIndex, request.count, -1)
      state.revision = bumpRevision(state.revision)
      return structuralMutationResult(request, state.revision)
    },
    async insertColumns(request) {
      beginUndoableMutation(state)
      recordFullSheetBefore(state, request.sheetId)
      shiftColumns(
        getOrCreateSheetCells(state, request.sheetId),
        getOrCreateCellFormats(state, request.sheetId),
        getOrCreateRangeFormats(state, request.sheetId),
        request.colIndex,
        request.count,
        1,
      )
      shiftDimensionMap(
        getDimensionMap(state.colWidthsBySheetId, request.sheetId),
        request.colIndex,
        request.count,
        1,
      )
      const hiddenCols = state.hiddenColsBySheetId.get(request.sheetId)
      if (hiddenCols) shiftHiddenIndexSet(hiddenCols, request.colIndex, request.count, 1)
      shiftMergeRanges(state, request.sheetId, 'column', request.colIndex, request.count, 1)
      shiftFreezeConfig(state, request.sheetId, 'column', request.colIndex, request.count, 1)
      applyTableShift(state, request.sheetId, 'column', request.colIndex, request.count, 1)
      state.revision = bumpRevision(state.revision)
      return structuralMutationResult(request, state.revision)
    },
    async deleteColumns(request) {
      beginUndoableMutation(state)
      recordFullSheetBefore(state, request.sheetId)
      shiftColumns(
        getOrCreateSheetCells(state, request.sheetId),
        getOrCreateCellFormats(state, request.sheetId),
        getOrCreateRangeFormats(state, request.sheetId),
        request.colIndex,
        request.count,
        -1,
      )
      shiftDimensionMap(
        getDimensionMap(state.colWidthsBySheetId, request.sheetId),
        request.colIndex,
        request.count,
        -1,
      )
      const hiddenCols = state.hiddenColsBySheetId.get(request.sheetId)
      if (hiddenCols) {
        shiftHiddenIndexSet(hiddenCols, request.colIndex, request.count, -1)
        if (hiddenCols.size === 0) state.hiddenColsBySheetId.delete(request.sheetId)
      }
      shiftMergeRanges(state, request.sheetId, 'column', request.colIndex, request.count, -1)
      shiftFreezeConfig(state, request.sheetId, 'column', request.colIndex, request.count, -1)
      applyTableShift(state, request.sheetId, 'column', request.colIndex, request.count, -1)
      state.revision = bumpRevision(state.revision)
      return structuralMutationResult(request, state.revision)
    },
  }
}
