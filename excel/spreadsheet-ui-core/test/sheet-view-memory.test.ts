import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  clearWorkbookDocumentAtom, initializeWorkbookDocumentAtom, runWorkbookSheetCommandAtom,
  runVisibleProjectionAtom,
  cancelEditingAtom, commitCellEditingAtom, pickFormulaReferenceAtom,
  startEditingAtom, syncFormulaReferenceCaretAtom,
  initializeViewportMetricsAtom, visibleWindowAtom, setViewportSizeAtom,
  selectionSnapshotAtom, setMultiRegionSelectionAtom, setRustWorkbookConnectionAtom,
  setSelectionAtom, setViewportMetricsAtom, setViewportScrollAtom, viewportMetricsAtom,
  editingSessionAtom, type EditingCommitRequest, type SelectionState, type VisibleProjectionRequest,
} from '../src'
import { publishWorkbookSheetStructureAtom } from '../src/runtime/workbook-document'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

const sheets = [
  { id: 'orders', name: 'Orders', index: 0, rowCount: 1001, colCount: 16 },
  { id: 'summary', name: 'Summary', index: 1, rowCount: 100, colCount: 8 },
]
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets })
  const project = async (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    window: request.window, cells: [],
  })
  const write = vi.fn(async (input: EditingCommitRequest) => ({
    sheetId: input.sheetId, requestId: input.requestId, revision: 1,
  }))
  const request = vi.fn(createTestRustWorkbookConnection({
    readVisibleProjection: project, setCellProjection: project,
    setCellInput: write,
  }).request)
  store.setter(setRustWorkbookConnectionAtom, { request, dispose: vi.fn() })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), sheetId: 'orders',
    rowCount: 1001, colCount: 16, rowHeight: 24, colWidth: 96,
    viewportHeight: 480, viewportWidth: 480,
  })
  const switchTo = (sheetId: string) => store.setter(runWorkbookSheetCommandAtom, {
    operation: 'switch', sheetId,
  })
  return { store, request, write, switchTo }
}

const selections: SelectionState[] = [
  { kind: 'cell', sheetId: 'orders', anchor: { row: 800, col: 12 }, focus: { row: 800, col: 12 } },
  { kind: 'range', sheetId: 'orders', anchor: { row: 802, col: 12 }, focus: { row: 800, col: 10 } },
  { kind: 'row', sheetId: 'orders', rowAnchor: 20, rowFocus: 15 },
  { kind: 'column', sheetId: 'orders', colAnchor: 12, colFocus: 10 },
  { kind: 'all', sheetId: 'orders' },
]
test.each(selections)('restores $kind selection after visiting another sheet without a write', async (selection) => {
  const { store, request, switchTo } = setup()
  store.setter(setSelectionAtom, selection)
  await switchTo('summary')
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 'summary', row: 0, col: 0 })
  await switchTo('orders')
  expect(store.getter(selectionSnapshotAtom).selection).toEqual(selection)
  expect(request).not.toHaveBeenCalled()
})

test('keeps region order and the primary region through the existing selection command', async () => {
  const { store, switchTo } = setup()
  const selection = { regions: selections.slice(0, 2), primaryIndex: 1 }
  store.setter(setMultiRegionSelectionAtom, selection)
  await switchTo('summary')
  await switchTo('orders')
  expect(store.getter(setMultiRegionSelectionAtom)).toEqual(selection)
})

test('each sheet restores both scroll offsets but uses the current measured viewport', async () => {
  const { store, switchTo } = setup()
  store.setter(setSelectionAtom, selections[0]!)
  store.setter(setViewportScrollAtom, { scrollTop: 16000, scrollLeft: 500 })
  await switchTo('summary')
  store.setter(setViewportScrollAtom, { scrollTop: 1000, scrollLeft: 100 })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), viewportWidth: 400, viewportHeight: 300,
  })
  await switchTo('orders')
  expect(store.getter(viewportMetricsAtom)).toMatchObject({
    sheetId: 'orders', scrollTop: 16000, scrollLeft: 500, viewportWidth: 400, viewportHeight: 300,
  })
  await switchTo('summary')
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1000, scrollLeft: 100 })
})

test('renaming and reordering use stable IDs while changed canvas bounds clamp restored positions', async () => {
  const { store, switchTo } = setup()
  store.setter(setSelectionAtom, selections[0]!)
  store.setter(setViewportScrollAtom, { scrollTop: 16000, scrollLeft: 500 })
  await switchTo('summary')
  store.setter(publishWorkbookSheetStructureAtom, [
    { ...sheets[1]!, index: 0 }, { ...sheets[0]!, name: 'Renamed', index: 1, rowCount: 20, colCount: 5 },
  ])
  await switchTo('orders')
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 'orders', row: 19, col: 4 })
  // 恢复坐标须在宿主报告目标表的实际面积后裁剪，不能用来源表面积。
  store.setter(setViewportSizeAtom, {
    viewportHeight: 480, viewportWidth: 480, preserveEdges: false,
  })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 0, scrollLeft: 0 })
})

