// 一句话：Excel Table 增删改查端口。

import type {
  CreateTableRequest,
  CreateTableResult,
  DeleteTableRequest,
  GetTableRequest,
  GetTableResult,
  ListTablesRequest,
  ListTablesResult,
  RenameTableColumnRequest,
  RenameTableRequest,
  TableMutationResult,
} from '@einfach/spreadsheet-ui-core'
import { cloneRange, normalizeRange, rangesIntersect } from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { tableRejected } from '../mutation-result'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'
import { MAX_STATIC_TABLES } from '../state'
import { deriveTableColumnNames } from '../tables/columns'
import { tableDescriptor } from '../tables/descriptor'
import { nextAutoTableName, validateTableName } from '../tables/name'
import { rewriteTableRefsAcrossWorkbook } from '../tables/rename-refs'

export function createTablePorts(
  state: StaticBackendState,
): Pick<
  StaticSpreadsheetBackend,
  'createTable' | 'renameTable' | 'renameTableColumn' | 'deleteTable' | 'listTables' | 'getTable'
> {
  return {
    // --- Excel Table CRUD (design-excel-table.md §4/§10, parity #32) -------
    //
    // The static backend owns the Table registry directly. These six ports
    // present the Table geometry canonically; UI core stores no second copy.
    // Structured rejections (name conflict / range overlap / cap 256 / …)
    // resolve as `TableMutationRejectedResult` rather than throwing.
    //
    // TODO(#32 undo, design §11/§12): table-definition mutations are NOT
    // wrapped in an undo transaction — the undo delta does not carry the
    // registry, so a Ctrl+Z cannot replay create / rename / delete of the
    // Table itself. Create / rename / delete bump the revision so the next
    // projection reflects any referencing-formula recompute.
    async createTable(request: CreateTableRequest): Promise<CreateTableResult> {
      if (!state.sheets.some((sheet) => sheet.id === request.sheetId)) {
        return tableRejected(state, request, 'sheet-not-found')
      }
      const range = normalizeRange(request.range)
      for (const entry of state.tablesByKey.values()) {
        if (entry.sheetId === request.sheetId && rangesIntersect(entry.range, range)) {
          return tableRejected(state, request, 'range-overlap')
        }
      }
      // Cap check before name resolution so a rejected 257th table never
      // perturbs the auto-name counter (design §4.1).
      if (state.tablesByKey.size >= MAX_STATIC_TABLES) {
        return tableRejected(state, request, 'too-many-tables')
      }

      let canonicalName: string
      if (typeof request.name === 'string' && request.name.trim().length > 0) {
        const proposed = request.name.trim()
        const code = validateTableName(state, proposed, null)
        if (code) return tableRejected(state, request, code)
        canonicalName = proposed
      } else {
        canonicalName = nextAutoTableName(state)
      }

      const columns = deriveTableColumnNames(state, request.sheetId, range)
      state.tablesByKey.set(canonicalName.toUpperCase(), {
        canonicalName,
        sheetId: request.sheetId,
        range: cloneRange(range),
        hasHeaders: true,
        hasTotals: false,
        columns,
      })
      state.revision = bumpRevision(state.revision)
      return {
        kind: 'create-table',
        applied: true,
        name: canonicalName,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
    async renameTable(request: RenameTableRequest): Promise<TableMutationResult> {
      const oldKey = request.name.toUpperCase()
      const entry = state.tablesByKey.get(oldKey)
      if (!entry) return tableRejected(state, request, 'not-found')
      const newName = request.newName.trim()
      const code = validateTableName(state, newName, oldKey)
      if (code) return tableRejected(state, request, code)

      entry.canonicalName = newName
      state.tablesByKey.delete(oldKey)
      state.tablesByKey.set(newName.toUpperCase(), entry)
      // Rewrite `OldName[...]` → `NewName[...]` across every sheet so existing
      // structured references keep resolving (design §4.3).
      rewriteTableRefsAcrossWorkbook(state, {
        kind: 'rename-table',
        fromUpper: oldKey,
        to: newName,
      })
      state.revision = bumpRevision(state.revision)
      return {
        kind: 'table-mutation',
        applied: true,
        name: newName,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
    async renameTableColumn(request: RenameTableColumnRequest): Promise<TableMutationResult> {
      if (request.newColumn.trim().length === 0) {
        return tableRejected(state, request, 'invalid-column-name')
      }
      const key = request.name.toUpperCase()
      const entry = state.tablesByKey.get(key)
      if (!entry) return tableRejected(state, request, 'not-found')
      const idx = entry.columns.findIndex(
        (c) => c.toLowerCase() === request.oldColumn.toLowerCase(),
      )
      if (idx < 0) return tableRejected(state, request, 'column-not-found')
      if (
        entry.columns.some(
          (c, i) => i !== idx && c.toLowerCase() === request.newColumn.toLowerCase(),
        )
      ) {
        return tableRejected(state, request, 'duplicate-column')
      }
      const oldColumn = entry.columns[idx]
      entry.columns[idx] = request.newColumn
      rewriteTableRefsAcrossWorkbook(state, {
        kind: 'rename-column',
        tableUpper: key,
        fromUpper: oldColumn.toUpperCase(),
        to: request.newColumn,
      })
      state.revision = bumpRevision(state.revision)
      return {
        kind: 'table-mutation',
        applied: true,
        name: entry.canonicalName,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
    async deleteTable(request: DeleteTableRequest): Promise<TableMutationResult> {
      // "Convert to range": remove the registry entry only; cell values,
      // formulas, and formats are left in place (design §4.1).
      if (!state.tablesByKey.delete(request.name.toUpperCase())) {
        return tableRejected(state, request, 'not-found')
      }
      state.revision = bumpRevision(state.revision)
      return {
        kind: 'table-mutation',
        applied: true,
        name: request.name,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
      }
    },
    async listTables(request: ListTablesRequest): Promise<ListTablesResult> {
      const tables = [...state.tablesByKey.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, entry]) => tableDescriptor(state, entry))
      return {
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        tables,
      }
    },
    async getTable(request: GetTableRequest): Promise<GetTableResult> {
      const entry = state.tablesByKey.get(request.name.toUpperCase())
      return {
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        table: entry ? tableDescriptor(state, entry) : null,
      }
    },
  }
}
