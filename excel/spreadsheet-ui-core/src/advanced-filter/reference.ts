import { atom, type Getter } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { parseGoToReference } from '../go-to/reference-parser'
import { rangeToA1 } from '../name-box/address'
import { nativeNamedRangesAtom, resolveNativeNamedRange } from '../named-ranges/native-catalog'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import type { AdvancedFilterRangeReference } from '../rust-workbook/advanced-filter-range-commands'
import type { RustWorkbookConnection } from '../rust-workbook/commands'

export interface WorksheetCriteriaDraft {
  readonly source: string
  readonly criteria: string
  readonly uniqueOnly: boolean
  readonly destination: string
  readonly outputFields: string
}

export interface WorksheetCriteriaContext {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly editing: boolean
  readonly source: string
}

export const worksheetCriteriaContextAtom = atom((get): WorksheetCriteriaContext | null => {
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return null
  const selection = get(selectionSnapshotAtom)
  return {
    connection,
    sheetId: sheet.id,
    editing: get(editingSessionAtom).source !== null,
    source: get(selectionRegionsAtom).length === 1 ? rangeToA1(selection.range) : '',
  }
})
worksheetCriteriaContextAtom.debugLabel = 'spreadsheet.advancedFilter.context'

export function readWorksheetReference(
  get: Getter, value: string,
): AdvancedFilterRangeReference | null {
  const sheet = get(activeWorkbookSheetAtom)
  if (!sheet || !value.trim() || value.length > 1024) return null
  const sheets = get(workbookDocumentAtom).sheets
  const named = resolveNativeNamedRange(value, get(nativeNamedRangesAtom), sheets, sheet.id)
  if (named !== undefined) return named
  const parsed = parseGoToReference(value, {
    activeSheetId: sheet.id, activeCell: get(selectionSnapshotAtom).activeCell,
    sheets, registry: [],
  })
  if (!parsed.ok) return null
  const { sheetId, range, coord } = parsed.target
  const area = range ?? (coord ? {
    rowStart: coord.row, rowEnd: coord.row, colStart: coord.col, colEnd: coord.col,
  } : null)
  const target = sheets.find((entry) => entry.id === sheetId)
  if (!area || !target || area.rowEnd >= target.rowCount || area.colEnd >= target.colCount)
    return null
  return { sheetId, range: area }
}
