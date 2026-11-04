import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  projectionSnapshotAtom,
  publishedGeometryCurrentAtom,
  runVisibleProjectionAtom,
  viewportSizeOverridesAtom,
  viewVisibleProjection,
  type ProjectionSnapshot,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

const viewport = { height: 600, width: 960, rowHeight: 28, colWidth: 120 }
const window = { rowStart: 22, rowEnd: 110, colStart: 0, colEnd: 40 }
const shrunk = { rowStart: 22, rowEnd: 109, colStart: 0, colEnd: 40 }

function setup() {
  const read = vi.fn(async (_command: string, input: unknown) => {
    const { request } = input as { request: VisibleProjectionRequest }
    return { ...request, cells: [], revision: 1 }
  })
  const { store } = createSpreadsheetUi({
    connection: { request: read as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 1000, colCount: 60 }],
  })
  const run = (next = window, extra: Record<string, unknown> = {}) =>
    store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', retainResult: true, window: next, viewport,
      browsing: true, ...extra,
    })
  return { store, read, run }
}

test('a size-backfill shrink inside the published window is not read again', async () => {
  // 回归：结果带回更高的行高让缓冲窗口少算一行，每个缓冲桶都多一次往返和整表渲染。
  const r = setup()
  expect(await r.run()).toEqual({ status: 'ready' })
  const published = r.store.getter(projectionSnapshotAtom)
  expect(await r.run(shrunk)).toEqual({ status: 'ready' })
  expect(r.read).toHaveBeenCalledTimes(1)
  expect(r.store.getter(projectionSnapshotAtom)).toBe(published)
})

test.each([
  ['a different pixel budget (frozen reads depend on it)', shrunk, { viewport: { ...viewport, height: 900 } }],
  ['an explicit revision', shrunk, { revision: 1 }],
  ['a plain read without reuse (refresh, host write, outcome check)', shrunk, { browsing: undefined }],
  ['a larger window', { ...window, rowEnd: 140 }, {}],
])('reuse never stands in for %s', async (_case, next, extra) => {
  const r = setup()
  await r.run()
  await r.run(next, extra)
  expect(r.read).toHaveBeenCalledTimes(2)
})

test.each([
  ['a cell cap the published window exceeds', shrunk, { maxCells: 100 }],
  ['a non-integer window', { ...shrunk, rowStart: 22.5 }, {}],
  ['an empty window', { ...shrunk, rowEnd: 21 }, {}],
])('an invalid request with %s fails validation instead of reusing', async (_case, next, extra) => {
  const r = setup()
  await r.run()
  expect(await r.run(next, extra)).toMatchObject({ status: 'failed' })
  expect(r.read).toHaveBeenCalledTimes(1)
})

test('geometry published apart from the result (e.g. a resize whose projection lost) forces a read', async () => {
  // 回归：尺寸命令先单独发布几何、其投影被另一修改顶掉时，窗口收缩是唯一的补读机会。
  const r = setup()
  await r.run()
  expect(r.store.getter(publishedGeometryCurrentAtom)).toBe(true)
  r.store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 0: 56 } }, colWidthsBySheet: {},
  })
  expect(r.store.getter(publishedGeometryCurrentAtom)).toBe(false)
  await r.run(shrunk)
  expect(r.read).toHaveBeenCalledTimes(2)
})

test('an in-flight read is never treated as covering, even inside the old result', async () => {
  const r = setup()
  await r.run()
  let release!: () => void
  r.read.mockImplementationOnce(async (_command, input) => {
    await new Promise<void>((resolve) => { release = resolve })
    const { request } = input as { request: VisibleProjectionRequest }
    return { ...request, cells: [], revision: 1 }
  })
  const pending = r.run({ ...window, rowStart: 44, rowEnd: 132 })
  // 落在旧结果 22–110 内部：只有在途保护能阻止复用。
  const inside = r.run({ ...window, rowStart: 30, rowEnd: 100 })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  release()
  await Promise.all([pending, inside])
  expect(r.read).toHaveBeenCalledTimes(3)
})

test('after reuse, a failed or pending read of the published window still belongs to the view', () => {
  const request = { kind: 'visible-window', sheetId: 's', requestId: 1, window, viewport } as const
  const result = { kind: 'visible-window', sheetId: 's', requestId: 1, window, cells: [] } as const
  const input = { sheetId: 's', window: shrunk, viewport, geometryCurrent: true }
  const view = (snapshot: ProjectionSnapshot) => viewVisibleProjection(snapshot, input)
  expect(view({ status: 'ready', request, result })).toMatchObject({ current: true, retained: false })
  // 宿主写后刷新沿已发布窗口读取失败：错误要报出来，交互要等待。
  const error = { code: 'RUST', message: 'refresh failed' }
  expect(view({ status: 'error', request, result, error } as ProjectionSnapshot))
    .toMatchObject({ current: true, retained: true })
  expect(view({ status: 'loading', request, result })).toMatchObject({ current: true, retained: true })
  // 几何已被单独改动时不复用：回到"窗口必须相等"。
  expect(viewVisibleProjection({ status: 'ready', request, result }, { ...input, geometryCurrent: false }))
    .toMatchObject({ current: false, retained: true })
})
