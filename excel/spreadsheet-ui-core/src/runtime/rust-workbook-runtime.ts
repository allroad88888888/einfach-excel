import { atom, type Getter } from '@einfach/core'
import { createRustWorkbookConnection, type RustWorkbookConnection } from '../rust-workbook'
import {
  beginSpreadsheetRuntimeAtom,
  rejectSpreadsheetRuntimeAtom,
  resolveSpreadsheetRuntimeAtom,
} from './workbook-lifecycle'
import { clearWorkbookDocumentAtom, initializeWorkbookDocumentAtom } from './workbook-document'
import {
  snapshotRustWorkbookDefinition,
  type StartRustWorkbookRuntimeInput,
} from './rust-workbook-definition'

interface RuntimeOwner {
  readonly sessionId: number
  readonly connection: RustWorkbookConnection | null
}

const EMPTY_RUNTIME_OWNER: RuntimeOwner = Object.freeze({ sessionId: 0, connection: null })
const runtimeOwnerAtom = atom<RuntimeOwner>(EMPTY_RUNTIME_OWNER)

runtimeOwnerAtom.debugLabel = 'spreadsheet.runtime.owner'

function nextSessionId(current: number): number {
  return current === Number.MAX_SAFE_INTEGER ? 1 : current + 1
}

function ownsConnection(
  get: Getter,
  sessionId: number,
  connection: RustWorkbookConnection,
): boolean {
  const owner = get(runtimeOwnerAtom)
  return owner.sessionId === sessionId && owner.connection === connection
}

function disposeConnection(connection: RustWorkbookConnection | null): void {
  try {
    connection?.dispose()
  } catch {
    // Disposal is best-effort; the core state is cleared regardless.
  }
}

/** Starts one Rust workbook and publishes it through the UI-core runtime atoms. */
export const startRustWorkbookRuntimeAtom = atom(
  null,
  async (get, set, input: StartRustWorkbookRuntimeInput): Promise<void> => {
    const previous = get(runtimeOwnerAtom)
    disposeConnection(previous.connection)
    const sessionId = nextSessionId(previous.sessionId)
    set(runtimeOwnerAtom, Object.freeze({ sessionId, connection: null }))
    set(clearWorkbookDocumentAtom)
    set(beginSpreadsheetRuntimeAtom)

    let definition
    let connection: RustWorkbookConnection
    try {
      definition = snapshotRustWorkbookDefinition(input.definition)
      connection = createRustWorkbookConnection(input.workerFactory)
    } catch (error) {
      if (get(runtimeOwnerAtom).sessionId === sessionId) set(rejectSpreadsheetRuntimeAtom, error)
      return
    }
    set(runtimeOwnerAtom, Object.freeze({ sessionId, connection }))

    try {
      const initializedSheets = await connection.request('workbook.initialize', {
        sheets: definition.sheets.map(({ id, name, rowHeights, colWidths }) => ({
          id,
          name,
          ...(rowHeights ? { rowHeights } : {}),
          ...(colWidths ? { colWidths } : {}),
        })),
      })
      if (!ownsConnection(get, sessionId, connection)) return
      if (initializedSheets.length !== definition.sheets.length) {
        throw new Error(
          `Rust initialized ${initializedSheets.length}/${definition.sheets.length} sheets`,
        )
      }
      const sheetDefinitions = new Map(definition.sheets.map((sheet) => [sheet.id, sheet]))
      const publishedSheetIds = new Set<string>()
      const documentSheets = initializedSheets.map((sheet) => {
        const source = sheetDefinitions.get(sheet.id)
        if (source === undefined || publishedSheetIds.has(sheet.id)) {
          throw new Error(`Rust initialized an unexpected sheet: ${sheet.id}`)
        }
        publishedSheetIds.add(sheet.id)
        return {
          id: sheet.id,
          name: sheet.name,
          index: sheet.index,
          rowCount: source.rowCount,
          colCount: source.colCount,
        }
      })

      let expectedCells = 0
      let acceptedCells = 0
      let importErrors = 0
      let rejectedFormulas = 0
      for await (const chunk of definition.createImportChunks()) {
        if (!ownsConnection(get, sessionId, connection)) return
        if (chunk.length === 0) continue
        expectedCells += chunk.length
        const stats = await connection.request('workbook.importCells', { cells: chunk })
        acceptedCells += stats.accepted
        importErrors += stats.errors
        rejectedFormulas += stats.rejectedFormulas
      }
      if (acceptedCells !== expectedCells || importErrors > 0 || rejectedFormulas > 0) {
        throw new Error(`Rust import accepted ${acceptedCells}/${expectedCells} cells`)
      }
      if (!ownsConnection(get, sessionId, connection)) return

      set(initializeWorkbookDocumentAtom, {
        title: definition.title,
        sheets: documentSheets,
      })
      set(resolveSpreadsheetRuntimeAtom, { connection })
    } catch (error) {
      if (!ownsConnection(get, sessionId, connection)) return
      disposeConnection(connection)
      set(runtimeOwnerAtom, Object.freeze({ sessionId, connection: null }))
      set(clearWorkbookDocumentAtom)
      set(rejectSpreadsheetRuntimeAtom, error)
    }
  },
)
startRustWorkbookRuntimeAtom.debugLabel = 'spreadsheet.runtime.startRustWorkbook'

/** Disposes the Rust connection owned by the current UI-core store. */
export const disposeRustWorkbookRuntimeAtom = atom(null, (get, set): void => {
  const current = get(runtimeOwnerAtom)
  disposeConnection(current.connection)
  set(
    runtimeOwnerAtom,
    Object.freeze({ sessionId: nextSessionId(current.sessionId), connection: null }),
  )
  set(clearWorkbookDocumentAtom)
  set(beginSpreadsheetRuntimeAtom)
})
disposeRustWorkbookRuntimeAtom.debugLabel = 'spreadsheet.runtime.disposeRustWorkbook'
