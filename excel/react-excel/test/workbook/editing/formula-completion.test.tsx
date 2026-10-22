import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  createControlledCellEditingConnection, firstEditingCell,
  focusedCellEditor, renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

beforeEach(() => {
  // jsdom 不做布局；浏览器中的贴边/滚动几何由真实 E2E 覆盖。
  const originalBounds = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('einfach-spreadsheet')
      ? new DOMRect(0, 0, 1280, 800) : originalBounds.call(this)
  })
  vi.spyOn(HTMLTextAreaElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(100, 100, 200, 30))
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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
  expect(option.closest('.formula-assist')).not.toHaveClass('formula-assist-signature')
  fireEvent.mouseDown(option)
  fireEvent.click(option)
  expect(input).toHaveValue('=ROUND(')
  expect(input).toHaveFocus()
  expect(screen.getByLabelText('Formula arguments')).toHaveTextContent('ROUND(number, num_digits)')
  expect(screen.getByLabelText('Formula arguments').closest('.formula-assist'))
    .toHaveClass('formula-assist-signature')
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

test('a rejected formula announces its error while retaining parameter help and allowing correction', async () => {
  const connection = createControlledCellEditingConnection()
  connection.failNextMutation('INVALID_FORMULA')
  renderSalesOrdersEditingWorksheet(connection)
  fireEvent.doubleClick(await firstEditingCell())
  const input = await focusedCellEditor()
  fireEvent.change(input, { target: { value: '=SUM(' } })
  fireEvent.select(input)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(await screen.findByRole('alert')).toHaveTextContent('That edit was not saved.')
  expect(input).toHaveAccessibleDescription('That edit was not saved.')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveFocus()
  expect(screen.getByLabelText('Formula arguments')).toBeVisible()
  fireEvent.change(input, { target: { value: '=SUM(1,2)' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(connection.setCellInput).toHaveBeenCalledTimes(2)
})

test('formula assistance observes only its own root and releases geometry resources when hidden', async () => {
  const observers: {
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    notify: () => void
  }[] = []
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(notify: () => void) {
      observers.push({ observe: this.observe, disconnect: this.disconnect, notify })
    }
  })
  const connection = createControlledCellEditingConnection()
  renderSalesOrdersEditingWorksheet(connection)
  fireEvent.doubleClick(await firstEditingCell())
  const input = await focusedCellEditor()
  fireEvent.change(input, { target: { value: '=SU' } })
  const root = input.closest('.einfach-spreadsheet')!
  const observer = observers.find(candidate =>
    candidate.observe.mock.calls.some(([node]) => node === root))!
  expect(observer).toBeDefined()
  expect(observer.observe).toHaveBeenCalledTimes(1)
  const popup = root.querySelector<HTMLElement>('.formula-assist')!
  const initialLeft = popup.style.left
  expect(initialLeft).not.toBe('')
  popup.style.left = '999px'
  observer.notify()
  expect(popup.style.left).toBe(initialLeft)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(observer.disconnect).toHaveBeenCalledTimes(1)
  expect(root.querySelector('.formula-assist')).toBeNull()
  expect(input).toHaveValue('=SU')
  expect(input).toHaveFocus()
})
