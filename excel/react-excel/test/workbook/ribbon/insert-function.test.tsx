import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, publishNativeFunctionCatalogAtom, editingSessionAtom,
  type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { InsertFunctionTools } from '../../../src/workbook/chrome/ribbon/InsertFunctionTools'
import { FormulaBar } from '../../../src/workbook/chrome/formula-bar/FormulaBar'

function setup() {
  const store = createStore()
  const request = vi.fn()
  const connection: RustWorkbookConnection = { request, dispose() {} }
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet1', rowCount: 100, colCount: 10 },
  ] })
  store.setter(publishNativeFunctionCatalogAtom, { connection, catalog: { version: 1, functions: [
    { name: 'SUM', category: 'Math & statistics', note: null },
    { name: 'XLOOKUP', category: 'Lookup & reference', note: null },
  ] } })
  render(<WorkbookStoreProvider store={store} connection={connection}>
    <InsertFunctionTools /><FormulaBar />
  </WorkbookStoreProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Insert function' }))
  return { store, request }
}

test('search, category and empty state stay in the shared atom and cancel restores focus', () => {
  const { store, request } = setup()
  const search = screen.getByRole('searchbox', { name: 'Search functions' })
  expect(search).toHaveFocus()
  fireEvent.change(search, { target: { value: 'xlo' } })
  expect(screen.getByRole('listbox', { name: 'Function' })).toHaveValue('XLOOKUP')
  expect(screen.getByText(/Argument help is not available yet/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Math & statistics' } })
  expect(screen.getByRole('status')).toHaveTextContent('No matching functions')
  expect(screen.getByRole('button', { name: 'Insert draft' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Insert function' })).toHaveFocus()
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('insert opens the existing formula bar draft, focuses it and Escape cancels without a write', () => {
  const { store, request } = setup()
  fireEvent.change(screen.getByRole('listbox', { name: 'Function' }), { target: { value: 'XLOOKUP' } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert draft' }))
  const input = screen.getByRole('textbox', { name: 'Active cell value' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(input).toHaveValue('=XLOOKUP(')
  expect(input).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Insert function' })).toBeDisabled()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('known argument help renders in the picker', () => {
  setup()
  expect(screen.getByText('SUM(number1, [number2, ...])')).toBeInTheDocument()
})

test('one Escape closes even a non-empty search and restores the trigger', () => {
  setup()
  const input = screen.getByRole('searchbox', { name: 'Search functions' })
  fireEvent.change(input, { target: { value: 'SUM' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Insert function' })).toHaveFocus()
})
