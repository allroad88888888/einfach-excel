import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import { readListTablesPort } from './table-port-access'
import type { ListTablesResult, SpreadsheetTableDescriptor, TablesControllerPort } from './types'

/** Bounded catalog cap — mirrors the engine's per-workbook table limit. */
export const MAX_TABLE_CATALOG_ENTRIES = 256

// --- catalog (source, bounded cache) ---------------------------------------

export const EMPTY_TABLE_CATALOG: readonly SpreadsheetTableDescriptor[] = Object.freeze([])

export const tableCatalogBackingAtom =
  atom<readonly SpreadsheetTableDescriptor[]>(EMPTY_TABLE_CATALOG)
tableCatalogBackingAtom.debugLabel = 'spreadsheet.tables.catalogBacking'

/**
 * Read-only projection of the last `listTables` result — every table in the
 * workbook, in engine order, capped at {@link MAX_TABLE_CATALOG_ENTRIES}.
 */
export const allTablesAtom: Atom<readonly SpreadsheetTableDescriptor[]> = atom((get) =>
  get(tableCatalogBackingAtom),
)
allTablesAtom.debugLabel = 'spreadsheet.tables.all'

/**
 * Read-only selector projection: `get(tablesForSheetAtom)(sheetId)` returns
 * the tables anchored to `sheetId`. Recomputed only when the catalog changes;
 * no per-sheet atom family.
 */
export const tablesForSheetAtom: Atom<(sheetId: string) => readonly SpreadsheetTableDescriptor[]> =
  atom((get) => {
    const catalog = get(tableCatalogBackingAtom)
    return (sheetId: string): readonly SpreadsheetTableDescriptor[] =>
      catalog.filter((table) => table.sheetId === sheetId)
  })
tablesForSheetAtom.debugLabel = 'spreadsheet.tables.forSheet'

// --- refresh catalog command ------------------------------------------------

/**
 * Re-read the canonical table registry through `listTables` and replace the
 * bounded cache. A host without the port collapses the cache to empty; a
 * transport failure keeps the last known catalog.
 */
export const refreshTableCatalogAtom = atom(
  null,
  async (_get, set, source: TablesControllerPort): Promise<void> => {
    const list = readListTablesPort(source)
    if (list === undefined) {
      set(tableCatalogBackingAtom, EMPTY_TABLE_CATALOG)
      return
    }
    let result: ListTablesResult
    try {
      result = await list.call(source, { kind: 'list-tables' })
    } catch {
      // Leave the last known catalog untouched on a transport failure.
      return
    }
    const tables = Array.isArray(result?.tables) ? result.tables : []
    set(tableCatalogBackingAtom, Object.freeze(tables.slice(0, MAX_TABLE_CATALOG_ENTRIES)))
  },
)
refreshTableCatalogAtom.debugLabel = 'spreadsheet.tables.refreshCatalog'
