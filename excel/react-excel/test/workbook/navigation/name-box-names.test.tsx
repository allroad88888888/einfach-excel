import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  selectCellAtom,
  type RustWorkbookCommands, type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { NameBox } from '../../../src/workbook/chrome/formula-bar/NameBox'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision: 1, namedRanges: [] } })
  type Input = RustWorkbookCommands['namedRange.change']['payload']
  const request = vi.fn(async (_command: string, input: Input) => ({
    changed: true, projection: { ...input.projection, cells: [], revision: 2,
      namedRanges: [{ name: input.action.name,
        target: { sheet: 0, range: [0, 0, 0, 0] as const } }] },
  }))
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><div className="workbook"><NameBox />
    <div data-workbook-grid="true" tabIndex={0} aria-label="Grid" />
    <button type="button">Other control</button>
  </div></WorkbookStoreProvider>)
  const input = screen.getByRole('textbox', { name: 'Name box' })
  const enter = async (value: string) => {
    await act(async () => {
      input.focus()
      fireEvent.input(input, { target: { value } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
  }
  return { store, request, input, enter }
}

test('refocusing after selection changes selects the new address, not an obsolete draft', async () => {
  const { store, input, enter } = setup()
  await enter('B2')
  act(() => { store.setter(selectCellAtom, { sheetId: 's', coord: { row: 29, col: 2 } }) })
  expect(input).toHaveValue('C30')
  act(() => { input.focus() })
  expect((input as HTMLInputElement).selectionStart).toBe(0)
  expect((input as HTMLInputElement).selectionEnd).toBe(3)
})

test('Enter creates one name and returns focus to the grid after its response', async () => {
  const { request, input, enter } = setup()
  await enter('Revenue')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][0]).toBe('namedRange.change')
  expect(input).toHaveValue('Revenue')
  expect(screen.getByLabelText('Grid')).toHaveFocus()
})

test('native error stays visible and correctable; Escape clears it without another write', async () => {
  const { request, input, enter } = setup()
  request.mockRejectedValueOnce(new Error('Invalid name'))
  await enter('!!invalid')
  expect(input).toHaveFocus()
  expect(input).toHaveValue('!!invalid')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid name')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(input).toHaveValue('A1')
  expect(screen.getByLabelText('Grid')).toHaveFocus()
  expect(request).toHaveBeenCalledTimes(1)
})

test('pending input is readonly, Enter and blur do not duplicate or reclaim moved focus', async () => {
  const { request, input, enter } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await enter('Revenue')
  expect(input).toHaveAttribute('readonly')
  expect(input).toHaveAttribute('aria-busy', 'true')
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' })
    screen.getByRole('button', { name: 'Other control' }).focus()
  })
  const payload = request.mock.calls[0][1]
  await act(async () => finish({ changed: true, projection: { ...payload.projection,
    cells: [], revision: 2, namedRanges: [{ name: 'Revenue', target: { sheet: 0, range: [0, 0, 0, 0] } }] } }))
  expect(input).not.toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: 'Other control' })).toHaveFocus()
  expect(request).toHaveBeenCalledTimes(1)
})

test('blur alone creates a name but composition Enter does not submit', async () => {
  const { request, input } = setup()
  await act(async () => {
    input.focus()
    fireEvent.input(input, { target: { value: '销售额' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  })
  expect(request).not.toHaveBeenCalled()
  await act(async () => { screen.getByRole('button', { name: 'Other control' }).focus() })
  expect(request).toHaveBeenCalledTimes(1)
  expect(input).toHaveValue('销售额')
})
