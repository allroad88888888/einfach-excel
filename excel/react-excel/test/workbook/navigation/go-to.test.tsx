import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import {
  activeWorkbookSheetAtom, initializeWorkbookDocumentAtom, selectionSnapshotAtom,
  startEditingAtom, goToHistoryAtom,
} from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { GoToTools } from '../../../src/workbook/chrome/ribbon/GoToTools'

function setup() {
  const store = createStore()
  const request = vi.fn()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 'orders', name: 'Orders', index: 0, rowCount: 1000, colCount: 20 },
    { id: 'summary', name: 'Summary', index: 1, rowCount: 100, colCount: 8 },
  ] })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose: vi.fn() }}>
    <div className="workbook"><GoToTools /><div data-workbook-grid="true" tabIndex={0}>Grid</div></div>
  </WorkbookStoreProvider>)
  return { store, request }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function submit(input: string) {
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: input } })
  click('Go')
}

test('dialog uses existing atoms, focuses the reference and navigates without a workbook write', () => {
  const { store, request } = setup()
  click('Go to')
  expect(screen.getByLabelText('Reference')).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  expect(screen.getByText('No recent locations yet.')).toBeVisible()
  submit('$B$12:$D$18')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 11, rowEnd: 17, colStart: 1, colEnd: 3,
  })
  expect(screen.getByText('Grid')).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('cross-sheet references activate the target and recent location buttons execute fixed addresses', () => {
  const { store, request } = setup()
  click('Go to')
  submit('Summary!B2')
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  click('Go to')
  submit('Orders!C4')
  click('Go to')
  click("'Summary'!B2")
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 'summary', row: 1, col: 1 })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('bad references stay correctable, draft updates clear the error, and Enter submits a relative reference', () => {
  const { store } = setup()
  click('Go to')
  submit('B1001')
  expect(screen.getByRole('alert')).toHaveTextContent('outside')
  expect(screen.getByLabelText('Reference')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'R[2]C[1]' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.submit(screen.getByLabelText('Reference').closest('form')!)
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 2, col: 1 })
})

test.each(['Cancel', 'Escape'])('%s discards input and errors without moving or adding history', (method) => {
  const { store, request } = setup()
  click('Go to')
  submit('invalid')
  if (method === 'Cancel') click('Cancel')
  else fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Grid')).toHaveFocus()
  click('Go to')
  expect(screen.getByLabelText('Reference')).toHaveValue('')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(store.getter(goToHistoryAtom)).toEqual([])
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
  expect(request).not.toHaveBeenCalled()
})

test('pending editing disables navigation but retains the ability to cancel an open dialog', () => {
  const { store } = setup()
  click('Go to')
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'B2' } })
  act(() => store.setter(startEditingAtom, {
    sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'cell', draft: 'unchanged',
  }))
  expect(screen.getByRole('button', { name: 'Go to' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('Tab cycles between reference and the last enabled action', () => {
  setup()
  click('Go to')
  fireEvent.keyDown(screen.getByLabelText('Reference'), { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Tab' })
  expect(screen.getByLabelText('Reference')).toHaveFocus()
})
