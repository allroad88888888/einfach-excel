import { act, fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { editingSessionAtom, selectCellAtom, setSheetProtectionAtom, startEditingAtom } from '@einfach/spreadsheet-ui-core'
import { showArguments } from './harness'

function open(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Insert function' }))
  fireEvent.change(screen.getByRole('listbox', { name: 'Function' }), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Fill arguments' }))
  return screen.getByRole('dialog', { name: `Function arguments · ${name}` })
}
function fill(name: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
}

test('the real picker opens a metadata form, transfers a complete editable formula and Escape writes nothing', () => {
  const { store, request } = showArguments()
  open('SUM')
  expect(screen.getByRole('textbox', { name: 'number (1)' })).toHaveFocus()
  fill('number (1)', 'SUM(1,2)')
  fireEvent.click(screen.getByRole('button', { name: 'Add argument group' }))
  fill('number (2)', '{3,4}')
  fireEvent.click(screen.getByRole('button', { name: 'Create formula draft' }))
  const input = screen.getByRole('textbox', { name: 'Active cell value' })
  expect(input).toHaveValue('=SUM(SUM(1,2),{3,4})')
  expect(input).toHaveFocus()
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('required errors retain values and focus the missing parameter before a corrected LET handoff', () => {
  const { request } = showArguments()
  open('LET'); fill('name (1)', 'x')
  fireEvent.click(screen.getByRole('button', { name: 'Create formula draft' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Complete every required parameter in each repeated group.')
  expect(screen.getByRole('textbox', { name: 'name (1)' })).toHaveValue('x')
  expect(screen.getByRole('textbox', { name: 'value (1)' })).toHaveFocus()
  fill('value (1)', '3'); fill('calculation', 'x+y')
  fireEvent.click(screen.getByRole('button', { name: 'Add argument group' }))
  fill('name (2)', 'y'); fill('value (2)', '4')
  const inputs = within(screen.getByRole('dialog')).getAllByRole('textbox')
  expect(inputs.map((input) => (input as HTMLInputElement).value)).toEqual(['x', '3', 'y', '4', 'x+y'])
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove group' })[0])
  expect(screen.getByRole('textbox', { name: 'name (1)' })).toHaveValue('y')
  expect(screen.getByRole('textbox', { name: 'calculation' })).toHaveValue('x+y')
  fireEvent.click(screen.getByRole('button', { name: 'Create formula draft' }))
  expect(screen.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=LET(y,4,x+y)')
  expect(request).not.toHaveBeenCalled()
})

test('modal Tab cycles, composing Escape keeps drafts, and ordinary Escape restores the picker trigger', () => {
  const { request } = showArguments()
  const dialog = open('IF')
  const first = screen.getByRole('textbox', { name: 'logical_test' })
  const last = screen.getByRole('button', { name: 'Create formula draft' })
  first.focus(); fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(last).toHaveFocus()
  fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus()
  fill('logical_test', 'TRUE')
  fireEvent.keyDown(first, { key: 'Escape', isComposing: true })
  expect(dialog).toBeInTheDocument()
  fireEvent.keyDown(first, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Insert function' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('a zero-argument form focuses confirmation and a protected target retains its form error', () => {
  const { store, request } = showArguments()
  open('PI')
  expect(screen.getByText('This function takes no arguments.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create formula draft' })).toHaveFocus()
  act(() => { store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } }) })
  fireEvent.click(screen.getByRole('button', { name: 'Create formula draft' }))
  expect(screen.getByRole('alert')).toHaveTextContent('locked')
  expect(store.getter(editingSessionAtom).source).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(request).not.toHaveBeenCalled()
})

test('a busy editor disables the form and a changed target closes it without moving another draft', () => {
  const { store, request } = showArguments()
  open('PI')
  act(() => { store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, draft: 'mine', source: 'cell' }) })
  expect(screen.getByRole('button', { name: 'Create formula draft' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Create formula draft' }))
  expect(store.getter(editingSessionAtom).draft).toBe('mine')
  act(() => { store.setter(selectCellAtom, { sheetId: 's', coord: { row: 4, col: 3 } }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getter(editingSessionAtom).draft).toBe('mine')
  expect(request).not.toHaveBeenCalled()
})
