// 一句话：Excel Table 端口。

import type {
  CreateTableRequest,
  DeleteTableRequest,
  GetTableRequest,
  ListTablesRequest,
  RenameTableColumnRequest,
  RenameTableRequest,
  SetTableTotalFunctionRequest,
  SetTableTotalsRowRequest,
} from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from '../capabilities'
import {
  createTableThroughWorker,
  deleteTableThroughWorker,
  getTableThroughWorker,
  listTablesThroughWorker,
  renameTableColumnThroughWorker,
  renameTableThroughWorker,
  setTableTotalFunctionThroughWorker,
  setTableTotalsRowThroughWorker,
} from '../tables'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createTablePorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'createTable' | 'renameTable' | 'renameTableColumn' | 'deleteTable' | 'listTables' | 'getTable' | 'setTableTotalsRow' | 'setTableTotalFunction'
> {
  const createTable = (request: CreateTableRequest) => createTableThroughWorker(state, request)
  const renameTable = (request: RenameTableRequest) => renameTableThroughWorker(state, request)
  const renameTableColumn = (request: RenameTableColumnRequest) =>
    renameTableColumnThroughWorker(state, request)
  const deleteTable = (request: DeleteTableRequest) => deleteTableThroughWorker(state, request)
  const listTables = (request: ListTablesRequest) => listTablesThroughWorker(state, request)
  const getTable = (request: GetTableRequest) => getTableThroughWorker(state, request)
  const setTableTotalsRow = (request: SetTableTotalsRowRequest) =>
    setTableTotalsRowThroughWorker(state, request)
  const setTableTotalFunction = (request: SetTableTotalFunctionRequest) =>
    setTableTotalFunctionThroughWorker(state, request)

  return {
    /**
     * Excel Table CRUD (design-excel-table.md §10, parity #32).
     * Capability-gated by `structuredTables`: the TS worker declares it
     * `false` so every port reads `undefined` and UI-core hides the Table
     * entries; the WASM runtime's null witness keeps them exposed (full
     * trust). See the `*ThroughWorker` functions above for the reject
     * mapping and the (deferred) undo note.
     */
    get createTable() {
      return runtimeSupports(state, 'structuredTables') ? createTable : undefined
    },

    get renameTable() {
      return runtimeSupports(state, 'structuredTables') ? renameTable : undefined
    },

    get renameTableColumn() {
      return runtimeSupports(state, 'structuredTables') ? renameTableColumn : undefined
    },

    get deleteTable() {
      return runtimeSupports(state, 'structuredTables') ? deleteTable : undefined
    },

    get listTables() {
      return runtimeSupports(state, 'structuredTables') ? listTables : undefined
    },

    get getTable() {
      return runtimeSupports(state, 'structuredTables') ? getTable : undefined
    },

    get setTableTotalsRow() {
      return runtimeSupports(state, 'structuredTables') ? setTableTotalsRow : undefined
    },

    get setTableTotalFunction() {
      return runtimeSupports(state, 'structuredTables') ? setTableTotalFunction : undefined
    },
  }
}
