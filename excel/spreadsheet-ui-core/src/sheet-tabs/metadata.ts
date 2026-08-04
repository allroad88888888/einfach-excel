import type { SpreadsheetSheetMetadata } from '../backend'
import type { ReorderSheetMetadataInput } from './types'

export function normalizeSheetTabDraftName(name: string): string | null {
  const normalized = name.trim()
  return normalized.length === 0 ? null : normalized
}

export function getAdjacentSheetId(sheets: readonly SpreadsheetSheetMetadata[], activeSheetId: string | null, direction: 'previous' | 'next'): string | null {
  if (sheets.length === 0) return null
  const activeIndex = activeSheetId ? sheets.findIndex((sheet) => sheet.id === activeSheetId) : -1
  if (activeIndex < 0) return sheets[0]?.id ?? null
  const step = direction === 'previous' ? -1 : 1
  return sheets[(activeIndex + step + sheets.length) % sheets.length]?.id ?? null
}

export function reorderSheetMetadata(sheets: readonly SpreadsheetSheetMetadata[], input: ReorderSheetMetadataInput): SpreadsheetSheetMetadata[] {
  const normalized = normalizeSheetMetadataList(sheets)
  const sourceIndex = normalized.findIndex((sheet) => sheet.id === input.sheetId)
  if (sourceIndex < 0) return normalized
  const source = normalized[sourceIndex]
  const remaining = normalized.filter((sheet) => sheet.id !== input.sheetId)
  let targetIndex: number | null = null
  if (input.beforeSheetId && input.beforeSheetId !== input.sheetId) {
    const beforeIndex = remaining.findIndex((sheet) => sheet.id === input.beforeSheetId)
    targetIndex = beforeIndex >= 0 ? beforeIndex : null
  } else if (input.afterSheetId && input.afterSheetId !== input.sheetId) {
    const afterIndex = remaining.findIndex((sheet) => sheet.id === input.afterSheetId)
    targetIndex = afterIndex >= 0 ? afterIndex + 1 : null
  } else {
    targetIndex = normalizeOptionalIndex(input.targetIndex ?? null)
  }
  if (targetIndex === null) return reindexSheetMetadata(normalized)
  const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length))
  return reindexSheetMetadata([...remaining.slice(0, clampedIndex), source, ...remaining.slice(clampedIndex)])
}

export function normalizeSheetMetadataList(sheets: readonly SpreadsheetSheetMetadata[]): SpreadsheetSheetMetadata[] {
  const normalized: SpreadsheetSheetMetadata[] = []
  const seen = new Set<string>()
  sheets.forEach((sheet, index) => {
    const id = sheet.id.trim()
    const name = normalizeSheetTabDraftName(sheet.name)
    if (id.length === 0 || name === null || seen.has(id)) return
    seen.add(id)
    normalized.push({ id, name, index: Number.isInteger(sheet.index) && sheet.index >= 0 ? sheet.index : index })
  })
  return normalized
}

export function nextSheetTabName(sheets: readonly SpreadsheetSheetMetadata[]): string {
  const names = new Set(sheets.map((sheet) => sheet.name.trim().toLocaleLowerCase()))
  let suffix = sheets.length + 1
  while (names.has(`sheet${suffix}`.toLocaleLowerCase())) suffix += 1
  return `Sheet${suffix}`
}

export function normalizeCoordinate(value: number): number { return Number.isFinite(value) ? Math.trunc(value) : 0 }
export function normalizeOptionalIndex(value: number | null): number | null { return Number.isInteger(value) && value !== null && value >= 0 ? value : null }

function reindexSheetMetadata(sheets: readonly SpreadsheetSheetMetadata[]): SpreadsheetSheetMetadata[] {
  return sheets.map((sheet, index) => ({ ...sheet, index }))
}
