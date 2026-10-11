import { createStore } from '@einfach/core'
import {
  editingSessionAtom, editingCommitLifecycleAtom, type DisplayCell, type EditingCommitRequest,
  type VisibleProjectionRequest, type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import { focusedCellEditor } from '../../support/cell-editing-harness'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

const table = { name: 'Sales', sheet: 'Sales Orders', sheetIndex: 0, range: 'A1:B4',
  hasHeaders: true, hasTotals: false, columns: ['Amount', 'Total'] }
const numbers = (values: number[], formula?: string): DisplayCell[] => values.map((value, i) => ({
  row: i + 1, col: 1, displayValue: String(value), valueKind: 'number', numericValue: value,
  ...(formula ? { formula, inputText: formula } : {}),
}))

function setup(before: DisplayCell[], after: DisplayCell[], range = table.range) {
  const store = createStore(), commands: string[] = []
  initializeSalesOrdersStore(store)
  const project = (
    request: VisibleProjectionRequest, changed: boolean,
  ): VisibleProjectionResult => ({
    ...request, revision: changed ? 1 : 0,
    cells: changed ? after : before,
    tables: [{ ...table, range: changed ? range : table.range }],
  })
  const read = vi.fn(async (request: VisibleProjectionRequest) => project(request, false))
  const setCellInput = vi.fn(async (request: EditingCommitRequest) => ({
    sheetId: request.sheetId, requestId: request.requestId, revision: 1,
  }))
  const returnedProjection = vi.fn(async (request: VisibleProjectionRequest) =>
    project(request, true))
  const connection = createTestRustWorkbookConnection({
    onRequest: (command) => commands.push(command), readVisibleProjection: read,
    setCellInput, setCellProjection: returnedProjection,
  })
  render(<WorkbookStoreProvider connection={connection} store={store}>
    <WorkbookView />
  </WorkbookStoreProvider>)
  return { store, commands, read, setCellInput, returnedProjection }
}
async function cell(row: number, col = 1) {
  return waitFor(() => {
    const target = document.querySelector<HTMLElement>(`td[data-cell="${row}:${col}"]`)
    expect(target).not.toBeNull()
    return target!
  })
}

test.each([
  { name: 'creates a calculated column', row: 2, col: 1, input: '=[@Amount]*2',
    before: [], after: numbers([2, 4, 6], '=[@Amount]*2'), range: 'A1:B4' },
  { name: 'updates a calculated column', row: 1, col: 1, input: '=[@Amount]*3',
    before: numbers([2, 4, 6], '=[@Amount]*2'),
    after: numbers([3, 6, 9], '=[@Amount]*3'), range: 'A1:B4' },
  { name: 'inherits into a new row', row: 4, col: 0, input: '4',
    before: numbers([2, 4, 6], '=[@Amount]*2'),
    after: [...numbers([2, 4, 6, 8], '=[@Amount]*2'),
      { row: 4, col: 0, displayValue: '4' }], range: 'A1:B5' },
])('$name by rendering the single returned native projection', async (scenario) => {
  const controlled = setup(scenario.before, scenario.after, scenario.range)
  fireEvent.doubleClick(await cell(scenario.row, scenario.col))
  const editor = await focusedCellEditor()
  fireEvent.change(editor, { target: { value: scenario.input } })
  fireEvent.keyDown(editor, { key: 'Enter' })
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
  for (const expected of scenario.after) {
    await waitFor(async () => expect(await cell(expected.row, expected.col))
      .toHaveTextContent(expected.displayValue))
  }
  expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
  expect(controlled.setCellInput).toHaveBeenCalledWith(expect.objectContaining({
    row: scenario.row, col: scenario.col, input: scenario.input,
  }))
  expect(controlled.returnedProjection).toHaveBeenCalledTimes(1)
  expect(controlled.read).toHaveBeenCalledTimes(1)
  // 选中数值会读取状态栏统计；这不是额外写入或投影刷新。
  expect(controlled.commands.filter((command) =>
    command !== 'validation.read' && command !== 'selection.aggregate'))
    .toEqual(['projection.readVisible', 'cell.setInput'])
})

test('native rejection retains the draft and does not replace any calculated value', async () => {
  const before = numbers([2, 4, 6], '=[@Amount]*2')
  const controlled = setup(before, numbers([99, 99, 99]))
  controlled.setCellInput.mockRejectedValueOnce(new Error('FORMULA_CYCLE'))
  fireEvent.doubleClick(await cell(2))
  const editor = await focusedCellEditor()
  fireEvent.change(editor, { target: { value: '=B3+1' } })
  fireEvent.keyDown(editor, { key: 'Enter' })
  await waitFor(() => expect(controlled.store.getter(editingCommitLifecycleAtom).status)
    .toBe('rejected'))
  await waitFor(() => expect(controlled.store.getter(editingSessionAtom)).toMatchObject({
    status: 'drafting', draft: '=B3+1',
  }))
  await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
  expect(controlled.returnedProjection).not.toHaveBeenCalled()
  expect(controlled.read).toHaveBeenCalledTimes(1)
  expect(await cell(1)).toHaveTextContent('2')
  expect(await cell(3)).toHaveTextContent('6')
  expect(editor).toHaveValue('=B3+1')
})
