import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  createControlledCellEditingConnection, firstEditingCell,
  focusedCellEditor, renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

beforeEach(() => {
  // jsdom 不做布局；浏览器中的贴边/滚动几何由真实 E2E 覆盖。
  vi.spyOn(HTMLTextAreaElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(100, 100, 200, 30))
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
})
afterEach(() => vi.restoreAllMocks())

test('cell completion supports keyboard selection, preserves focus and writes only on final Enter', async () => {
  const connection = createControlledCellEditingConnection()
  renderSalesOrdersEditingWorksheet(connection)
  fireEvent.doubleClick(await firstEditingCell())
  const input = await focusedCellEditor()
  fireEvent.change(input, { target: { value: '=SU' } })
  fireEvent.select(input)
  expect(await screen.findByRole('listbox', { name: 'Formula functions' })).toBeVisible()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(screen.getByRole('option', { name: /^SUMIF / })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(input, { key: 'Tab' })
  expect(input).toHaveValue('=SUMIF(')
  expect(input).toHaveFocus()
  expect(connection.setCellInput).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '=SUMIF(B1:B2,1)' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(connection.setCellInput).toHaveBeenCalledTimes(1))
})

test('formula-bar pointer completion keeps its input, shows argument help and ignores IME keys', async () => {
  const connection = createControlledCellEditingConnection()
  renderSalesOrdersEditingWorksheet(connection)
  await firstEditingCell()
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: '=RO' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(input).toHaveValue('=RO')
  const option = screen.getByRole('option', { name: /^ROUND / })
  fireEvent.mouseDown(option)
  fireEvent.click(option)
  expect(input).toHaveValue('=ROUND(')
  expect(input).toHaveFocus()
  expect(screen.getByLabelText('Formula arguments')).toHaveTextContent('ROUND(number, num_digits)')
  fireEvent.input(input, { target: { value: '=ROUND(3.14,' } })
  expect(screen.getByLabelText('Formula arguments').querySelector('strong')).toHaveTextContent('num_digits')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(connection.setCellInput).not.toHaveBeenCalled()
})

test('first Escape hides candidates, second cancels the draft, and another edit opens candidates again', async () => {
  const connection = createControlledCellEditingConnection()
  renderSalesOrdersEditingWorksheet(connection)
  const target = await firstEditingCell()
  fireEvent.doubleClick(target)
  const input = await focusedCellEditor()
  fireEvent.change(input, { target: { value: '=SU' } })
  fireEvent.select(input)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(input).toHaveValue('=SU')
  fireEvent.keyDown(input, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
  fireEvent.doubleClick(target)
  const next = await focusedCellEditor()
  fireEvent.change(next, { target: { value: '=SU' } })
  fireEvent.select(next)
  expect(screen.getByRole('listbox')).toBeVisible()
})
