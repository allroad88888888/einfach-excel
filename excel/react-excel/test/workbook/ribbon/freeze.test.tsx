import {
  createSpreadsheetUi,
  beginProjectionAtom,
  resolveProjectionAtom,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  startCellEditingFromProjectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FreezeTools } from '../../../src/workbook/chrome/ribbon/FreezeTools'

type Input = RustWorkbookCommands['sheet.freeze']['payload']
async function setup() {
  const project = (p: VisibleProjectionRequest) => ({
    ...p,
    cells: [],
    revision: 1,
    freeze: { rows: 0, cols: 0 },
  })
  const change = vi.fn(async (p: Input) => ({
    changed: true,
    projection: { ...project(p.projection), freeze: { rows: p.rows, cols: p.cols } },
  }))
  const request = (async (command: string, payload: unknown) =>
    command === 'sheet.freeze'
      ? change(payload as Input)
      : project(
          (payload as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 1 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    reason: 'viewport',
  })
  render(
    <WorkbookStoreProvider store={store}>
      <FreezeTools />
    </WorkbookStoreProvider>,
  )
  return { store, change }
}
const menu = () => screen.getByRole('combobox', { name: 'Freeze panes' })
async function choose(value: string) {
  await act(async () => {
    fireEvent.change(menu(), { target: { value } })
  })
}

test.each([
  ['first-row', 1, 0],
  ['first-column', 0, 1],
  ['selection', 2, 1],
] as const)(
  '%s dispatches one native command and updates the reusable menu',
  async (action, rows, cols) => {
    const r = await setup()
    await choose(action)
    expect(r.change).toHaveBeenCalledTimes(1)
    expect(r.change.mock.calls[0][0]).toMatchObject({ rows, cols })
    expect(menu()).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Panes frozen' })).toBeInTheDocument()
    await choose('unfreeze')
    expect(r.change.mock.lastCall![0]).toMatchObject({ rows: 0, cols: 0 })
    expect(screen.getByRole('option', { name: 'Unfreeze panes' })).toBeDisabled()
  },
)

test('pending disables repeat actions, and failure remains readable for retry', async () => {
  const r = await setup()
  let reject!: (error: Error) => void
  r.change.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  await choose('first-row')
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Updating freeze')
  await act(async () => {
    reject(new Error('Native refused freeze'))
  })
  expect(menu()).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('Native refused freeze')
  await choose('first-row')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an active cell draft disables freeze without replacing its text', async () => {
  const r = await setup()
  act(() => {
    r.store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 2, col: 1 } })
  })
  expect(menu()).toBeDisabled()
  expect(r.change).not.toHaveBeenCalled()
})

test('a retained but pending projection disables freeze until the current window is ready', async () => {
  const r = await setup()
  let request: VisibleProjectionRequest | undefined
  act(() => {
    const outcome = r.store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId: 's',
      window: { rowStart: 10, rowEnd: 19, colStart: 0, colEnd: 7 },
      reason: 'viewport',
      retainResult: true,
    })
    if (outcome.status === 'started' && outcome.request.kind === 'visible-window') {
      request = outcome.request
    }
  })
  expect(request).toBeDefined()
  expect(menu()).toBeDisabled()
  expect(r.change).not.toHaveBeenCalled()
  act(() => {
    r.store.setter(resolveProjectionAtom, {
      request: request!,
      result: { ...request!, cells: [], freeze: { rows: 0, cols: 0 } },
    })
  })
  expect(menu()).toBeEnabled()
  await choose('first-row')
  expect(r.change).toHaveBeenCalledTimes(1)
})
