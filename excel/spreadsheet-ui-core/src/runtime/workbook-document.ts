import { atom, type Atom } from '@einfach/core'
import { DEFAULT_SELECTION_BOUNDS, setSelectionBoundsAtom } from '../selection'
import { activateSheetTabAtom, setSheetTabsSheetsAtom } from '../sheet-tabs/basic-commands'
import { resetWorkspaceSessionAtom, workspaceSessionAtom } from '../workspace'
import { DEFAULT_SHEET_TABS_STATE, sheetTabsAtom } from '../sheet-tabs/state'
import type { RustWorkbookSheet } from '../rust-workbook/commands'
import { viewportSizeOverridesAtom } from '../viewport/size-overrides'

export interface WorkbookDocumentSheet {
  readonly id: string
  readonly name: string
  readonly index: number
  readonly rowCount: number
  readonly colCount: number
  readonly key?: string
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
    set(sheetTabsAtom, {
      ...DEFAULT_SHEET_TABS_STATE,
      phase: 'ready',
      capabilities: { list: true, add: true, rename: true, delete: true, reorder: true },
    })
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

/** 发布 Rust 已确认的单表元数据，不重置当前工作簿或其它表的视图。 */
export const publishWorkbookSheetAtom = atom(
  null,
  (get, set, sheet: WorkbookDocumentSheet): void => {
    const current = get(workbookDocumentAtom)
    const sheets = current.sheets.some((item) => item.id === sheet.id)
      ? current.sheets.map((item) => (item.id === sheet.id ? Object.freeze({ ...sheet }) : item))
      : [...current.sheets, Object.freeze({ ...sheet })]
    set(workbookDocumentBackingAtom, Object.freeze({ ...current, sheets: Object.freeze(sheets) }))
    set(setSheetTabsSheetsAtom, { sheets })
  },
)

/** 发布 Rust 返回的表顺序，回收已删除表的投影尺寸。 */
export const publishWorkbookSheetStructureAtom = atom(
  null,
  (get, set, input: readonly RustWorkbookSheet[]): void => {
    const current = get(workbookDocumentAtom)
    const previous = new Map(current.sheets.map((sheet) => [sheet.id, sheet]))
    const sheets = input.map((sheet) => {
      const shape =
        previous.get(sheet.id) ??
        (Number.isSafeInteger(sheet.rowCount) &&
        (sheet.rowCount ?? 0) > 0 &&
        Number.isSafeInteger(sheet.colCount) &&
        (sheet.colCount ?? 0) > 0
          ? { rowCount: sheet.rowCount!, colCount: sheet.colCount! }
          : undefined)
      if (!shape) throw new Error('Rust returned an unknown worksheet.')
      return Object.freeze({ ...shape, ...sheet })
    })
    set(workbookDocumentBackingAtom, Object.freeze({ ...current, sheets: Object.freeze(sheets) }))
    set(setSheetTabsSheetsAtom, { sheets })
    // 删除的表不再保留投影尺寸；其它表以稳定 ID 存储，无需跟随索引重写。
    const ids = new Set(sheets.map((sheet) => sheet.id))
    const sizes = get(viewportSizeOverridesAtom)
    set(viewportSizeOverridesAtom, {
      rowHeightsBySheet: Object.fromEntries(
        Object.entries(sizes.rowHeightsBySheet).filter(([id]) => ids.has(id)),
      ),
      colWidthsBySheet: Object.fromEntries(
        Object.entries(sizes.colWidthsBySheet).filter(([id]) => ids.has(id)),
      ),
    })
  },
)

/** Clears workbook metadata after its owned Rust runtime is disposed. */
export const clearWorkbookDocumentAtom = atom(null, (_get, set): void => {
  set(workbookDocumentBackingAtom, EMPTY_WORKBOOK_DOCUMENT)
  set(sheetTabsAtom, DEFAULT_SHEET_TABS_STATE)
  set(setSheetTabsSheetsAtom, { sheets: [] })
  set(resetWorkspaceSessionAtom)
  set(setSelectionBoundsAtom, DEFAULT_SELECTION_BOUNDS)
})
clearWorkbookDocumentAtom.debugLabel = 'spreadsheet.runtime.document.clear'
