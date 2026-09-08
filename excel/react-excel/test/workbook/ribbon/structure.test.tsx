import { createStore } from '@einfach/core'
import {
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
import { StructureTools } from '../../../src/workbook/chrome/ribbon/StructureTools'

type Input = RustWorkbookCommands['sheet.editStructure']['payload']
const sheet = { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }
const project = (p: VisibleProjectionRequest) => ({
  ...p,
  cells: [],
  revision: 0,
  visibility: { manualRows: [], manualColumns: [], filterRows: [] },
})
function result(input: Input) {
  const delta = input.edit.action.startsWith('insert') ? 1 : -1
  const rows = input.edit.action.endsWith('rows')
  const next = { ...sheet, rowCount: rows ? 100 + delta : 100, colCount: rows ? 8 : 8 + delta }
  return {
    sheet: next,
    sizes: { rowHeights: [], colWidths: [] },
    range: {
      rowStart: 0,
      colStart: 0,
      rowEnd: Math.max(100, next.rowCount) - 1,
      colEnd: Math.max(8, next.colCount) - 1,
    },
    projection: { ...project(input.projection), revision: 1 },
  }
}
async function setup() {
  const change = vi.fn(async (input: Input) => result(input))
  const request = (async (command: string, payload: unknown) =>
    command === 'sheet.editStructure'
      ? change(payload as Input)
      : project(
          (payload as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [sheet] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <StructureTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 3 },
    })
  })
  return { store, change }
}
const menu = () => screen.getByRole('combobox', { name: 'Insert or delete rows and columns' })
async function choose(action: string) {
  await act(async () => {
    fireEvent.change(menu(), { target: { value: action } })
  })
}

test.each(['insert-rows', 'insert-columns', 'delete-rows', 'delete-columns'])(
  '%s dispatches the selected cell axis once and resets the menu',
  async (action) => {
    const { change } = await setup()
    await choose(action)
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0]![0].edit).toEqual({ action, at: 1, count: 1 })
    expect(menu()).toHaveValue('')
    expect(menu()).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  },
)

test('unresolved insertion disables the control and shows visible progress', async () => {
  const { change } = await setup()
  let finish!: (value: ReturnType<typeof result>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await choose('insert-rows')
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Updating rows and columns')
  await act(async () => {
    finish(result(change.mock.calls[0]![0]))
  })
  expect(menu()).toBeEnabled()
  expect(screen.queryByRole('status')).toBeNull()
})

test('native failure is readable and the same menu can retry', async () => {
  const { change } = await setup()
  change.mockRejectedValueOnce(new Error('The worksheet size limit would be exceeded.'))
  await choose('insert-columns')
  expect(screen.getByRole('alert')).toHaveTextContent('size limit')
  expect(menu()).toBeEnabled()
  await choose('insert-columns')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('editing disables insertion and deletion', async () => {
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
