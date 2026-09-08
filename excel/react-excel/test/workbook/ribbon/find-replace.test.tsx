import { createStore } from '@einfach/core'
import {
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  setSelectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FindReplaceTools } from '../../../src/workbook/chrome/ribbon/FindReplaceTools'

type Find = RustWorkbookCommands['workbook.find']['payload']
type Replace = RustWorkbookCommands['workbook.replace']['payload']
const project = (request: VisibleProjectionRequest) => ({ ...request, cells: [], revision: 0 })
async function setup() {
  const find = vi.fn(async (input: Find) => ({
    total: 2,
    revision: 0,
    matches: [{ sheetId: 's', row: 5 + input.offset, col: 1, start: 2, end: 5 }],
  }))
  const replace = vi.fn(async (input: Replace) => ({
    cells: 1,
    occurrences: 1,
    projection: { ...project(input.projection), revision: 1 },
    sizes: { rowHeights: [], colWidths: [] },
  }))
  const request = (async (command: string, payload: unknown) => {
    if (command === 'workbook.find') return find(payload as Find)
    if (command === 'workbook.replace') return replace(payload as Replace)
    return project((payload as { request: VisibleProjectionRequest }).request)
  }) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: 's',
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
  render(
    <WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
      <FindReplaceTools />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 },
      reason: 'test',
    })
  })
  await click('Find and replace')
  return { find, replace }
}
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}
async function fill(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
  })
}
async function replaceTab() {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Replace' }))
  })
}

test('opens on the query input and closes back to the trigger', async () => {
  await setup()
  expect(screen.getByRole('dialog', { name: 'Find and replace' })).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Find what' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()
  await click('Close')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Find and replace' })).toHaveFocus()
})

test('navigation displays the native index and worksheet address', async () => {
  const r = await setup()
  await fill('Find what', 'old')
  await click('Find next')
  expect(screen.getByText('1 of 2 · Sheet!B6')).toBeVisible()
  await click('Previous')
  expect(screen.getByText('2 of 2 · Sheet!B7')).toBeVisible()
  expect(r.find.mock.calls.map(([input]) => input.offset)).toEqual([0, 1])
})

test('replacement field does not invalidate the selected match; one native write updates feedback', async () => {
  const r = await setup()
  await fill('Find what', 'old')
  await click('Find next')
  await replaceTab()
  await fill('Replace with', 'new')
  await click('Replace current')
  expect(r.replace.mock.lastCall![0]).toMatchObject({
    replacement: 'new',
    current: { row: 5, col: 1, start: 2, end: 5 },
  })
  expect(screen.getByText(/Replaced 1 occurrence/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Replace current' })).toBeDisabled()
})

test('replace all can run without a capped search result list', async () => {
  const r = await setup()
  await replaceTab()
  await fill('Find what', 'old')
  await fill('Replace with', 'new')
  await click('Replace all')
  expect(r.find).not.toHaveBeenCalled()
  expect(r.replace).toHaveBeenCalledTimes(1)
  expect(r.replace.mock.lastCall![0]).not.toHaveProperty('current')
})

test('native errors are visible and the corrected query can be submitted again', async () => {
  const r = await setup()
  r.find.mockRejectedValueOnce(new Error('Connection lost'))
  await fill('Find what', 'old')
  await click('Find next')
  expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
  await fill('Find what', 'new')
  expect(screen.queryByRole('alert')).toBeNull()
  await click('Find next')
  expect(screen.getByText('1 of 2 · Sheet!B6')).toBeVisible()
})

test('options are sent through the command without a React controller object', async () => {
  const r = await setup()
  await fill('Find what', 'old')
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Match case' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Match entire cell' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Within' }), {
      target: { value: 'current-selection' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Look in' }), {
      target: { value: 'values' },
    })
  })
  await click('Find next')
  expect(r.find.mock.lastCall![0]).toMatchObject({
    query: { caseSensitive: true, wholeCell: true, lookIn: 'values' },
    targets: [{ sheetId: 's', range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } }],
  })
})

test('native replacement disables mutation controls and close until it finishes', async () => {
  const r = await setup()
  let finish!: (value: Awaited<ReturnType<typeof r.replace>>) => void
  r.replace.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  await replaceTab()
  await fill('Find what', 'old')
  await click('Replace all')
  expect(screen.getByText('Replacing…')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled()
  await act(async () => {
    finish({
      cells: 0,
      occurrences: 0,
      projection: project(r.replace.mock.calls[0][0].projection),
      sizes: { rowHeights: [], colWidths: [] },
    })
  })
  expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
})
