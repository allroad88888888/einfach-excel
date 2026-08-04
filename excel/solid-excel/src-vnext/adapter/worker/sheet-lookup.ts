// 一句话：sheet 稳定 id 与引擎位序之间的查找表。

import type { SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'
import type { WorkbookSheetMeta } from '../worker-protocol'
import type {
  SheetLookup,
  WorkerWorkbookBackendSheet,
  WorkerWorkbookBackendSheetInput,
} from './types'

const DEFAULT_SHEETS = ['Sheet1']

export function normalizeSheetInputs(
  sheets: readonly (string | WorkerWorkbookBackendSheetInput)[] | undefined,
): WorkerWorkbookBackendSheetInput[] {
  const input = sheets && sheets.length > 0 ? sheets : DEFAULT_SHEETS
  return input.map((sheet, index) =>
    typeof sheet === 'string'
      ? {
          id: `sheet-${index + 1}`,
          name: sheet,
        }
      : {
          id: sheet.id ?? `sheet-${index + 1}`,
          name: sheet.name,
        },
  )
}

export function buildSheetLookup(
  inputs: WorkerWorkbookBackendSheetInput[],
  metas: WorkbookSheetMeta[],
): SheetLookup {
  const sheets = metas.map((meta, index) => {
    const input = inputs[index]
    return {
      id: input?.id ?? `sheet-${meta.idx + 1}`,
      idx: meta.idx,
      name: meta.name,
    }
  })
  const byId = new Map<string, WorkerWorkbookBackendSheet>()

  for (const sheet of sheets) {
    byId.set(sheet.id, sheet)
    byId.set(sheet.name, sheet)
  }

  for (const sheet of sheets) {
    if (!byId.has(String(sheet.idx))) byId.set(String(sheet.idx), sheet)
    if (!byId.has(`sheet-${sheet.idx + 1}`)) byId.set(`sheet-${sheet.idx + 1}`, sheet)
  }

  return { sheets, byId }
}

function buildSheetLookupFromSheets(sheets: WorkerWorkbookBackendSheet[]): SheetLookup {
  const byId = new Map<string, WorkerWorkbookBackendSheet>()

  for (const sheet of sheets) {
    byId.set(sheet.id, sheet)
    byId.set(sheet.name, sheet)
  }

  for (const sheet of sheets) {
    if (!byId.has(String(sheet.idx))) byId.set(String(sheet.idx), sheet)
    if (!byId.has(`sheet-${sheet.idx + 1}`)) byId.set(`sheet-${sheet.idx + 1}`, sheet)
  }

  return { sheets, byId }
}

export function syncSheetLookup(
  metas: WorkbookSheetMeta[],
  existingSheets: readonly WorkerWorkbookBackendSheet[],
): SheetLookup {
  const usedIds = new Set<string>()
  const sheets = metas.map((meta, index) => {
    const existing =
      existingSheets.find((sheet) => sheet.name === meta.name) ??
      existingSheets[index] ??
      existingSheets.find((sheet) => sheet.idx === meta.idx)
    let id = existing?.id ?? `sheet-${meta.idx + 1}`

    if (usedIds.has(id)) {
      let nextIdIndex = meta.idx + 1
      do {
        nextIdIndex += 1
        id = `sheet-${nextIdIndex}`
      } while (usedIds.has(id))
    }

    usedIds.add(id)
    return {
      id,
      idx: meta.idx,
      name: meta.name,
    }
  })

  return buildSheetLookupFromSheets(sheets)
}

export function toSheetMetadata(
  sheets: readonly WorkerWorkbookBackendSheet[],
): SpreadsheetSheetMetadata[] {
  return sheets.map((sheet, index) => ({
    id: sheet.id,
    name: sheet.name,
    index,
  }))
}
