import { createStore } from '@einfach/core'
import {
  runVisibleProjectionAtom, setSelectionAtom, setSelectionBoundsAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { SelectionStatus } from '../../../src/workbook/chrome/footer/SelectionStatus'

type Numbers = RustWorkbookCommands['selection.aggregate']['result']
const numbers: Numbers = {
  count: 5, numericCount: 3, sum: 12, average: 4, min: 1, max: 7, revision: 0,
}
async function setup(pending?: Promise<Numbers>) {
  const aggregate = vi.fn(async (): Promise<Numbers> => numbers)
  if (pending) aggregate.mockReturnValueOnce(pending)
  const request = (async (command: string, payload: unknown) => {
    if (command === 'selection.aggregate') return aggregate()
    return { ...(payload as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
  }) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  const select = async (row: number) => act(async () => {
    store.setter(setSelectionAtom, {
      kind: 'cell', sheetId: 's', anchor: { row, col: 0 }, focus: { row, col: 0 },
    })
  })
  await select(0)
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <button type="button">Grid remains available</button>
    <SelectionStatus />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'test',
    })
  })
  return { aggregate, select }
}

test('renders all Rust statistics and preserves precise values in titles', async () => {
  await setup()
  const status = screen.getByRole('status', { name: 'Selection statistics' })
  expect(status).toHaveTextContent('Numerical count: 3')
  expect(status).toHaveTextContent('Sum: 12')
  expect(status).toHaveTextContent('Average: 4')
  expect(screen.getByText('Sum: 12')).toHaveAttribute('title', '12')
  expect(screen.getByText('Count: 5')).toBeVisible()
  expect(screen.getByText('Min: 1')).toHaveAttribute('title', '1')
  expect(screen.getByText('Max: 7')).toHaveAttribute('title', '7')
})

test('statistics wait locally and a late old selection cannot reappear', async () => {
  let finish!: (value: Numbers) => void
  const r = await setup(new Promise((resolve) => { finish = resolve }))
  expect(screen.getByText('Calculating selection…')).toBeVisible()
  expect(screen.getByRole('button')).toBeVisible()
  r.aggregate.mockResolvedValue({ ...numbers, sum: 99, average: 33, min: 33, max: 33 })
  await r.select(9)
  expect(await screen.findByText('Sum: 99')).toBeVisible()
  expect(screen.getByText('Min: 33')).toBeVisible()
  expect(screen.getByText('Max: 33')).toBeVisible()
  await act(async () => { finish(numbers) })
  expect(screen.queryByText('Sum: 12')).toBeNull()
  expect(screen.queryByText('Min: 1')).toBeNull()
})

test('empty values, overflow, and errors are distinguishable and recover on selection', async () => {
  const r = await setup()
  r.aggregate.mockResolvedValueOnce({
    count: 0, numericCount: 0, sum: null, average: null, min: null, max: null, revision: 0,
  })
  await r.select(1)
  expect(screen.getByText('Numerical count: 0')).toBeVisible()
  expect(screen.getByText('Sum: —')).toBeVisible()
  expect(screen.getByText('Average: —')).toBeVisible()
  expect(screen.getByText('Count: 0')).toBeVisible()
  expect(screen.getByText('Min: —')).toBeVisible()
  expect(screen.getByText('Max: —')).toBeVisible()
  r.aggregate.mockResolvedValueOnce({
    count: 2, numericCount: 2, sum: null, average: 1e308, min: 1e308, max: 1e308, revision: 0,
  })
  await r.select(2)
  expect(screen.getByText('Sum: Out of range')).toBeVisible()
  r.aggregate.mockRejectedValueOnce(new Error('Worker stopped'))
  await r.select(3)
  expect(screen.getByText('Statistics unavailable')).toHaveAttribute('title', 'Worker stopped')
  expect(screen.queryByText('Sum: Out of range')).toBeNull()
  await r.select(4)
  expect(screen.getByText('Sum: 12')).toBeVisible()
})

test('text-only count remains visible without inventing numeric extrema', async () => {
  const r = await setup()
  r.aggregate.mockResolvedValueOnce({
    count: 3, numericCount: 0, sum: null, average: null, min: null, max: null, revision: 0,
  })
  await r.select(2)
  expect(screen.getByText('Count: 3')).toBeVisible()
  expect(screen.getByText('Numerical count: 0')).toBeVisible()
  expect(screen.getByText('Min: —')).toBeVisible()
  expect(screen.getByText('Max: —')).toBeVisible()
  expect(r.aggregate).toHaveBeenCalledTimes(2)
})
