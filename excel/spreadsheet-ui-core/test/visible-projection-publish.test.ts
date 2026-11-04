import { expect, test } from 'vitest'
import {
  applyVisibleProjectionAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  projectionSnapshotAtom,
  recalculateAtom,
  runFreezeAtom,
  runVisibleProjectionAtom,
  type RustWorkbookConnection,
} from '../src'

const viewport = { height: 600, width: 960, rowHeight: 28, colWidth: 120 }
const first = { rowStart: 0, rowEnd: 60, colStart: 0, colEnd: 20 }
const next = { rowStart: 30, rowEnd: 90, colStart: 0, colEnd: 20 }

interface Held {
  command: string
  input: Record<string, unknown> & { request?: object; projection?: object }
  resolve(value: unknown): void
  reject(error: Error): void
}

/** Worker 替身：应答按发送顺序逐个放行；每次修改让原生修订号加一。 */
function setup() {
  const held: Held[] = []
  let revision = 1
  const request = ((command: string, input: Held['input']) =>
    new Promise((resolve, reject) => held.push({ command, input, resolve, reject }))
  ) as unknown as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 1000, colCount: 60 }],
  })
  const answer = ({ command, input }: Held) => {
    if (command === 'formula.recalculate') {
      revision += 1
      return { formulaCount: 1, projection: { ...input.projection, cells: [], revision } }
    }
    if (command === 'sheet.freeze') {
      revision += 1
      const freeze = { rows: input.rows, cols: input.cols }
      return { projection: { ...input.projection, cells: [], revision, freeze } }
    }
    return { ...input.request, cells: [], revision }
  }
  const release = async (error?: Error) => {
    const item = held.shift()!
    if (error) item.reject(error)
    else item.resolve(answer(item))
    await new Promise((resolve) => setTimeout(resolve))
  }
  const run = (window: typeof first, extra: Record<string, unknown> = {}) =>
    store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', retainResult: true, window, viewport, ...extra,
    })
  const shown = () => store.getter(projectionSnapshotAtom)
  return { store, held, release, run, shown, native: () => revision }
}

async function ready(r: ReturnType<typeof setup>) {
  const pending = r.run(first)
  await r.release()
  await pending
}

test('two mutations started from the same view both reach the display', async () => {
  // 回归：先返回的修改换掉了快照，后返回的冻结投影被当成过时丢弃，界面一直停在冻结前。
  const r = setup()
  await ready(r)
  const recalculated = r.store.setter(recalculateAtom, 'sheet')
  const frozen = r.store.setter(runFreezeAtom, 'first-column')
  while (r.held.length) await r.release()
  expect([await recalculated, await frozen]).toEqual([true, true])
  expect(r.shown()).toMatchObject({ status: 'ready', result: { revision: 3, freeze: { cols: 1 } } })
})

test('a mutation started during a read is shown even when that read fails', async () => {
  // 回归：读取失败把快照置为 error，随后成功的重算投影因"前一读取未就绪"被丢弃。
  const r = setup()
  await ready(r)
  const browsing = r.run(next, { browsing: true })
  const recalculated = r.store.setter(recalculateAtom, 'sheet')
  await r.release(new Error('read failed'))
  await r.release()
  expect((await browsing).status).toBe('failed')
  expect(await recalculated).toBe(true)
  expect(r.shown()).toMatchObject({ status: 'ready', result: { revision: 2, window: next } })
})

test('a mutation overtaken by a later read of another view is carried by that read', async () => {
  const r = setup()
  await ready(r)
  const recalculated = r.store.setter(recalculateAtom, 'sheet')
  const browsing = r.run(next, { browsing: true })
  await r.release()
  expect(r.shown()).toMatchObject({ status: 'loading', result: { revision: 1, window: first } })
  await r.release()
  await Promise.all([recalculated, browsing])
  expect(r.held).toHaveLength(0)
  expect(r.shown()).toMatchObject({ status: 'ready', result: { revision: 2, window: next } })
})

test('a replayed mutation keeps its request id and still publishes against the snapshot it captured', async () => {
  // 回归：验证警告后点继续，原操作带着旧请求号重发；中间落定的同窗口读取不能让它被当成过时。
  const r = setup()
  await ready(r)
  const original = r.shown().request!
  const refresh = r.run(first)
  await r.release()
  await refresh
  const witness = r.shown()
  expect(witness.request!.requestId).not.toBe(original.requestId)
  const outcome = r.store.setter(applyVisibleProjectionAtom, {
    witness, request: original, result: { ...original, cells: [], revision: 2 },
  })
  expect(outcome.status).toBe('applied')
  expect(r.shown()).toMatchObject({ status: 'ready', result: { revision: 2 } })
})
