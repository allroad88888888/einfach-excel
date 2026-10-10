import { createStore } from '@einfach/core'
import {
  cancelEditingAtom, editingSessionAtom, initializeWorkbookDocumentAtom, selectCellAtom,
  type RustWorkbookCommands, type RustWorkbookConnection,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { QuickFormulaTools } from '../../../src/workbook/chrome/ribbon/QuickFormulaTools'
import { FormulaBar } from '../../../src/workbook/chrome/formula-bar/FormulaBar'

type Input = RustWorkbookCommands['formula.suggest']['payload']
function setup() {
  const store = createStore()
  const request = vi.fn(async (_command: string, input: Input) => ({
    target: { row: 4, col: 1 }, input: `=${input.function.toUpperCase()}(B2:B4)`, revision: 0,
  }))
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 4, col: 1 } })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}>
    <QuickFormulaTools /><FormulaBar />
  </WorkbookStoreProvider>)
  return { store, request }
}
const menu = () => screen.getByRole('combobox', { name: 'Quick formula' })
async function choose(value: string) {
  await act(async () => { fireEvent.change(menu(), { target: { value } }) })
}

test.each(['sum', 'average', 'count'])('%s draft uses formula bar focus and Escape', async (fn) => {
  const { store, request } = setup()
  await choose(fn)
  const input = screen.getByRole('textbox', { name: 'Active cell value' })
  expect(input).toHaveValue(`=${fn.toUpperCase()}(B2:B4)`)
  expect(input).toHaveFocus()
  expect(menu()).toBeDisabled()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(menu()).toBeEnabled()
  expect(request).toHaveBeenCalledTimes(1)
})

test('Σ dispatches SUM and native errors remain visible until a successful retry', async () => {
  const { request, store } = setup()
  request.mockRejectedValueOnce(new Error('The result cell is not empty.'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Auto sum' })) })
  expect(screen.getByRole('alert')).toHaveTextContent('not empty')
  expect(menu()).toBeEnabled()
  await choose('average')
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => { store.setter(cancelEditingAtom) })
  expect(menu()).toHaveValue('')
})

test('pending native inference disables both entry points and cannot repeat', async () => {
  const { request } = setup()
  let finish!: (value: RustWorkbookCommands['formula.suggest']['result']) => void
  request.mockImplementationOnce(() => new Promise((resolve) => {
    finish = resolve
  }))
  await choose('sum')
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Auto sum' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Finding formula range')
  await act(async () => {
    finish({ target: { row: 4, col: 1 }, input: '=SUM(B2:B4)', revision: 0 })
  })
  expect(request).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status')).toBeNull()
})
