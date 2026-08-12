/** @jsxImportSource solid-js */

import { createStore, type Store } from '@einfach/core'
import { Provider } from '@einfach/solid'
import {
  runCreateTableAtom,
  runToggleTableTotalsAtom,
  type HistoryEntryRecorder,
  type TablesControllerPort,
} from '@einfach/spreadsheet-ui-core'
import { afterEach, describe, expect, it } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'

import { SpreadsheetTablesFeedback } from '../src-vnext/tables'

const A1_C4 = { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 2 }

const recordHistory: HistoryEntryRecorder = (entry, append) =>
  append(entry) ? 'recorded' : 'rejected'

function mount(store: Store) {
  return render(() => (
    <Provider store={store}>
      <SpreadsheetTablesFeedback />
    </Provider>
  ))
}

function tableSource(): TablesControllerPort {
  return {
    createTable: async (request) => ({
      kind: 'create-table',
      applied: true,
      name: request.name ?? 'Sales',
      requestId: request.requestId,
      revision: 1,
    }),
    listTables: async () => ({ tables: [] }),
    setTableTotalsRow: async (request) => ({
      kind: 'table-mutation',
      applied: true,
      name: request.name,
      requestId: request.requestId,
      revision: 2,
    }),
  }
}

afterEach(cleanup)

describe('SpreadsheetTablesFeedback', () => {
  it('renders the atom-owned create result', async () => {
    const store = createStore()
    const rendered = mount(store)

    expect(rendered.queryByTestId('tables-create-result')).toBeNull()

    await store.setter(runCreateTableAtom, {
      source: tableSource(),
      historyEntryRecorder: recordHistory,
      sheetId: 'sheet-1',
      range: A1_C4,
      name: 'Sales',
    })

    const result = rendered.getByTestId('tables-create-result')
    expect(result.getAttribute('role')).toBe('status')
    expect(result.getAttribute('data-table-name')).toBe('Sales')
    expect(result.textContent).toContain('Created table Sales.')
  })

  it('renders the atom-owned totals result', async () => {
    const store = createStore()
    const rendered = mount(store)

    await store.setter(runToggleTableTotalsAtom, {
      source: tableSource(),
      historyEntryRecorder: recordHistory,
      name: 'Sales',
      enabled: true,
      sheetId: 'sheet-1',
    })

    const result = rendered.getByTestId('tables-totals-result')
    expect(result.getAttribute('role')).toBe('status')
    expect(result.getAttribute('data-table-name')).toBe('Sales')
    expect(result.getAttribute('data-has-totals')).toBe('true')
    expect(result.textContent).toContain('Totals row enabled for Sales.')
  })

  it('renders and clears a command diagnostic through its command atom', async () => {
    const store = createStore()
    const rendered = mount(store)

    await store.setter(runCreateTableAtom, {
      source: tableSource(),
      historyEntryRecorder: recordHistory,
      sheetId: 'sheet-1',
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })

    const diagnostic = rendered.getByTestId('tables-diagnostic')
    expect(diagnostic.getAttribute('role')).toBe('alert')
    expect(diagnostic.getAttribute('data-table-diagnostic-code')).toBe('invalid-selection')

    fireEvent.click(rendered.getByTestId('tables-diagnostic-dismiss'))
    expect(rendered.queryByTestId('tables-diagnostic')).toBeNull()
  })
})
