// 一句话：sheet 元数据列表的规范化与命名。

import type { SpreadsheetSheetMetadata } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetSheetInput } from '../types'

export function normalizeStaticSheets(
  sheets: readonly (string | StaticSpreadsheetSheetInput)[] | undefined = undefined,
): SpreadsheetSheetMetadata[] {
  const input = sheets && sheets.length > 0 ? sheets : ['Sheet1']
  const normalized: SpreadsheetSheetMetadata[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  input.forEach((sheet, index) => {
    const id = typeof sheet === 'string' ? `sheet-${index + 1}` : (sheet.id ?? `sheet-${index + 1}`)
    const name = typeof sheet === 'string' ? sheet : sheet.name
    const normalizedId = id.trim()
    const normalizedName = name.trim()

    if (
      normalizedId.length === 0 ||
      normalizedName.length === 0 ||
      seenIds.has(normalizedId) ||
      seenNames.has(normalizedName)
    ) {
      return
    }

    seenIds.add(normalizedId)
    seenNames.add(normalizedName)
    normalized.push({
      id: normalizedId,
      name: normalizedName,
      index: normalized.length,
    })
  })

  return normalized.length > 0 ? normalized : [{ id: 'sheet-1', name: 'Sheet1', index: 0 }]
}

export function cloneSheets(
  sheets: readonly SpreadsheetSheetMetadata[],
): SpreadsheetSheetMetadata[] {
  return sheets.map((sheet, index) => ({
    id: sheet.id,
    name: sheet.name,
    index,
  }))
}

export function createNextSheetId(sheets: readonly SpreadsheetSheetMetadata[]): string {
  const used = new Set(sheets.map((sheet) => sheet.id))
  let index = sheets.length + 1
  let id = `sheet-${index}`

  while (used.has(id)) {
    index += 1
    id = `sheet-${index}`
  }

  return id
}

export function createNextSheetName(sheets: readonly SpreadsheetSheetMetadata[]): string {
  const used = new Set(sheets.map((sheet) => sheet.name))
  let index = sheets.length + 1
  let name = `Sheet${index}`

  while (used.has(name)) {
    index += 1
    name = `Sheet${index}`
  }

  return name
}

export function normalizeSheetMutationName(name: string | undefined, fallback: string): string {
  const normalized = name?.trim() ?? ''
  return normalized.length > 0 ? normalized : fallback
}

export function assertUniqueSheetName(
  sheets: readonly SpreadsheetSheetMetadata[],
  name: string,
  exceptSheetId?: string,
) {
  const exists = sheets.some((sheet) => sheet.id !== exceptSheetId && sheet.name === name)
  if (exists) {
    throw new Error(`sheet name already exists: ${name}`)
  }
}

export function reindexSheets(
  sheets: readonly SpreadsheetSheetMetadata[],
): SpreadsheetSheetMetadata[] {
  return sheets.map((sheet, index) => ({ ...sheet, index }))
}

export function hasSameSheetOrder(
  left: readonly SpreadsheetSheetMetadata[],
  right: readonly SpreadsheetSheetMetadata[],
): boolean {
  return left.length === right.length && left.every((sheet, index) => sheet.id === right[index]?.id)
}
