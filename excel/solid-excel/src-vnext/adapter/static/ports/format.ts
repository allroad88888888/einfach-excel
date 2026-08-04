// 一句话：格式与行高列宽端口。

import type {
  SetColumnWidthRequest,
  SetFormatRangeRequest,
  SetRowHeightRequest,
} from '@einfach/spreadsheet-ui-core'
import { normalizeDimensionSize, normalizeFormat } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import {
  beginUndoableMutation,
  recordCellFormatsBeforeInRange,
  recordColWidthBefore,
  recordRangeFormatsBefore,
  recordRowHeightBefore,
} from '../history-record'
import { clearCellFormatsInRange } from '../range-clear'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import { getDimensionMap, getOrCreateCellFormats, getOrCreateRangeFormats } from '../state'

export function createFormatPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'setFormatRange' | 'setRowHeight' | 'setColumnWidth'> {
  return {
    async setFormatRange(request: SetFormatRangeRequest) {
      beginUndoableMutation(state)
      recordCellFormatsBeforeInRange(state, request.sheetId, request.range)
      recordRangeFormatsBefore(state, request.sheetId)
      const cellFormats = getOrCreateCellFormats(state, request.sheetId)
      const rangeFormats = getOrCreateRangeFormats(state, request.sheetId)
      clearCellFormatsInRange(cellFormats, request.range)
      rangeFormats.push({
        range: { ...request.range },
        format: normalizeFormat(request.format) ?? {},
      })
      state.revision = bumpRevision(state.revision)

      return {
        kind: request.kind,
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        affectedRange: {
          rowStart: request.range.rowStart,
          rowEnd: request.range.rowEnd,
          colStart: request.range.colStart,
          colEnd: request.range.colEnd,
        },
      }
    },

    async setRowHeight(request: SetRowHeightRequest) {
      beginUndoableMutation(state)
      recordRowHeightBefore(state, request.sheetId, request.rowIndex)
      getDimensionMap(state.rowHeightsBySheetId, request.sheetId).set(
        request.rowIndex,
        normalizeDimensionSize(request.heightPx),
      )
      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
    async setColumnWidth(request: SetColumnWidthRequest) {
      beginUndoableMutation(state)
      recordColWidthBefore(state, request.sheetId, request.colIndex)
      getDimensionMap(state.colWidthsBySheetId, request.sheetId).set(
        request.colIndex,
        normalizeDimensionSize(request.widthPx),
      )
      state.revision = bumpRevision(state.revision)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
  }
}