test('restoring a narrower outline viewport does not clamp against the previous sheet then pin to its end', async () => {
  const { store, switchTo } = setup()
  await switchTo('summary')
  store.setter(setViewportSizeAtom, {
    viewportHeight: 440, viewportWidth: 440, preserveEdges: false,
  })
  store.setter(setViewportScrollAtom, { scrollTop: 1940, scrollLeft: 308 })
  await switchTo('orders')
  store.setter(setViewportSizeAtom, {
    viewportHeight: 480, viewportWidth: 480, preserveEdges: false,
  })
  await switchTo('summary')
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1940, scrollLeft: 308 })
  store.setter(setViewportSizeAtom, {
    viewportHeight: 440, viewportWidth: 440, preserveEdges: false,
  })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1940, scrollLeft: 308 })
})

test('removed sheets and reinitialized workbooks cannot resurrect an old view', async () => {
  const { store, switchTo } = setup()
  store.setter(setSelectionAtom, selections[0]!)
  await switchTo('summary')
  store.setter(publishWorkbookSheetStructureAtom, [{ ...sheets[1]!, index: 0 }])
  store.setter(publishWorkbookSheetStructureAtom, sheets)
  await switchTo('orders')
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 'orders', row: 0, col: 0 })
  store.setter(setSelectionAtom, selections[0]!)
  await switchTo('summary')
  store.setter(clearWorkbookDocumentAtom)
  store.setter(initializeWorkbookDocumentAtom, { title: 'Another workbook', sheets })
  await switchTo('summary')
  await switchTo('orders')
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 'orders', row: 0, col: 0 })
})

test('independent workbook stores do not share remembered views', async () => {
  const first = setup()
  const second = setup()
  first.store.setter(setSelectionAtom, selections[0]!)
  await first.switchTo('summary')
  await second.switchTo('summary')
  await first.switchTo('orders')
  await second.switchTo('orders')
  expect(first.store.getter(selectionSnapshotAtom).activeCell.row).toBe(800)
  expect(second.store.getter(selectionSnapshotAtom).activeCell.row).toBe(0)
})

test('the first restored projection does not pull an offscreen selection back into view', async () => {
  const { store, switchTo } = setup()
  store.setter(setSelectionAtom, {
    kind: 'cell', sheetId: 'orders', anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 },
  })
  store.setter(setViewportScrollAtom, { scrollTop: 6000, scrollLeft: 500 })
  await switchTo('summary')
  await switchTo('orders')
  expect(await store.setter(runVisibleProjectionAtom, {
    sheetId: 'orders', window: { rowStart: 250, rowEnd: 270, colStart: 5, colEnd: 10 },
    reason: 'viewport',
  })).toEqual({ status: 'ready' })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 6000, scrollLeft: 500 })
})

test.each(['cancel', 'commit', 'cancel-on-source'])(
  'cross-sheet reference %s restores the source range and leaves the target ordinary view intact',
  async (action) => {
    const { store, switchTo } = setup()
    await switchTo('summary')
    const summary: SelectionState = {
      kind: 'cell', sheetId: 'summary', anchor: { row: 40, col: 3 }, focus: { row: 40, col: 3 },
    }
    store.setter(setSelectionAtom, summary)
    store.setter(setViewportScrollAtom, { scrollTop: 1000, scrollLeft: 100 })
    await switchTo('orders')
    store.setter(setSelectionAtom, selections[1]!)
    store.setter(setViewportScrollAtom, { scrollTop: 18000, scrollLeft: 500 })
    store.setter(startEditingAtom, {
      sheetId: 'orders', cell: { row: 800, col: 10 }, source: 'formula-bar', draft: '=',
    })
    store.setter(syncFormulaReferenceCaretAtom, 1)
    await switchTo('summary')
    store.setter(pickFormulaReferenceAtom, {
      sheetId: 'summary', pickAnchor: { row: 1, col: 1 }, pickFocus: { row: 1, col: 1 }, dragging: false,
    })
    store.setter(setViewportScrollAtom, { scrollTop: 300, scrollLeft: 200 })
    if (action === 'cancel-on-source') {
      await switchTo('orders')
      store.setter(setViewportScrollAtom, { scrollTop: 8000, scrollLeft: 200 })
    }
    if (action === 'commit') {
      await store.setter(runVisibleProjectionAtom, {
        sheetId: 'summary', window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport',
      })
      expect(await store.setter(commitCellEditingAtom)).toBe('completed')
    } else store.setter(cancelEditingAtom)
    expect(store.getter(selectionSnapshotAtom).selection).toEqual(selections[1])
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 18000, scrollLeft: 500 })
    await switchTo('summary')
    expect(store.getter(selectionSnapshotAtom).selection).toEqual(summary)
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1000, scrollLeft: 100 })
  },
)

