import { atom, type Atom } from '@einfach/core'
import { DEFAULT_SELECTION_BOUNDS, setSelectionBoundsAtom } from '../selection'
import { activateSheetTabAtom, setSheetTabsSheetsAtom } from '../sheet-tabs'
import { resetWorkspaceSessionAtom, workspaceSessionAtom } from '../workspace'

export interface WorkbookDocumentSheet {
  readonly id: string
  readonly name: string
  readonly index: number
  readonly rowCount: number
  readonly colCount: number
}

export interface WorkbookDocument {
  readonly title: string
  readonly sheets: readonly WorkbookDocumentSheet[]
}

export interface InitializeWorkbookDocumentInput {
  readonly title: string
  readonly sheets: readonly WorkbookDocumentSheet[]
}

const EMPTY_WORKBOOK_DOCUMENT: WorkbookDocument = Object.freeze({
  title: '',
  sheets: Object.freeze([]),
})
const workbookDocumentBackingAtom = atom<WorkbookDocument>(EMPTY_WORKBOOK_DOCUMENT)

workbookDocumentBackingAtom.debugLabel = 'spreadsheet.runtime.document.state'

export const workbookDocumentAtom: Atom<WorkbookDocument> = atom((get) =>
  get(workbookDocumentBackingAtom),
)
workbookDocumentAtom.debugLabel = 'spreadsheet.runtime.document'

export const activeWorkbookSheetAtom: Atom<WorkbookDocumentSheet | null> = atom((get) => {
  const workbook = get(workbookDocumentAtom)
  const activeSheetId = get(workspaceSessionAtom).activeSheetId
  return workbook.sheets.find((sheet) => sheet.id === activeSheetId) ?? workbook.sheets[0] ?? null
})
activeWorkbookSheetAtom.debugLabel = 'spreadsheet.runtime.document.activeSheet'

/** Publishes initialized workbook metadata to every core domain that consumes it. */
export const initializeWorkbookDocumentAtom = atom(
  null,
  (_get, set, input: InitializeWorkbookDocumentInput): void => {
    const sheets = input.sheets.map((sheet) => Object.freeze({ ...sheet }))
    const workbook = Object.freeze({
      title: input.title,
      sheets: Object.freeze(sheets),
    })
    const firstSheet = sheets[0]
    if (firstSheet === undefined) return
    set(workbookDocumentBackingAtom, workbook)
    set(setSheetTabsSheetsAtom, {
      sheets: sheets.map(({ id, index, name }) => ({ id, index, name })),
    })
    set(setSelectionBoundsAtom, {
      rowCount: firstSheet.rowCount,
      colCount: firstSheet.colCount,
    })
    set(activateSheetTabAtom, { sheetId: firstSheet.id })
  },
)
initializeWorkbookDocumentAtom.debugLabel = 'spreadsheet.runtime.document.initialize'

/** Clears workbook metadata after its owned Rust runtime is disposed. */
export const clearWorkbookDocumentAtom = atom(null, (_get, set): void => {
  set(workbookDocumentBackingAtom, EMPTY_WORKBOOK_DOCUMENT)
  set(setSheetTabsSheetsAtom, { sheets: [] })
  set(resetWorkspaceSessionAtom)
  set(setSelectionBoundsAtom, DEFAULT_SELECTION_BOUNDS)
})
clearWorkbookDocumentAtom.debugLabel = 'spreadsheet.runtime.document.clear'
