// 一句话：sheet 生命周期端口。

import type { ReorderSheetRequest, SheetMutationResult } from '@einfach/spreadsheet-ui-core'
import { reorderSheetMetadata } from '@einfach/spreadsheet-ui-core'
import { createBackendError } from '../backend-error'
import { beginSheetIndexRemap, finishSheetIndexRemap } from '../content-change'
import { dropSheetOverlayState } from '../overlay-shift'
import { bumpRevision } from '../revision'
import { toSheetMetadata } from '../sheet-lookup'
import {
  nextSheetName,
  normalizeSheetName,
  refreshSheetLookup,
  resolveSheet,
  sheetMutationResult,
} from '../sheet-ops'
import { dropTransactionRecords } from '../transaction-log'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createSheetPorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'listSheets' | 'addSheet' | 'renameSheet' | 'deleteSheet' | 'reorderSheet'
> {
  return {
    async listSheets() {
      await refreshSheetLookup(state)
      return {
        revision: state.revision,
        sheets: toSheetMetadata(state.lookup.sheets),
      }
    },

    async addSheet(request): Promise<SheetMutationResult> {
      await state.readyPromise
      const name = normalizeSheetName(request.name, nextSheetName(state))
      const addedIdx = await state.client.addSheet(name)
      const nextRevision = bumpRevision(state)
      await refreshSheetLookup(state, state.lookup.sheets)
      const createdSheet =
        state.lookup.sheets.find((sheet) => sheet.idx === addedIdx) ?? state.lookup.sheets.at(-1)
      const createdIndex = createdSheet
        ? state.lookup.sheets.findIndex((sheet) => sheet.id === createdSheet.id)
        : -1
      const createdMetadata = createdSheet
        ? { id: createdSheet.id, name: createdSheet.name, index: Math.max(createdIndex, 0) }
        : undefined

      return sheetMutationResult(state, request.requestId, {
        sheetId: createdMetadata?.id,
        activeSheetId: createdMetadata?.id ?? null,
        revision: request.revision ?? nextRevision,
        createdSheet: createdMetadata,
      })
    },

    async renameSheet(request): Promise<SheetMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const name = normalizeSheetName(request.name, '')

      if (name.length === 0) {
        throw createBackendError('INVALID_SHEET_NAME', 'sheet name cannot be empty')
      }

      const ok = await state.client.renameSheet(sheet.idx, name)
      if (!ok) {
        throw createBackendError('SHEET_RENAME_FAILED', `cannot rename sheet to: ${name}`)
      }

      const nextRevision = bumpRevision(state)
      const optimisticSheets = state.lookup.sheets.map((item) =>
        item.id === request.sheetId ? { ...item, name } : item,
      )
      await refreshSheetLookup(state, optimisticSheets)

      return sheetMutationResult(state, request.requestId, {
        sheetId: request.sheetId,
        activeSheetId: request.sheetId,
        revision: request.revision ?? nextRevision,
      })
    },

    async deleteSheet(request): Promise<SheetMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const deleteDisplayIndex = state.lookup.sheets.findIndex(
        (item) => item.id === request.sheetId,
      )

      if (state.lookup.sheets.length <= 1) {
        throw createBackendError('SHEET_DELETE_FAILED', 'cannot delete the last sheet')
      }

      const ok = await state.client.removeSheet(sheet.idx)
      if (!ok) {
        throw createBackendError('SHEET_DELETE_FAILED', `cannot delete sheet: ${request.sheetId}`)
      }

      // Audit D-4 (FIXED): the deleted sheet's id will be reused by the
      // next added sheet — drop every host-side overlay keyed by it so
      // the new sheet starts clean instead of inheriting dead state.
      dropSheetOverlayState(state, request.sheetId)
      // Design point D: sheet lifecycle is not undoable, and the delete
      // shifts positional sheet indices — recorded transactions would
      // replay into the wrong sheet, so the log is dropped wholesale.
      dropTransactionRecords(state)
      const nextRevision = bumpRevision(state)
      const remainingSheets = state.lookup.sheets.filter((item) => item.id !== request.sheetId)
      await refreshSheetLookup(state, remainingSheets)
      const activeSheetId =
        state.lookup.sheets[
          Math.min(Math.max(deleteDisplayIndex, 0), state.lookup.sheets.length - 1)
        ]?.id ??
        null

      return sheetMutationResult(state, request.requestId, {
        sheetId: request.sheetId,
        activeSheetId,
        revision: request.revision ?? nextRevision,
      })
    },

    async reorderSheet(request: ReorderSheetRequest): Promise<SheetMutationResult> {
      await resolveSheet(state, request.sheetId)
      const nextSheets = reorderSheetMetadata(toSheetMetadata(state.lookup.sheets), request)
      const fromIndex = state.lookup.sheets.findIndex((sheet) => sheet.id === request.sheetId)
      const toIndex = nextSheets.findIndex((sheet) => sheet.id === request.sheetId)
      const changed = fromIndex !== toIndex

      if (fromIndex < 0 || toIndex < 0) {
        throw createBackendError('SHEET_REORDER_FAILED', `cannot reorder sheet: ${request.sheetId}`)
      }

      let nextRevision = state.revision
      if (changed) {
        // A real worker may publish cellsDirty before the moveSheet ACK. Hold
        // that coarse refresh ping until sheetList has rebuilt the canonical
        // stable-id -> positional-index lookup, otherwise an active stable id
        // can briefly read the sheet that moved into its old index.
        beginSheetIndexRemap(state)
        try {
          const ok = await state.client.moveSheet(state.lookup.sheets[fromIndex].idx, toIndex)
          if (!ok) {
            throw createBackendError(
              'SHEET_REORDER_FAILED',
              `cannot reorder sheet: ${request.sheetId}`,
            )
          }
          // Design point D: the reorder shifted positional sheet indices;
          // recorded transactions would replay into the wrong sheet.
          dropTransactionRecords(state)
          nextRevision = bumpRevision(state)
          await refreshSheetLookup(state, state.lookup.sheets)
        } finally {
          // Never leave worker content notifications suppressed when the
          // command rejects. The successful path flushes only after the
          // canonical sheet-list refresh above.
          finishSheetIndexRemap(state)
        }
      }

      return sheetMutationResult(state, request.requestId, {
        sheetId: request.sheetId,
        activeSheetId: request.sheetId,
        revision: request.revision ?? nextRevision,
      })
    },
  }
}
