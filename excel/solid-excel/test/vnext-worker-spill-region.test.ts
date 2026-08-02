/**
 * @jest-environment node
 *
 * 溢出区查询（ADR 0006 阶段 3）的**跨引擎**契约。
 *
 * 这是 UI 能画出「这一片是一个动态数组」的唯一事实来源，两个 runtime 必须回同一个
 * 答案 —— 否则同一份工作簿在 WASM 后端上有蓝框、在 TS 参考后端上没有，就是又一条
 * 跨引擎分歧。所以整套断言参数化跑两遍：
 *
 *   - WASM runtime：走 wasm-pkg 已有的 `spillAnchor` / `spillInfo` 两个导出（一行
 *     Rust 都没改）。
 *   - TS runtime：没有溢出索引（溢出目标在表里根本没有条目），只能反着往左上扫，
 *     见 `worker-spill-region.ts`。
 *
 * 断言都是**闭式**的整块比较（锚点坐标 + 形状），不是"没抛就算过"：形状少一行、
 * 锚点差一格，diff 里直接看得见。
 */

import { beforeAll, describe, expect, jest, test } from '@jest/globals'

import type * as NodeFsModule from 'node:fs'
import type * as NodePathModule from 'node:path'
import type { WorkerLike, WorkerWorkbookClient } from '../src-vnext/adapter'
import { installWorkerRuntimeTs, type WorkerContext } from '../src-vnext/adapter/worker-runtime-ts'