test('initialization waits for the view geometry rather than issuing a tiny provisional window', () => {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets })
  expect(store.getter(visibleWindowAtom).rowEnd).toBe(-1)
  store.setter(initializeViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), sheetId: 'orders', rowCount: 1001, colCount: 16,
    rowHeight: 28, colWidth: 120, viewportHeight: 896, viewportWidth: 960,
    overscanRows: 0, overscanCols: 0,
  })
  expect(store.getter(visibleWindowAtom)).toEqual({
    rowStart: 0, rowEnd: 31, colStart: 0, colEnd: 7,
  })
})

test('clicking the active sheet keeps its live view instead of an old checkpoint', async () => {
  const { store, switchTo } = setup()
  store.setter(setSelectionAtom, selections[0]!)
  await switchTo('summary')
  await switchTo('orders')
  store.setter(setSelectionAtom, selections[2]!)
  store.setter(setViewportScrollAtom, { scrollTop: 5000, scrollLeft: 100 })
  await switchTo('orders')
  expect(store.getter(selectionSnapshotAtom).selection).toEqual(selections[2])
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 5000, scrollLeft: 100 })
})

test.each(['rejected', 'late-ack'])(
  'cross-sheet %s keeps the correct ordinary view after the edit settles',
  async (outcome) => {
    const { store, write, switchTo } = setup()
    await switchTo('summary')
    const ordinary: SelectionState = {
      kind: 'cell', sheetId: 'summary', anchor: { row: 40, col: 3 }, focus: { row: 40, col: 3 },
    }
    store.setter(setSelectionAtom, ordinary)
    store.setter(setViewportScrollAtom, { scrollTop: 800, scrollLeft: 100 })
    await switchTo('orders')
    store.setter(setSelectionAtom, selections[1]!)
    store.setter(setViewportScrollAtom, { scrollTop: 18000, scrollLeft: 500 })
    store.setter(startEditingAtom, {
      sheetId: 'orders', cell: { row: 800, col: 10 }, source: 'formula-bar', draft: '=',
    })
    store.setter(syncFormulaReferenceCaretAtom, 1)
    await switchTo('summary')
    store.setter(pickFormulaReferenceAtom, {
      sheetId: 'summary', pickAnchor: { row: 1, col: 1 }, pickFocus: { row: 1, col: 1 }, dragging: false,
    })
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'summary', window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport',
    })
    const chosen: SelectionState = {
      kind: 'cell', sheetId: 'summary', anchor: { row: 60, col: 4 }, focus: { row: 60, col: 4 },
    }
    if (outcome === 'rejected') {
      write.mockRejectedValueOnce(new Error('Rejected before mutation'))
      expect(await store.setter(commitCellEditingAtom)).toBe('rejected')
      expect(store.getter(editingSessionAtom).draft).toBe("='Summary'!B2")
      expect(store.getter(viewportMetricsAtom).sheetId).toBe('summary')
      store.setter(cancelEditingAtom)
    } else {
      let finish!: () => void
      write.mockImplementationOnce((input) => new Promise((resolve) => {
        finish = () => resolve({ sheetId: input.sheetId, requestId: input.requestId, revision: 1 })
      }))
      const pending = store.setter(commitCellEditingAtom)
      // 待提交期间的显式定位属于用户新意图，旧 ACK 不得覆盖它或丢掉其视图记忆。
      store.setter(setSelectionAtom, chosen)
      store.setter(setViewportScrollAtom, { scrollTop: 1200, scrollLeft: 200 })
      finish()
      expect(await pending).toBe('completed')
      expect(store.getter(selectionSnapshotAtom).selection).toEqual(chosen)
      await switchTo('orders')
    }
    expect(store.getter(selectionSnapshotAtom).selection).toEqual(selections[1])
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 18000, scrollLeft: 500 })
    await switchTo('summary')
    expect(store.getter(selectionSnapshotAtom).selection).toEqual(
      outcome === 'rejected' ? ordinary : chosen,
    )
    expect(store.getter(viewportMetricsAtom)).toMatchObject(outcome === 'rejected'
      ? { scrollTop: 800, scrollLeft: 100 } : { scrollTop: 1200, scrollLeft: 200 })
  },
)
