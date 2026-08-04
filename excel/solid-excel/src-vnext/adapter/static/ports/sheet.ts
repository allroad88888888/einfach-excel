// 一句话：sheet 生命周期端口。

import type { ReorderSheetRequest, SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'
import { reorderSheetMetadata } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import {
  beginUndoableMutation,
  recordFullSheetBefore,
  recordNamedRangesBefore,
  recordSheetsMetaBefore,
} from '../history-record'
import { sheetMutationResult } from '../mutation-result'
import { bumpRevision } from '../revision'
import {
  assertUniqueSheetName,
  cloneSheets,
  createNextSheetId,
  createNextSheetName,
  hasSameSheetOrder,
  normalizeSheetMutationName,
  reindexSheets,
} from '../sheet-metadata'
import type { StaticBackendState } from '../state'

export function createSheetPorts(
  state: StaticBackendState,
): Pick<
  StaticSpreadsheetBackend,
  'listSheets' | 'addSheet' | 'renameSheet' | 'deleteSheet' | 'reorderSheet'
> {
  return {
    async listSheets() {
      return {
        revision: state.revision,
        sheets: cloneSheets(state.sheets),
      }
    },

    async addSheet(request) {
      const name = normalizeSheetMutationName(request.name, createNextSheetName(state.sheets))
      assertUniqueSheetName(state.sheets, name)

      const createdSheet: SpreadsheetSheetMetadata = {
        id: createNextSheetId(state.sheets),
        name,
        index: state.sheets.length,
      }

      beginUndoableMutation(state)
      recordSheetsMetaBefore(state)
      state.sheets = [...state.sheets, createdSheet]
      state.cellsBySheet.set(createdSheet.id, new Map())
      state.cellFormatsBySheetId.set(createdSheet.id, new Map())
      state.rangeFormatsBySheetId.set(createdSheet.id, [])
      state.hiddenRowsBySheetId.set(createdSheet.id, new Set())
      state.hiddenColsBySheetId.set(createdSheet.id, new Set())
      state.freezeBySheetId.set(createdSheet.id, { rows: 0, cols: 0 })
      state.revision = bumpRevision(state.revision)

      return sheetMutationResult(state, request.requestId, {
        sheetId: createdSheet.id,
        activeSheetId: createdSheet.id,
        createdSheet,
      })
    },
    async renameSheet(request) {
      const name = normalizeSheetMutationName(request.name, '')
      if (name.length === 0) {
        throw new Error('sheet name cannot be empty')
      }

      const sheet = state.sheets.find((item) => item.id === request.sheetId)
      if (!sheet) {
        throw new Error(`unknown sheet: ${request.sheetId}`)
      }
      assertUniqueSheetName(state.sheets, name, request.sheetId)
      if (sheet.name === name) {
        return sheetMutationResult(state, request.requestId, {
          sheetId: request.sheetId,
          activeSheetId: request.sheetId,
        })
      }

      beginUndoableMutation(state)
      recordSheetsMetaBefore(state)
      state.sheets = state.sheets.map((item) =>
        item.id === request.sheetId ? { ...item, name } : item,
      )
      state.revision = bumpRevision(state.revision)

      return sheetMutationResult(state, request.requestId, {
        sheetId: request.sheetId,
        activeSheetId: request.sheetId,
      })
    },
    async deleteSheet(request) {
      if (state.sheets.length <= 1) {
        throw new Error('cannot delete the last sheet')
      }

      const deleteIndex = state.sheets.findIndex((sheet) => sheet.id === request.sheetId)
      if (deleteIndex < 0) {
        throw new Error(`unknown sheet: ${request.sheetId}`)
      }

      beginUndoableMutation(state)
      recordSheetsMetaBefore(state)
      recordNamedRangesBefore(state)
      recordFullSheetBefore(state, request.sheetId)

      const nextSheets = state.sheets.filter((sheet) => sheet.id !== request.sheetId)
      state.sheets = reindexSheets(nextSheets)
      state.cellsBySheet.delete(request.sheetId)
      state.cellFormatsBySheetId.delete(request.sheetId)
      state.rangeFormatsBySheetId.delete(request.sheetId)
      state.conditionalFormatRulesBySheetId.delete(request.sheetId)
      state.namedRanges = state.namedRanges.filter((range) => {
        const scopedToDeletedSheet =
          range.scope !== 'workbook' && range.scope.sheetId === request.sheetId
        const refersToDeletedSheet =
          range.refersTo.kind === 'range' && range.refersTo.sheetId === request.sheetId
        return !scopedToDeletedSheet && !refersToDeletedSheet
      })
      state.mergeRangesBySheetId.delete(request.sheetId)
      state.rowHeightsBySheetId.delete(request.sheetId)
      state.colWidthsBySheetId.delete(request.sheetId)
      state.hiddenRowsBySheetId.delete(request.sheetId)
      state.hiddenColsBySheetId.delete(request.sheetId)
      state.freezeBySheetId.delete(request.sheetId)
      // Drop every Table anchored to the deleted sheet (design §4.4). Not
      // captured by the undo delta — the registry is outside the timeline.
      for (const [tableKey, tableEntry] of [...state.tablesByKey]) {
        if (tableEntry.sheetId === request.sheetId) state.tablesByKey.delete(tableKey)
      }
      state.revision = bumpRevision(state.revision)
      const activeSheetId = state.sheets[Math.min(deleteIndex, state.sheets.length - 1)]?.id ?? null

      return sheetMutationResult(state, request.requestId, {
        sheetId: request.sheetId,
        activeSheetId,
      })
    },
    async reorderSheet(request: ReorderSheetRequest) {
      const sheet = state.sheets.find((item) => item.id === request.sheetId)
      if (!sheet) {
        throw new Error(`unknown sheet: ${request.sheetId}`)
      }

      const nextSheets = reorderSheetMetadata(state.sheets, request)
      if (hasSameSheetOrder(state.sheets, nextSheets)) {
        return sheetMutationResult(state, request.requestId, {
          sheetId: request.sheetId,
          activeSheetId: request.sheetId,
        })
      }

      beginUndoableMutation(state)
      recordSheetsMetaBefore(state)
      state.sheets = nextSheets
      state.revision = bumpRevision(state.revision)

      return sheetMutationResult(state, request.requestId, {
        sheetId: request.sheetId,
        activeSheetId: request.sheetId,
      })
    },
  }
}
