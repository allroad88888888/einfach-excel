import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  startCellEditingFromProjectionAtom,
  setSheetProtectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { VisibilityTools } from '../../../src/workbook/chrome/ribbon/VisibilityTools'

type Input = RustWorkbookCommands['range.visibility']['payload']
async function setup() {
  const project = (input: VisibleProjectionRequest) => ({
    ...input,
    cells: [],
    revision: 0,
    visibility: { manualRows: [], manualColumns: [], filterRows: [] },
  })
  const change = vi.fn(async (input: Input) => ({
    changed: true,
    projection: { ...project(input.projection), revision: 1 },
  }))
  const request = (async (command: string, payload: unknown) =>
    command === 'range.visibility'
      ? change(payload as Input)
      : project(
          (payload as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <VisibilityTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  return { store, change }
}
const menu = () => screen.getByRole('combobox', { name: 'Row and column visibility' })
async function choose(action: string) {
  await act(async () => {
    fireEvent.change(menu(), { target: { value: action } })
  })
}

test.each(['hide-rows', 'hide-columns', 'unhide', 'unhide-all'])(
  '%s dispatches one command and restores the menu placeholder',
  async (action) => {
    const { change } = await setup()
    await choose(action)
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0]![0]).toMatchObject({
      action: action === 'unhide-all' ? 'unhide' : action,
      range:
        action === 'unhide-all'
          ? { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 7 }
          : { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
    })
    expect(menu()).toHaveValue('')
    expect(menu()).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  },
)

test('an unresolved native request visibly disables the menu', async () => {
  const { change } = await setup()
  let finish!: (value: Awaited<ReturnType<typeof change>>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await choose('hide-rows')
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Updating visibility')
  const input = change.mock.calls[0]![0]
  await act(async () => {
    finish({
      changed: true,
      projection: {
        ...input.projection,
        cells: [],
        revision: 1,
        visibility: { manualRows: [], manualColumns: [], filterRows: [] },
      },
    })
  })
  expect(menu()).toBeEnabled()
  expect(screen.queryByRole('status')).toBeNull()
})

test('native failure is visible and the same control can retry', async () => {
  const { change } = await setup()
  change.mockRejectedValueOnce(new Error('Try again'))
  await choose('hide-columns')
  expect(screen.getByRole('alert')).toHaveTextContent('Try again')
  expect(menu()).toBeEnabled()
  await choose('hide-columns')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(change).toHaveBeenCalledTimes(2)
})

test('protected sheets show a reason without calling Rust', async () => {
  const { store, change } = await setup()
  act(() => {
    store.setter(setSheetProtectionAtom, {
      sheetId: 's',
      state: { mode: 'protected', unlockedRanges: [] },
    })
  })
  await choose('hide-rows')
  expect(screen.getByRole('alert')).toHaveTextContent('Unprotect the worksheet')
  expect(change).not.toHaveBeenCalled()
})

test('an active cell draft disables visibility changes', async () => {
  const { store, change } = await setup()
  act(() => {
    store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 's',
      cell: { row: 1, col: 1 },
      source: 'cell',
    })
  })
  expect(menu()).toBeDisabled()
  expect(change).not.toHaveBeenCalled()
})
