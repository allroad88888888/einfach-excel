import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { SortTools } from '../../../src/workbook/chrome/ribbon/SortTools'

type Input = RustWorkbookCommands['range.sort']['payload']
const result = (p: Input) => ({
  movedRows: 4, projection: { ...p.projection, cells: [], revision: 1 },
})
const menu = () => screen.getByRole('combobox', { name: 'Sort selected range' })
async function choose(value: string) {
  await act(async () => { fireEvent.change(menu(), { target: { value } }) })
}
async function setup() {
  const sort = vi.fn(async (p: Input) => result(p))
  const request = (async (cmd: string, p: unknown) => cmd === 'range.sort' ? sort(p as Input)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
  ) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 10, col: 2 }, extend: true })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <SortTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  })
  return { sort }
}
async function apply() {
  await act(async () => { fireEvent.submit(screen.getByRole('dialog').querySelector('form')!) })
}

test.each(['asc', 'desc'])('%s dispatches directly and announces completion', async (direction) => {
  const { sort } = await setup()
  await choose(direction)
  expect(sort).toHaveBeenCalledTimes(1)
  expect(sort.mock.lastCall![0].keys).toEqual([{ col: 0, direction }])
  expect(screen.getByLabelText('Sort status')).toHaveTextContent('Sorted 4 rows')
})

test('custom sort uses atom-owned levels and restores trigger focus on completion', async () => {
  const { sort } = await setup()
  await choose('custom')
  await act(async () => {
    fireEvent.click(screen.getByText('First row is a header'))
    fireEvent.click(screen.getByText('Add level'))
  })
  await act(async () => { fireEvent.change(screen.getByLabelText('Sort order 2'), { target: { value: 'desc' } }) })
  expect(screen.getByLabelText('Sort column 2')).toHaveValue('1')
  await apply()
  expect(sort.mock.lastCall![0]).toMatchObject({ hasHeader: true,
    keys: [{ col: 0, direction: 'asc' }, { col: 1, direction: 'desc' }] })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(menu()).toHaveFocus()
})

test('remove and cancel change only the draft; native rejection retains usable options', async () => {
  const { sort } = await setup()
  await choose('custom')
  await act(async () => { fireEvent.click(screen.getByText('Add level')) })
  await act(async () => { fireEvent.click(screen.getByLabelText('Remove sort level 2')) })
  expect(screen.queryByLabelText('Sort column 2')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
  expect(sort).not.toHaveBeenCalled()
  await choose('custom')
  sort.mockRejectedValueOnce(new Error('Unmerge first'))
  await apply()
  expect(screen.getByRole('dialog')).toHaveTextContent('Unmerge first')
  expect(screen.getByLabelText('Sort column 1')).toHaveValue('0')
  await apply()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('pending command disables all changes and prevents cancellation', async () => {
  const { sort } = await setup()
  await choose('custom')
  let finish!: (r: ReturnType<typeof result>) => void
  sort.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await apply()
  expect(menu()).toBeDisabled()
  expect(screen.getByLabelText('Sort column 1')).toBeDisabled()
  expect(screen.getByText('First row is a header').querySelector('input')).toBeDisabled()
  expect(screen.getByText('Cancel')).toBeDisabled()
  await act(async () => { finish(result(sort.mock.lastCall![0])) })
  expect(screen.queryByRole('dialog')).toBeNull()
})
