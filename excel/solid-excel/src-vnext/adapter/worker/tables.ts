// 一句话：Excel Table 六个定义端口在 worker 上的执行。

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
  SetTableTotalFunctionRequest,
  SetTableTotalsRowRequest,
  TableMutationResult,
} from '@einfach/spreadsheet-ui-core'
import { normalizeRange } from '@einfach/spreadsheet-ui-core'
import { recordTableMutation } from './record-table-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import { requireTableClient, tableRejectionFromError, toTableDescriptor } from './table-client'
import { toSortRangeBounds } from './wire-range'
import type { WorkerBackendState } from './state'

export async function createTableThroughWorker(
  state: WorkerBackendState,
  request: CreateTableRequest,
): Promise<CreateTableResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const range = normalizeRange(request.range)
  return recordTableMutation<CreateTableResult>(state, {
    // `define_table` inserts a registry entry and bumps the tables epoch;
    // it writes no cell input (workbook.rs §4.1).
    scope: 'registry-only',
    sheetIdx: sheet.idx,
    execute: async () => {
      try {
        const name = await requireTableClient(state, 'createTable')(
          sheet.idx,
          toSortRangeBounds(range),
          request.name,
        )
        const nextRevision = bumpRevision(state)
        return {
          kind: 'create-table',
          applied: true,
          name,
          requestId: request.requestId,
          revision: request.revision ?? nextRevision,
        }
      } catch (error) {
        const rejection = tableRejectionFromError(state, request, error)
        if (rejection !== null) return rejection
        throw error
      }
    },
  })
}

export async function renameTableThroughWorker(
  state: WorkerBackendState,
  request: RenameTableRequest,
): Promise<TableMutationResult> {
  await state.readyPromise
  return recordTableMutation<TableMutationResult>(state, {
    // `rename_table` rewrites `OldName[…]` formula TEXT on every sheet
    // via `rewrite_table_refs_across_sheets` (workbook.rs §4.3).
    scope: 'formula-rewrite',
    tableName: request.name,
    execute: async () => {
      try {
        await requireTableClient(state, 'renameTable')(request.name, request.newName)
        const nextRevision = bumpRevision(state)
        return {
          kind: 'table-mutation',
          applied: true,
          name: request.newName,
          requestId: request.requestId,
          revision: request.revision ?? nextRevision,
        }
      } catch (error) {
        const rejection = tableRejectionFromError(state, request, error)
        if (rejection !== null) return rejection
        throw error
      }
    },
  })
}

export async function renameTableColumnThroughWorker(
  state: WorkerBackendState,
  request: RenameTableColumnRequest,
): Promise<TableMutationResult> {
  await state.readyPromise
  return recordTableMutation<TableMutationResult>(state, {
    // `rename_table_column` rewrites `Table[Old]` (and bare `[Old]` inside
    // the table) formula TEXT on every sheet (workbook.rs §4.3).
    scope: 'formula-rewrite',
    tableName: request.name,
    execute: async () => {
      try {
        await requireTableClient(state, 'renameTableColumn')(
          request.name,
          request.oldColumn,
          request.newColumn,
        )
        const nextRevision = bumpRevision(state)
        return {
          kind: 'table-mutation',
          applied: true,
          name: request.name,
          requestId: request.requestId,
          revision: request.revision ?? nextRevision,
        }
      } catch (error) {
        const rejection = tableRejectionFromError(state, request, error)
        if (rejection !== null) return rejection
        throw error
      }
    },
  })
}

export async function deleteTableThroughWorker(
  state: WorkerBackendState,
  request: DeleteTableRequest,
): Promise<TableMutationResult> {
  await state.readyPromise
  return recordTableMutation<TableMutationResult>(state, {
    // `delete_table` is convert-to-range: the registry entry goes, cell
    // values / formulas / formats stay put (workbook.rs §4.1).
    scope: 'registry-only',
    tableName: request.name,
    execute: async () => {
      try {
        await requireTableClient(state, 'deleteTable')(request.name)
        const nextRevision = bumpRevision(state)
        return {
          kind: 'table-mutation',
          applied: true,
          name: request.name,
          requestId: request.requestId,
          revision: request.revision ?? nextRevision,
        }
      } catch (error) {
        const rejection = tableRejectionFromError(state, request, error)
        if (rejection !== null) return rejection
        throw error
      }
    },
  })
}

export async function listTablesThroughWorker(
  state: WorkerBackendState,
  request: ListTablesRequest,
): Promise<ListTablesResult> {
  await state.readyPromise
  const wires = await requireTableClient(state, 'listTables')()
  return {
    requestId: request.requestId,
    revision: state.revision,
    tables: wires.map((wire) => toTableDescriptor(state, wire)),
  }
}

export async function getTableThroughWorker(
  state: WorkerBackendState,
  request: GetTableRequest,
): Promise<GetTableResult> {
  await state.readyPromise
  const wire = await requireTableClient(state, 'getTable')(request.name)
  return {
    requestId: request.requestId,
    revision: state.revision,
    table: wire ? toTableDescriptor(state, wire) : null,
  }
}

export async function setTableTotalsRowThroughWorker(
  state: WorkerBackendState,
  request: SetTableTotalsRowRequest,
): Promise<TableMutationResult> {
  await state.readyPromise
  return recordTableMutation<TableMutationResult>(state, {
    // `set_table_totals_row` writes one SUBTOTAL at `range.end.row + 1`
    // (enable) or clears `range.end.row` across the table's columns
    // (disable) — nothing outside that band (workbook.rs §7).
    scope: 'totals-band',
    tableName: request.name,
    execute: async () => {
      try {
        await requireTableClient(state, 'setTableTotalsRow')(request.name, request.enabled)
        const nextRevision = bumpRevision(state)
        return {
          kind: 'table-mutation',
          applied: true,
          name: request.name,
          requestId: request.requestId,
          revision: request.revision ?? nextRevision,
        }
      } catch (error) {
        const rejection = tableRejectionFromError(state, request, error)
        if (rejection !== null) return rejection
        throw error
      }
    },
  })
}

export async function setTableTotalFunctionThroughWorker(
  state: WorkerBackendState,
  request: SetTableTotalFunctionRequest,
): Promise<TableMutationResult> {
  await state.readyPromise
  return recordTableMutation<TableMutationResult>(state, {
    // `set_table_total_function` writes or clears exactly one cell in the
    // totals row of the table's column span (workbook.rs §7).
    scope: 'totals-band',
    tableName: request.name,
    execute: async () => {
      try {
        await requireTableClient(state, 'setTableTotalFunction')(
          request.name,
          request.column,
          request.func,
        )
        const nextRevision = bumpRevision(state)
        return {
          kind: 'table-mutation',
          applied: true,
          name: request.name,
          requestId: request.requestId,
          revision: request.revision ?? nextRevision,
        }
      } catch (error) {
        const rejection = tableRejectionFromError(state, request, error)
        if (rejection !== null) return rejection
        throw error
      }
    },
  })
}
