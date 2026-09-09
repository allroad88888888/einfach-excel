import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FillSeriesTools } from '../../../src/workbook/chrome/ribbon/FillSeriesTools'

type Input = RustWorkbookCommands['range.fill']['payload']
const result = (p: Input): RustWorkbookCommands['range.fill']['result'] => ({
  acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
  projection: { ...p.projection, cells: [], revision: 1 }, sizes: { rowHeights: [], colWidths: [] },
})
async function setup() {
  const fill = vi.fn(async (p: Input) => result(p))
  const request = (async (cmd: string, p: unknown) => cmd === 'range.fill' ? fill(p as Input)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
  ) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book', sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 10, col: 0 }, extend: true })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <FillSeriesTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fill series' }))
  })
  return { fill }
}
const dialog = () => screen.getByRole('dialog', { name: 'Fill series' })
async function apply() {
  await act(async () => { fireEvent.submit(dialog().querySelector('form')!) })
}

test.each(['number', 'text-number', 'linear-trend', 'weekday-name', 'month-name', 'custom-list'])(
  '%s is an atom-controlled option', async (kind) => {
  const { fill } = await setup()
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Sequence type'), { target: { value: kind } })
  })
  const minimum = kind === 'linear-trend' ? 3 : ['number', 'text-number'].includes(kind) ? 2 : 1
  expect(screen.getByLabelText('Source sample count')).toHaveValue(minimum)
  if (kind === 'custom-list') await act(async () => {
    fireEvent.change(screen.getByLabelText('Custom list items'), { target: { value: 'Low\nMedium\nHigh' } })
  })
  await apply()
  expect(fill).toHaveBeenCalledTimes(1)
  expect(fill.mock.lastCall![0].request.series?.kind).toBe(kind)
  if (kind === 'custom-list') expect(fill.mock.lastCall![0].request.series?.customValues)
    .toEqual(['Low', 'Medium', 'High'])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Fill series' })).toHaveFocus()
})

test('custom list draft survives native rejection, busy disables textarea, reopening retains it', async () => {
  const { fill } = await setup()
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Sequence type'), { target: { value: 'custom-list' } })
  })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Custom list items'), { target: { value: 'Low\nLow' } })
  })
  fill.mockRejectedValueOnce(new Error('list values must be unique'))
  await apply()
  expect(screen.getByRole('alert')).toHaveTextContent('unique')
  expect(screen.getByLabelText('Custom list items')).toHaveValue('Low\nLow')
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Custom list items'), { target: { value: 'Low\nHigh' } })
  })
  let finish!: (r: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await apply()
  expect(screen.getByLabelText('Custom list items')).toBeDisabled()
  await act(async () => { finish(result(fill.mock.lastCall![0])) })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Fill series' }))
  })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Sequence type'), { target: { value: 'custom-list' } })
  })
  expect(screen.getByLabelText('Custom list items')).toHaveValue('Low\nHigh')
})

test('invalid input and native errors remain visible and can be corrected', async () => {
  const { fill } = await setup()
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Source sample count'), { target: { value: '100' } })
  })
  await apply()
  expect(screen.getByRole('alert')).toHaveTextContent('enough samples')
  expect(fill).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Source sample count'), { target: { value: '2' } })
  })
  fill.mockRejectedValueOnce(new Error('Invalid source'))
  await apply()
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid source')
  await apply()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('pending requests disable controls until completion; cancel never writes', async () => {
  const { fill } = await setup()
  let finish!: (r: ReturnType<typeof result>) => void
  fill.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await apply()
  expect(screen.getByRole('status')).toHaveTextContent('Extending series')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByLabelText('Sequence type')).toBeDisabled()
  expect(screen.getByLabelText('Source sample count')).toBeDisabled()
  await act(async () => { finish(result(fill.mock.calls[0]![0])) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fill series' })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
  expect(fill).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).toBeNull()
})
