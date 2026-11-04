import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  customFormulaPanelAtom,
  initializeWorkbookDocumentAtom,
  projectionCommandReadyAtom,
  projectionSnapshotAtom,
  recalculateAtom,
  runVisibleProjectionAtom,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

const viewport = { height: 600, width: 960, rowHeight: 28, colWidth: 120 }
const first = { rowStart: 0, rowEnd: 60, colStart: 0, colEnd: 20 }
const next = { rowStart: 30, rowEnd: 90, colStart: 0, colEnd: 20 }

function setup() {
  // 首次读取立即返回；之后每个请求都等对应的闸门放行，传入错误则以失败应答。
  const gates: ((error?: Error) => void)[] = []
  const read = vi.fn(async (command: string, input: unknown) => {
    const { request, projection } = input as {
      request: VisibleProjectionRequest; projection: VisibleProjectionRequest
    }
    if (read.mock.calls.length > 1) {
      await new Promise<void>((resolve, reject) =>
        gates.push((error) => (error ? reject(error) : resolve())))
    }
    if (command === 'formula.recalculate')
      return { formulaCount: 1, projection: { ...projection, cells: [], revision: 2 } }
    return { ...request, cells: [], revision: 1 }
  })
  const { store } = createSpreadsheetUi({
    connection: { request: read as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [
      { id: 's', index: 0, name: 'Test', rowCount: 1000, colCount: 60 },
      { id: 't', index: 1, name: 'Other', rowCount: 1000, colCount: 60 },
    ],
  })
  const run = (window: typeof first, extra: Record<string, unknown> = {}) =>
    store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', retainResult: true, window, viewport, ...extra,
    })
  const ready = () => store.getter(projectionCommandReadyAtom)
  const open = async (error?: Error) => {
    gates.shift()!(error)
    await new Promise((resolve) => setTimeout(resolve))
  }
  return { store, read, run, ready, gates, open }
}

async function primed() {
  const r = setup()
  await r.run(first)
  // 订阅并读热缓存：einfach 只做浅新鲜检查，闸门和面板都必须在异步写入冲刷前读到新状态。
  r.store.sub(projectionCommandReadyAtom, () => {})
  r.store.sub(customFormulaPanelAtom, () => {})
  expect(r.store.getter(customFormulaPanelAtom).available).toBe(true)
  expect(r.ready()).toBe(true)
  return r
}

test('a browsing read in flight keeps commands available against the published result', async () => {
  // 回归：每次换缓冲桶的读取都让工具栏、填充柄等命令禁用一瞬，滚动时整片控件闪烁。
  const r = await primed()
  const pending = r.run(next, { browsing: true })
  await vi.waitFor(() => expect(r.gates).toHaveLength(1))
  expect(r.ready()).toBe(true)
  expect(r.store.getter(customFormulaPanelAtom).available).toBe(true)
  expect(r.store.getter(projectionSnapshotAtom).status).toBe('loading')
  await r.open()
  await pending
  expect(r.ready()).toBe(true)
})

test.each([
  ['a refresh, host write or outcome check read', (r: ReturnType<typeof setup>) => r.run(next)],
  ['a non-browsing read queued behind a browsing one', (r: ReturnType<typeof setup>) => {
    void r.run(next, { browsing: true })
    return r.run({ ...next, rowEnd: 95 })
  }],
  ['a browsing read that replaced a queued refresh', (r: ReturnType<typeof setup>) => {
    // 回归：排队的宿主写后刷新被滚动读取顶替，刷新义务随之消失，命令对着写入前的内容开放。
    void r.run(next, { browsing: true })
    void r.run({ ...next, rowEnd: 95 })
    return r.run({ ...next, rowEnd: 99 }, { browsing: true })
  }],
  ['a browsing read of another sheet', (r: ReturnType<typeof setup>) =>
    r.store.setter(runVisibleProjectionAtom, {
      sheetId: 't', reason: 'viewport', retainResult: true, window: first, viewport, browsing: true,
    })],
])('commands wait for %s', async (_case, start) => {
  const r = await primed()
  const pending = start(r)
  // 不先读快照或闸门：面板自己就要看到在途读取（einfach 浅缓存，见 primed）。
  expect(r.store.getter(customFormulaPanelAtom).available).toBe(false)
  expect(r.ready()).toBe(false)
  await vi.waitFor(() => expect(r.gates.length).toBeGreaterThan(0))
  expect(r.store.getter(projectionSnapshotAtom).status).toBe('loading')
  while (r.gates.length) await r.open()
  await pending
  expect(r.ready()).toBe(true)
})

test('a failed refresh hands its refresh to the browsing read behind it', async () => {
  const r = await primed()
  const refresh = r.run(next)
  const browsing = r.run({ ...next, rowEnd: 95 }, { browsing: true })
  await vi.waitFor(() => expect(r.gates).toHaveLength(1))
  await r.open(new Error('refresh failed'))
  await vi.waitFor(() => expect(r.gates).toHaveLength(1))
  expect(r.ready()).toBe(false)
  await r.open()
  await Promise.all([refresh, browsing])
  expect(r.ready()).toBe(true)
})

test('a failed refresh with nothing queued leaves the next browsing read waiting', async () => {
  // 回归：宿主写后刷新失败、队列已空，随后的滚动读取把写入前的保留结果重新当作最新。
  const r = await primed()
  const refresh = r.run(next)
  await vi.waitFor(() => expect(r.gates).toHaveLength(1))
  await r.open(new Error('refresh failed'))
  expect((await refresh).status).toBe('failed')
  const browsing = r.run({ ...next, rowEnd: 95 }, { browsing: true })
  expect(r.store.getter(customFormulaPanelAtom).available).toBe(false)
  expect(r.ready()).toBe(false)
  await r.open()
  await browsing
  expect(r.ready()).toBe(true)
})

test('a mutation result overtaken by a later browsing read keeps commands waiting for it', async () => {
  // 回归：修改投影被之后的滚动读取顶掉，读取在途期间已发布的仍是修改前的内容。
  const r = await primed()
  const recalculated = r.store.setter(recalculateAtom, 'sheet')
  const browsing = r.run(next, { browsing: true })
  await vi.waitFor(() => expect(r.gates).toHaveLength(2))
  await r.open()
  expect(r.store.getter(projectionSnapshotAtom).result).toMatchObject({ revision: 1 })
  expect(r.ready()).toBe(false)
  await r.open()
  await Promise.all([recalculated, browsing])
  expect(r.ready()).toBe(true)
})
