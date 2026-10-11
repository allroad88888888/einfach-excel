import {
  createSpreadsheetUi,
  beginProjectionAtom,
  initializeWorkbookDocumentAtom,
  resolveProjectionAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  setViewportMetricsAtom,
  setSheetProtectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { OutlineTools } from '../../../src/workbook/chrome/ribbon/OutlineTools'
import { OutlineGutters } from '../../../src/workbook/grid/viewport/OutlineGutters'

type Input = RustWorkbookCommands['outline.change']['payload']
const outline = {
  rows: [{ start: 1, end: 3, collapsed: false }],
  columns: [{ start: 1, end: 2, collapsed: false }],
}
async function setup() {
  const project = (p: VisibleProjectionRequest) => ({
    ...p,
    cells: [],
    revision: 1,
    visibility: { manualRows: [], manualColumns: [], filterRows: [], outline },
  })
  const change = vi.fn(async (p: Input) => ({ changed: true, projection: project(p.projection) }))
  const request = (async (command: string, input: unknown) =>
    command === 'outline.change'
      ? change(input as Input)
      : project(
          (input as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const connection = { request, dispose() {} }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  store.setter(setViewportMetricsAtom, {
    sheetId: 's',
    scrollTop: 0,
    scrollLeft: 0,
    viewportWidth: 600,
    viewportHeight: 400,
    rowCount: 100,
    colCount: 8,
    rowHeight: 28,
    colWidth: 120,
    overscanRows: 0,
    overscanCols: 0,
  })
  const focusGrid = vi.fn()
  render(
    <WorkbookStoreProvider store={store} connection={connection}>
      <OutlineTools />
      <OutlineGutters focusGrid={focusGrid} />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 's',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    })
  })
  return { store, change, focusGrid }
}
const menu = () => screen.getByRole('combobox', { name: 'Outline groups' })
async function choose(value: string) {
  await act(async () => {
    fireEvent.change(menu(), { target: { value } })
  })
}

test.each([
  ['group-rows', 'row', 'group'],
  ['group-columns', 'column', 'group'],
  ['ungroup-rows', 'row', 'ungroup'],
  ['ungroup-columns', 'column', 'ungroup'],
  ['collapse-rows', 'row', 'show-level'],
  ['expand-rows', 'row', 'show-level'],
  ['collapse-columns', 'column', 'show-level'],
  ['expand-columns', 'column', 'show-level'],
])('%s dispatches one command without local spreadsheet state', async (value, axis, kind) => {
  const { change } = await setup()
  await choose(value)
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0][0]).toMatchObject({ axis, action: { kind } })
  expect(menu()).toHaveValue('')
})

test('edge buttons expose expanded state and row/column level commands with grid focus', async () => {
  const { change, focusGrid } = await setup()
  const row = screen.getByRole('button', { name: 'Collapse rows 2–4, level 1' })
  expect(row).toHaveAttribute('aria-expanded', 'true')
  await act(async () => {
    fireEvent.click(row)
  })
  expect(change.mock.lastCall![0]).toMatchObject({
    axis: 'row',
    action: { kind: 'set-collapsed', index: 0, collapsed: true },
  })
  expect(focusGrid).toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show column outline level 2' }))
  })
  expect(change.mock.lastCall![0]).toMatchObject({
    axis: 'column',
    action: { kind: 'show-level', level: 2 },
  })
})

test('viewport reload disables the menu like the gutters until the returned projection is ready', async () => {
  const { store, change } = await setup()
  let pending!: ReturnType<typeof beginProjectionAtom.write>
  act(() => {
    pending = store.setter(beginProjectionAtom, {
      kind: 'visible-window', sheetId: 's', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 7 },
    })
  })
  // 新增大纲边缘会改变视口尺寸；保留旧格子不代表可以再次修改大纲。
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Collapse rows 2–4, level 1' })).toBeDisabled()
  expect(change).not.toHaveBeenCalled()
  if (pending.status !== 'started' || pending.request.kind !== 'visible-window')
    throw new Error('Expected a visible projection request')
  const request = pending.request
  act(() => {
    store.setter(resolveProjectionAtom, { request, result: {
      ...request, cells: [], revision: 2,
      visibility: { manualRows: [], manualColumns: [], filterRows: [], outline },
    } })
  })
  expect(menu()).toBeEnabled()
  await choose('collapse-rows')
  expect(change).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('alert')).toBeNull()
})

test('failure is visible, protected sheets do not mutate, pending work disables all outline controls', async () => {
  const { change, store } = await setup()
  change.mockRejectedValueOnce(new Error('Overlapping groups'))
  await choose('group-rows')
  expect(screen.getByRole('alert')).toHaveTextContent('Overlapping groups')
  act(() => {
    store.setter(setSheetProtectionAtom, {
      sheetId: 's',
      state: { mode: 'protected', unlockedRanges: [] },
    })
  })
  await choose('group-rows')
  expect(change).toHaveBeenCalledTimes(1)
  act(() => {
    store.setter(setSheetProtectionAtom, {
      sheetId: 's',
      state: { mode: 'open', unlockedRanges: [] },
    })
  })
  let finish!: (value: Awaited<ReturnType<typeof change>>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await choose('group-rows')
  expect(menu()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Collapse rows 2–4, level 1' })).toBeDisabled()
  await act(async () => {
    finish({
      changed: true,
      projection: {
        ...change.mock.lastCall![0].projection,
        cells: [],
        revision: 2,
        visibility: { manualRows: [], manualColumns: [], filterRows: [], outline },
      },
    })
  })
  expect(menu()).toBeEnabled()
})
