import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  startCellEditingFromProjectionAtom, type RustWorkbookCommands,
  type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FillTools } from '../../../src/workbook/chrome/ribbon/FillTools'

type Input = RustWorkbookCommands['range.fill']['payload']
const result = (p: Input): RustWorkbookCommands['range.fill']['result'] => ({
  acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
  projection: { ...p.projection, cells: [], revision: 1 },
  sizes: { rowHeights: [], colWidths: [] },
})
async function setup() {
  const fill = vi.fn(async (p: Input) => result(p))
  const request = (async (command: string, payload: unknown) => command === 'range.fill'
    ? fill(payload as Input)
    : { ...(payload as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
  ) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book', sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 3 }, extend: true })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <FillTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  return { store, fill }
}
const menu = () => screen.getByRole('combobox', { name: 'Fill selected range' })
async function choose(value: string) {
  await act(async () => { fireEvent.change(menu(), { target: { value } }) })
}

test.each(['down', 'right'])('%s sends one command and resets the menu', async (direction) => {
  const { fill } = await setup()
  await choose(direction)
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.calls[0]![0].request).toMatchObject({
    direction, range: { rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 },
  })
  expect(menu()).toHaveValue('')
  expect(screen.getByLabelText('Fill status')).toHaveTextContent(`Filled ${direction}.`)
})

test('busy state prevents repeat operations; completion re-enables menu', async () => {
  const { fill } = await setup()
  let finish!: (value: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await choose('down')
  expect(fill).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('Filling down')
  expect(menu()).toBeDisabled()
  await act(async () => { finish(result(fill.mock.calls[0]![0])) })
  expect(menu()).toBeEnabled()
})

test('native failure is visible and menu allows retry', async () => {
  const { fill } = await setup()
  fill.mockRejectedValueOnce(new Error('Unmerge first'))
  await choose('right')
  expect(screen.getByRole('alert')).toHaveTextContent('Unmerge first')
  expect(menu()).toBeEnabled()
  await choose('right')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(fill).toHaveBeenCalledTimes(2)
})

test('editing disables fill; a single cell explains the required range', async () => {
  const { store, fill } = await setup()
  act(() => store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } }))
  await choose('down')
  expect(screen.getByRole('alert')).toHaveTextContent('Include a source row or column')
  act(() => store.setter(startCellEditingFromProjectionAtom, {
    sheetId: 's', cell: { row: 1, col: 1 }, source: 'cell',
  }))
  expect(menu()).toBeDisabled()
  expect(fill).not.toHaveBeenCalled()
})
