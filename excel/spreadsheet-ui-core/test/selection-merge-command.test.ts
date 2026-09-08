import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectionAtom,
  selectCellAtom,
  runSelectionMergeAtom,
  selectionMergeFeedbackAtom,
  setSheetProtectionAtom,
  runSelectionStructureAtom,
  startCellEditingFromProjectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['range.merge']['payload']
const range = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }
const project = (p: VisibleProjectionRequest) => ({
  ...p,
  revision: 1,
  cells: [],
  mergedRanges: [],
  mergeAnchors: [],
})
const response = (input: Input) => ({
  changed: true,
  projection: {
    ...project(input.projection),
    mergedRanges: input.action === 'unmerge' ? [] : [range],
  },
})
async function setup() {
  const change = vi.fn(async (input: Input) => response(input))
  const request = vi.fn(async (command: string, payload: unknown) =>
    command === 'range.merge'
      ? change(payload as Input)
      : project((payload as { request: VisibleProjectionRequest }).request),
  )
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', key: '1', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId: 's',
    anchor: { row: 0, col: 0 },
    focus: { row: 1, col: 1 },
  })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', window: range, reason: 'test' })
  return { store, request, change }
}

test.each(['merge', 'center', 'unmerge'] as const)(
  '%s issues one command and publishes its projection',
  async (action) => {
    const r = await setup()
    expect(await r.store.setter(runSelectionMergeAtom, action)).toBe(true)
    expect(r.change).toHaveBeenCalledTimes(1)
    expect(r.change.mock.calls[0][0]).toMatchObject({ action, discard: false, range })
    expect(r.request).toHaveBeenCalledTimes(2)
    expect(r.store.getter(selectionMergeFeedbackAtom)).toEqual({
      busy: false,
      error: null,
      pending: null,
    })
  },
)

test('confirmation preserves its original range and cancel never sends a destructive request', async () => {
  const r = await setup()
  r.change.mockRejectedValueOnce(new Error('MERGE_CONTENT_CONFIRMATION_REQUIRED'))
  expect(await r.store.setter(runSelectionMergeAtom, 'center')).toBe(false)
  expect(r.store.getter(selectionMergeFeedbackAtom).pending).toMatchObject({
    range,
    action: 'center',
  })
  await r.store.setter(runSelectionMergeAtom, 'cancel')
  expect(r.change).toHaveBeenCalledTimes(1)
  expect(r.store.getter(selectionMergeFeedbackAtom).pending).toBeNull()
  r.change.mockRejectedValueOnce(new Error('MERGE_CONTENT_CONFIRMATION_REQUIRED'))
  await r.store.setter(runSelectionMergeAtom, 'center')
  expect(await r.store.setter(runSelectionMergeAtom, 'confirm')).toBe(true)
  expect(r.change.mock.lastCall![0]).toMatchObject({ action: 'center', discard: true, range })
})

test('changed selection or protected sheet refuses the pending destructive merge', async () => {
  const r = await setup()
  r.change.mockRejectedValueOnce(new Error('MERGE_CONTENT_CONFIRMATION_REQUIRED'))
  await r.store.setter(runSelectionMergeAtom, 'merge')
  r.store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 3 } })
  expect(await r.store.setter(runSelectionMergeAtom, 'confirm')).toBe(false)
  expect(r.change).toHaveBeenCalledTimes(1)
  r.store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await r.store.setter(runSelectionMergeAtom, 'merge')).toBe(false)
  expect(r.change).toHaveBeenCalledTimes(1)
})

test('busy merge blocks new edits and structural writes', async () => {
  const r = await setup()
  let finish!: (result: ReturnType<typeof response>) => void
  r.change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = r.store.setter(runSelectionMergeAtom, 'merge')
  await Promise.resolve()
  expect(r.store.getter(selectionMergeFeedbackAtom).busy).toBe(true)
  expect(
    r.store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } }),
  ).toBe(false)
  expect(await r.store.setter(runSelectionStructureAtom, 'insert-rows')).toBe(false)
  finish(response(r.change.mock.calls[0][0]))
  expect(await pending).toBe(true)
})
