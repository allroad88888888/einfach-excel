import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import {
  historyStackAtom,
  runCreateTableAtom,
  runDeleteTableAtom,
  runRenameTableAtom,
  runRenameTableColumnAtom,
  runSetTableTotalFunctionAtom,
  runToggleTableTotalsAtom,
  tableDiagnosticAtom,
} from '../src'
import type { HistoryEntryRecorder, TablesControllerPort } from '../src'

type TestStore = ReturnType<typeof createStore>
type ProjectionRefresh = () => void

interface TableCommandCase {
  readonly label: string
  readonly mutation: string
  readonly run: (
    store: TestStore,
    source: TablesControllerPort,
    historyEntryRecorder: HistoryEntryRecorder,
    refreshProjection: ProjectionRefresh,
  ) => Promise<void>
}

function makeAppliedTablesSource(calls: string[]): TablesControllerPort {
  return {
    async createTable(request) {
      calls.push(request.kind)
      return {
        kind: 'create-table',
        applied: true,
        name: request.name ?? 'Table1',
        requestId: request.requestId,
        revision: 7,
      }
    },
    async setTableTotalsRow(request) {
      calls.push(request.kind)
      return {
        kind: 'table-mutation',
        applied: true,
        name: request.name,
        requestId: request.requestId,
        revision: 7,
      }
    },
    async setTableTotalFunction(request) {
      calls.push(request.kind)
      return {
        kind: 'table-mutation',
        applied: true,
        name: request.name,
        requestId: request.requestId,
        revision: 7,
      }
    },
    async renameTable(request) {
      calls.push(request.kind)
      return {
        kind: 'table-mutation',
        applied: true,
        name: request.newName,
        requestId: request.requestId,
        revision: 7,
      }
    },
    async renameTableColumn(request) {
      calls.push(request.kind)
      return {
        kind: 'table-mutation',
        applied: true,
        name: request.name,
        requestId: request.requestId,
        revision: 7,
      }
    },
    async deleteTable(request) {
      calls.push(request.kind)
      return {
        kind: 'table-mutation',
        applied: true,
        name: request.name,
        requestId: request.requestId,
        revision: 7,
      }
    },
    async listTables() {
      calls.push('catalog')
      return { tables: [] }
    },
  }
}

const tableCommandCases: readonly TableCommandCase[] = [
  {
    label: 'create',
    mutation: 'create-table',
    async run(store, source, historyEntryRecorder, refreshProjection) {
      await store.setter(runCreateTableAtom, {
        source,
        historyEntryRecorder,
        sheetId: 'sheet-1',
        range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 },
        refreshProjection,
      })
    },
  },
  {
    label: 'totals row',
    mutation: 'set-table-totals-row',
    async run(store, source, historyEntryRecorder, refreshProjection) {
      await store.setter(runToggleTableTotalsAtom, {
        source,
        historyEntryRecorder,
        name: 'Table1',
        enabled: true,
        sheetId: 'sheet-1',
        refreshProjection,
      })
    },
  },
  {
    label: 'totals function',
    mutation: 'set-table-total-function',
    async run(store, source, historyEntryRecorder, refreshProjection) {
      await store.setter(runSetTableTotalFunctionAtom, {
        source,
        historyEntryRecorder,
        name: 'Table1',
        column: 'Amount',
        func: 'sum',
        sheetId: 'sheet-1',
        refreshProjection,
      })
    },
  },
  {
    label: 'rename table',
    mutation: 'rename-table',
    async run(store, source, historyEntryRecorder, refreshProjection) {
      await store.setter(runRenameTableAtom, {
        source,
        historyEntryRecorder,
        name: 'Table1',
        newName: 'Sales',
        sheetId: 'sheet-1',
        refreshProjection,
      })
    },
  },
  {
    label: 'rename table column',
    mutation: 'rename-table-column',
    async run(store, source, historyEntryRecorder, refreshProjection) {
      await store.setter(runRenameTableColumnAtom, {
        source,
        historyEntryRecorder,
        name: 'Table1',
        oldColumn: 'Amount',
        newColumn: 'Revenue',
        sheetId: 'sheet-1',
        refreshProjection,
      })
    },
  },
  {
    label: 'delete',
    mutation: 'delete-table',
    async run(store, source, historyEntryRecorder, refreshProjection) {
      await store.setter(runDeleteTableAtom, {
        source,
        historyEntryRecorder,
        name: 'Table1',
        sheetId: 'sheet-1',
        refreshProjection,
      })
    },
  },
]

describe('table history recorder acknowledgement order', () => {
  test.each(tableCommandCases)(
    '$label leaves an acknowledged rejected history result outcome-unknown without refresh',
    async ({ mutation, run }) => {
      const store = createStore()
      const calls: string[] = []
      const historyEntryRecorder: HistoryEntryRecorder = () => {
        calls.push('recorder')
        return 'rejected'
      }

      await run(store, makeAppliedTablesSource(calls), historyEntryRecorder, () =>
        calls.push('projection'),
      )

      expect(calls).toEqual([mutation, 'recorder'])
      expect(store.getter(historyStackAtom).entries).toEqual([])
      expect(store.getter(tableDiagnosticAtom)).toMatchObject({ code: 'outcome-unknown' })
    },
  )

  test.each(tableCommandCases)(
    '$label refreshes normally when history is unavailable',
    async ({ mutation, run }) => {
      const store = createStore()
      const calls: string[] = []
      const historyEntryRecorder: HistoryEntryRecorder = () => {
        calls.push('recorder')
        return 'unavailable'
      }

      await run(store, makeAppliedTablesSource(calls), historyEntryRecorder, () =>
        calls.push('projection'),
      )

      expect(calls).toEqual([mutation, 'recorder', 'catalog', 'projection'])
      expect(store.getter(historyStackAtom).entries).toEqual([])
      expect(store.getter(tableDiagnosticAtom)).toBeNull()
    },
  )

  test.each(tableCommandCases)(
    '$label treats a throwing history recorder as outcome-unknown without refresh',
    async ({ mutation, run }) => {
      const store = createStore()
      const calls: string[] = []
      const historyEntryRecorder: HistoryEntryRecorder = () => {
        calls.push('recorder')
        throw new Error('history recorder unavailable')
      }

      await run(store, makeAppliedTablesSource(calls), historyEntryRecorder, () =>
        calls.push('projection'),
      )

      expect(calls).toEqual([mutation, 'recorder'])
      expect(store.getter(historyStackAtom).entries).toEqual([])
      expect(store.getter(tableDiagnosticAtom)).toMatchObject({ code: 'outcome-unknown' })
    },
  )
})