jest.mock('../wasm-pkg/einfach_wasm.js', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { readFileSync } = require('node:fs') as typeof NodeFsModule
  const nodePath = require('node:path') as typeof NodePathModule
  const real = jest.requireActual('../wasm-pkg/einfach_wasm.js') as {
    initSync: (input: { module: ArrayBufferLike }) => unknown
    WasmWorkbook: unknown
  }
  const bytes = readFileSync(nodePath.join(__dirname, '..', 'wasm-pkg', 'einfach_wasm_bg.wasm'))
  real.initSync({
    module: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  return {
    __esModule: true,
    default: async () => undefined,
    WasmWorkbook: real.WasmWorkbook,
  }
})

type Listener = (e: MessageEvent) => void
const post = (listeners: Listener[], msg: unknown) => {
  for (const listener of [...listeners]) listener({ data: msg } as MessageEvent)
}

const toWasmWorker: Listener[] = []
const toWasmClient: Listener[] = []
const inProcessWasmWorker: WorkerLike = {
  postMessage: (msg) => post(toWasmWorker, msg),
  addEventListener: (_type: 'message', listener: Listener) => void toWasmClient.push(listener),
  removeEventListener(_type: 'message', listener: Listener) {
    const index = toWasmClient.indexOf(listener)
    if (index >= 0) toWasmClient.splice(index, 1)
  },
  terminate() {},
}

function createInProcessTsWorker(): WorkerLike {
  const toWorker: Listener[] = []
  const toClient: Listener[] = []
  const workerCtx: WorkerContext = {
    postMessage: (msg: unknown) => post(toClient, msg),
    addEventListener(_type, listener) {
      toWorker.push(listener)
    },
  }
  installWorkerRuntimeTs(workerCtx)
  return {
    postMessage: (msg: unknown) => post(toWorker, msg),
    addEventListener(_type: 'message', listener: Listener) {
      toClient.push(listener)
    },
    removeEventListener(_type: 'message', listener: Listener) {
      const index = toClient.indexOf(listener)
      if (index >= 0) toClient.splice(index, 1)
    },
    terminate() {},
  }
}

let makeWasmClient: (() => WorkerWorkbookClient) | undefined
let makeTsClient: (() => WorkerWorkbookClient) | undefined

beforeAll(async () => {
  (globalThis as Record<string, unknown>).self = {
    postMessage: (msg: unknown) => post(toWasmClient, msg),
    addEventListener: (_type: string, listener: Listener) => void toWasmWorker.push(listener),
  }
  await import('../src-vnext/adapter/worker-runtime')
  const adapter = await import('../src-vnext/adapter')
  makeWasmClient = () => adapter.createWorkerWorkbook({ workerFactory: () => inProcessWasmWorker })
  makeTsClient = () =>
    adapter.createWorkerWorkbook({ workerFactory: () => createInProcessTsWorker() })
})

const ENGINES: Array<{ name: string; open: () => WorkerWorkbookClient }> = [
  { name: 'wasm', open: () => makeWasmClient!() },
  { name: 'ts', open: () => makeTsClient!() },
]

async function freshClient(open: () => WorkerWorkbookClient): Promise<WorkerWorkbookClient> {
  const client = open()
  await client.initWorkbook(['Sheet1'])
  return client
}

describe.each(ENGINES)('spill region query — $name runtime', ({ open }) => {
  test('锚点与每一个投影格都报同一个区域，区外报 null', async () => {
    const client = await freshClient(open)
    // H1 上一个 `=SEQUENCE(3)` → 竖着占 H1:H3，锚点 (row 0, col 7)。
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    const expected = { sheet: 0, anchorRow: 0, anchorCol: 7, rows: 3, cols: 1 }

    expect(await client.spillRegion(0, 'H1')).toEqual(expected)
    expect(await client.spillRegion(0, 'H2')).toEqual(expected)
    expect(await client.spillRegion(0, 'H3')).toEqual(expected)
    // 紧挨着但在区外的三格：下一行、左一列、右一列。
    expect(await client.spillRegion(0, 'H4')).toBeNull()
    expect(await client.spillRegion(0, 'G1')).toBeNull()
    expect(await client.spillRegion(0, 'I1')).toBeNull()
    // 完全无关的空格与普通字面量格。
    expect(await client.spillRegion(0, 'A1')).toBeNull()
    expect(await client.setCell(0, 'A5', { type: 'number', value: 42 })).toBe(true)
    expect(await client.spillRegion(0, 'A5')).toBeNull()
    client.dispose()
  })

  test('二维数组报出行列两个维度，四角都落在区内', async () => {
    const client = await freshClient(open)
    // B2 上 `=SEQUENCE(2,3)` → B2:D3，锚点 (row 1, col 1)。
    expect(await client.setFormula(0, 'B2', '=SEQUENCE(2, 3)')).toBe(true)
    const expected = { sheet: 0, anchorRow: 1, anchorCol: 1, rows: 2, cols: 3 }

    for (const addr of ['B2', 'D2', 'B3', 'D3', 'C3']) {
      expect(await client.spillRegion(0, addr)).toEqual(expected)
    }
    // 只差一格的两个方向都必须落空 —— 形状写反了这里会抓到。
    expect(await client.spillRegion(0, 'E2')).toBeNull()
    expect(await client.spillRegion(0, 'B4')).toBeNull()
    client.dispose()
  })

  test('碰撞态 #SPILL! 锚点报 null：它一个格子都没装上，Excel 也不给它画框', async () => {
    const client = await freshClient(open)
    expect(await client.setCell(0, 'H3', { type: 'text', value: 'blocker' })).toBe(true)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    const anchor = await client.readCells([{ sheet: 0, addr: 'H1' }])
    expect(anchor[0]?.display).toBe('#SPILL!')

    expect(await client.spillRegion(0, 'H1')).toBeNull()
    expect(await client.spillRegion(0, 'H2')).toBeNull()
    expect(await client.spillRegion(0, 'H3')).toBeNull()

    // 清掉阻塞物 → 数组复活（ADR 0006 阶段 2），区域也跟着回来。
    expect(await client.clearCell(0, 'H3')).toBe(true)
    expect(await client.spillRegion(0, 'H2')).toEqual({
      sheet: 0,
      anchorRow: 0,
      anchorCol: 7,
      rows: 3,
      cols: 1,
    })
    client.dispose()
  })

  test('把值写进溢出区 → 数组收回，区域随之消失（与 ADR 0006 的写入语义一致）', async () => {
    const client = await freshClient(open)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    expect(await client.spillRegion(0, 'H2')).not.toBeNull()

    expect(await client.setCell(0, 'H2', { type: 'text', value: 'blocker' })).toBe(true)
    expect(await client.spillRegion(0, 'H1')).toBeNull()
    expect(await client.spillRegion(0, 'H2')).toBeNull()
    client.dispose()
  })
})
