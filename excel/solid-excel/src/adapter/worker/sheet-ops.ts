// 一句话：sheet 查找表的刷新与 sheet 级 ACK 组装。

import type { SheetMutationResult } from '@einfach/spreadsheet-ui-core'
import { createBackendError } from './backend-error'
import { syncSheetLookup, toSheetMetadata } from './sheet-lookup'
import type { WorkerWorkbookBackendSheet } from './types'
import type { WorkerBackendState } from './state'

export async function refreshSheetLookup(
  state: WorkerBackendState,
  existingSheets: readonly WorkerWorkbookBackendSheet[] = state.lookup.sheets,
): Promise<WorkerWorkbookBackendSheet[]> {
  await state.readyPromise
  const metas = await state.client.sheetList()
  const synced = syncSheetLookup(metas, existingSheets)
  state.lookup = synced
  return state.lookup.sheets
}

export function sheetMutationResult(
  state: WorkerBackendState,
  requestId: number | undefined,
  extra: Partial<SheetMutationResult> = {},
): SheetMutationResult {
  const { revision: resultRevision, ...rest } = extra
  return {
    ...rest,
    requestId,
    revision: resultRevision ?? state.revision,
    sheets: toSheetMetadata(state.lookup.sheets),
  }
}

export function normalizeSheetName(name: string | undefined, fallback: string): string {
  const normalized = name?.trim() ?? ''
  return normalized.length > 0 ? normalized : fallback
}

export function nextSheetName(state: WorkerBackendState): string {
  const used = new Set(state.lookup.sheets.map((sheet) => sheet.name))
  let index = state.lookup.sheets.length + 1
  let name = `Sheet${index}`

  while (used.has(name)) {
    index += 1
    name = `Sheet${index}`
  }

  return name
}

export async function resolveSheet(
  state: WorkerBackendState,
  sheetId: string,
): Promise<WorkerWorkbookBackendSheet> {
  await state.readyPromise
  const sheet = state.lookup.byId.get(sheetId)
  if (!sheet) {
    throw createBackendError('INVALID_SHEET', `unknown worker workbook sheet: ${sheetId}`)
  }
  return sheet
}
