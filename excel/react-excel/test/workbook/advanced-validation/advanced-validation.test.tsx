import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import {
  beginProjectionAtom,
  resolveProjectionAtom,
  initializeWorkbookDocumentAtom,
  setSelectionAtom,
  type RustWorkbookConnection,
  type NativeDataValidationRule,
  offerNativeValidationConfirmationAtom,
  editingSessionAtom,
  startEditingAtom,
} from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { DataValidationTools } from '../../../src/workbook/chrome/ribbon/DataValidationTools'
import { ValidationErrorAlert } from '../../../src/workbook/advanced-validation/ValidationErrorAlert'

function setup(rule: NativeDataValidationRule | null = null) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 }],
  })
  store.setter(setSelectionAtom, {
    sheetId: 's',
    kind: 'range',
    anchor: { row: 1, col: 1 },
    focus: { row: 1, col: 1 },
  })
  const read = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 },
    reason: 'viewport',
  })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, {
    request: read.request,
    result: { ...read.request, cells: [], revision: 1 },
  })
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'validation.read') return rule
    return {
      projection: { ...(payload as { projection: object }).projection, cells: [], revision: 2 },
    }
  })
  render(
    <WorkbookStoreProvider
      store={store}
      connection={{ request: request as RustWorkbookConnection['request'], dispose() {} }}
    >
      <DataValidationTools />
      <ValidationErrorAlert />
    </WorkbookStoreProvider>,
  )
  return { store, request }
}
async function click(name: string) {
  const exactName = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: exactName }))
  })
}
async function change(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } })
  })
}

test('custom formula and messages load from native and submit their exact draft fields', async () => {
  const { request } = setup({ kind: 'custom-formula', formula: '=B2>0', ignoreBlank: false,
    inputMessage: { title: 'Quantity', message: 'Enter a positive value' },
    errorAlert: { style: 'warning', title: 'Check quantity', message: 'Positive only' } })
  await click('Data validation')
  expect(screen.getByLabelText('Validation formula')).toHaveValue('=B2>0')
  expect(screen.queryByLabelText('Minimum')).toBeNull()
  expect(screen.getByLabelText('Input title')).toHaveValue('Quantity')
  await change('Validation formula', '=B2>1'); await change('Error alert', 'information')
  await click('Apply')
  expect(request.mock.calls[1]).toMatchObject(['validation.change', { rule: {
    kind: 'custom-formula', formula: '=B2>1', inputMessage: { title: 'Quantity', message: 'Enter a positive value' },
    errorAlert: { style: 'information', title: 'Check quantity', message: 'Positive only' },
  } }])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Data validation' })).toHaveFocus()
})

test('deferred native read is visibly busy and Cancel suppresses a late native answer', async () => {
  const { request } = setup()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Data validation')
  expect(screen.getByRole('status')).toBeVisible()
  expect(screen.getByLabelText('Allow')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  await click('Cancel')
  expect(screen.getByRole('button', { name: 'Data validation' })).toHaveFocus()
  await act(async () => { finish({ kind: 'custom-formula', formula: '=TRUE', ignoreBlank: true }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Data validation' })).toHaveFocus()
})

test('deferred validation read focuses the range once without disturbing later form edits', async () => {
  const { request } = setup()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Data validation')
  const dialog = screen.getByRole('dialog')
  const modalAttributes = vi.spyOn(dialog, 'setAttribute')
  expect(screen.getByLabelText('Applies to')).toBeDisabled()
  await act(async () => {
    finish({ kind: 'custom-formula', formula: '=B2>0', ignoreBlank: true })
  })
  expect(screen.getByLabelText('Applies to')).toHaveFocus()
  const formula = screen.getByLabelText('Validation formula')
  formula.focus()
  await change('Validation formula', '=B2>2')
  await change('Error title', 'Keep editing')
  expect(formula).toHaveFocus()
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  await click('Apply')
  expect(screen.getByLabelText('Applies to')).toBeDisabled()
  await act(async () => { fail(new Error('Native save failed')) })
  expect(screen.getByRole('dialog')).toBe(dialog)
  expect(dialog).toHaveAttribute('open')
  expect(screen.getByRole('alert')).toHaveTextContent('Native save failed')
  expect(screen.getByLabelText('Validation formula')).toHaveValue('=B2>2')
  expect(screen.getByLabelText('Applies to')).not.toHaveFocus()
  expect(modalAttributes).not.toHaveBeenCalledWith('open', '')
  await click('Cancel')
  expect(screen.getByRole('button', { name: 'Data validation' })).toHaveFocus()
})

test('deferred save disables duplicate submit and cancellation while retaining failed draft', async () => {
  const { request } = setup({ kind: 'custom-formula', formula: '=B2>0', ignoreBlank: false })
  await click('Data validation'); await change('Validation formula', '=B2>2')
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  await click('Apply')
  expect(screen.getByRole('status')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.getByRole('dialog')).toBeVisible()
  await act(async () => { fail(new Error('Native save failed')) })
  expect(screen.getByLabelText('Validation formula')).toHaveValue('=B2>2')
  expect(screen.getByRole('alert')).toHaveTextContent('Native save failed')
  expect(request).toHaveBeenCalledTimes(2)
})

test('Stop presents native text without a modal or Continue and dismissal preserves the draft', async () => {
  const { store, request } = setup()
  const opener = screen.getByRole('button', { name: 'Data validation' }); opener.focus()
  await act(async () => {
    store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 1 }, source: 'cell', draft: 'invalid' })
    store.setter(offerNativeValidationConfirmationAtom, { error: Object.assign(new Error('DATA_VALIDATION_FAILED'),
      { detail: { title: 'Check quantity', message: '<b>Plain text only</b>' } }), operation: { command: 'cell.setInput' } })
  })
  expect(screen.getByRole('status', { name: 'Check quantity' })).toHaveTextContent('<b>Plain text only</b>')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  await click('Dismiss validation message')
  expect(store.getter(editingSessionAtom).draft).toBe('invalid')
  expect(request).not.toHaveBeenCalled()
})

test('Warning and Information provide distinct explicit Continue and Cancel choices', async () => {
  const { store, request } = setup()
  for (const code of ['WARNING', 'INFORMATION']) {
    await act(async () => {
      store.setter(offerNativeValidationConfirmationAtom, { error: new Error(`DATA_VALIDATION_${code}`),
        operation: { command: 'cell.setInput' } })
    })
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeEnabled()
    await click('Cancel')
  }
  expect(request).not.toHaveBeenCalled()
})
