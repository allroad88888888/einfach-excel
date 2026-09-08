import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  setSelectionAtom,
  startCellEditingFromProjectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { MergeTools } from '../../../src/workbook/chrome/ribbon/MergeTools'

type Input = RustWorkbookCommands['range.merge']['payload']
const range = { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }
const project = (request: VisibleProjectionRequest) => ({
  ...request,
  cells: [],
  mergedRanges: [],
  revision: 0,
})
const result = (input: Input) => ({
  changed: true,
  projection: {
    ...project(input.projection),
    mergedRanges: input.action === 'unmerge' ? [] : [range],
    revision: 1,
  },
})
async function setup() {
  const change = vi.fn(async (input: Input) => result(input))
  const request = (async (command: string, payload: unknown) =>
    command === 'range.merge'
      ? change(payload as Input)
      : project(
          (payload as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(setSelectionAtom, {
    kind: 'range',
    sheetId: 's',
    anchor: { row: 1, col: 1 },
    focus: { row: 2, col: 2 },
  })
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <MergeTools />
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
const menu = () => screen.getByRole('combobox', { name: 'Merge cells' })
async function choose(action: string) {
  await act(async () => {
    fireEvent.change(menu(), { target: { value: action } })
  })
}

test.each(['merge', 'center', 'unmerge'])(
  '%s sends one command for the selected rectangle and resets the menu',
  async (action) => {
    const { change } = await setup()
    await choose(action)
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0]![0]).toMatchObject({ action, range, discard: false })
    expect(menu()).toHaveValue('')
    expect(menu()).toBeEnabled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  },
)

test.each(['confirm', 'cancel', 'escape'])(
  'content-loss confirmation handles %s without silently discarding values',
  async (action) => {
    const { change } = await setup()
    change.mockRejectedValueOnce(new Error('MERGE_CONTENT_CONFIRMATION_REQUIRED'))
    await choose('center')
    const dialog = screen.getByRole('alertdialog', { name: 'Merge these cells?' })
    expect(dialog).toHaveTextContent('Only the upper-left')
    expect(menu()).toBeDisabled()
    await act(async () => {
      if (action === 'escape') fireEvent(dialog, new Event('cancel', { cancelable: true }))
      else
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: action === 'confirm' ? 'Merge cells' : 'Cancel',
          }),
        )
    })
    expect(change).toHaveBeenCalledTimes(action === 'confirm' ? 2 : 1)
    if (action === 'confirm')
      expect(change.mock.calls[1]![0]).toMatchObject({ action: 'center', discard: true, range })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(menu()).toBeEnabled()
  },
)

test('pending Worker response disables merging; rejection is visible and retryable', async () => {
  const { change } = await setup()
  let reject!: (reason: Error) => void
  change.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  await choose('merge')
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Merging cells')
  await act(async () => {
    reject(new Error('Array formulas cannot be merged.'))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Array formulas')
  expect(menu()).toBeEnabled()
  await choose('merge')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an active editor disables merge commands', async () => {
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
