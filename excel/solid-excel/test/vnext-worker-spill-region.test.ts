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
 *
 * **一处刻意的跨引擎分歧**：碰撞态（`#SPILL!`）锚点的 `blockedBy`（要清哪一格）以及
 * 随它同行的 `blockedByArray`（那一格是不是一个数组）只有 WASM runtime 给得出。TS 参考引擎的碰撞态锚点连「它想要多大的矩形」都没存下来
 * （`validateSpillAnchorValue` 算完就丢），所以它答不出，于是诚实地什么都不带 ——
 * 而不是编一个地址。`ENGINES` 里的 `blocker` 标志就是这条分歧的显式登记：它是
 * 每个 runtime 的**契约**，不是"哪边先实现了"的现状快照。要抹平它得先让
 * `excel/excel-core-ts` 把碰撞事实留下来。
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

/** `blocker`：这个 runtime 说不说得出「碰撞态锚点被谁挡住」。见文件头。 */
const ENGINES: Array<{ name: string; blocker: boolean; open: () => WorkerWorkbookClient }> = [
  { name: 'wasm', blocker: true, open: () => makeWasmClient!() },
  { name: 'ts', blocker: false, open: () => makeTsClient!() },
]

async function freshClient(open: () => WorkerWorkbookClient): Promise<WorkerWorkbookClient> {
  const client = open()
  await client.initWorkbook(['Sheet1'])
  return client
}

describe.each(ENGINES)('spill region query — $name runtime', ({ open, blocker }) => {
  test('锚点与每一个投影格都报同一个区域，区外报 null', async () => {
    const client = await freshClient(open)
    // H1 上一个 `=SEQUENCE(3)` → 竖着占 H1:H3，锚点 (row 0, col 7)。
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    // `anchorFormula` 与 `rows`/`cols` 同行 —— 公式栏在投影格上显示的就是它。这一条
    // **两个 runtime 都答得出**（与 `blockedBy` 不同），所以不参数化，两边同一个断言。
    const expected = {
      sheet: 0,
      anchorRow: 0,
      anchorCol: 7,
      rows: 3,
      cols: 1,
      anchorFormula: '=SEQUENCE(3)',
    }

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
    const expected = {
      sheet: 0,
      anchorRow: 1,
      anchorCol: 1,
      rows: 2,
      cols: 3,
      anchorFormula: '=SEQUENCE(2, 3)',
    }

    for (const addr of ['B2', 'D2', 'B3', 'D3', 'C3']) {
      expect(await client.spillRegion(0, addr)).toEqual(expected)
    }
    // 只差一格的两个方向都必须落空 —— 形状写反了这里会抓到。
    expect(await client.spillRegion(0, 'E2')).toBeNull()
    expect(await client.spillRegion(0, 'B4')).toBeNull()
    client.dispose()
  })

  test('碰撞态 #SPILL! 锚点没有区域可画，但（WASM 侧）说得出被谁挡住', async () => {
    const client = await freshClient(open)
    expect(await client.setCell(0, 'H3', { type: 'text', value: 'blocker' })).toBe(true)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    const anchor = await client.readCells([{ sheet: 0, addr: 'H1' }])
    expect(anchor[0]?.display).toBe('#SPILL!')

    // 锚点：两个 runtime 都没有 `rows`/`cols`（它一个格子都没装上，Excel 也不给它
    // 画框）；WASM 额外带一条阻塞线索，TS 整个应答仍是 null。
    expect(await client.spillRegion(0, 'H1')).toEqual(
      blocker ? { sheet: 0, anchorRow: 0, anchorCol: 7, blockedBy: { row: 2, col: 7 } } : null,
    )
    // 锚点以外的格子两边一致：H2 是空格，H3 是那个阻塞物本身，都不是锚点。
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
      anchorFormula: '=SEQUENCE(3)',
    })
    client.dispose()
  })

  test('挡路的是另一个数组时，线索带上 `blockedByArray` —— 文案要换一句说', async () => {
    const client = await freshClient(open)
    // H3 上一个活着的数组挡住 H1 想要的 H1:H10。挡路的那一格**自己就是锚点**，所以
    // 引擎不用反查就指对了地方；这里钉的是随行的那个标志。
    expect(await client.setFormula(0, 'H3', '=SEQUENCE(3)')).toBe(true)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(10)')).toBe(true)

    expect(await client.spillRegion(0, 'H1')).toEqual(
      blocker
        ? {
            sheet: 0,
            anchorRow: 0,
            anchorCol: 7,
            blockedBy: { row: 2, col: 7 },
            blockedByArray: true,
          }
        : null,
    )
    client.dispose()
  })

  test('挡路的是用户自己打的值时，`blockedByArray` 必须缺席', async () => {
    const client = await freshClient(open)
    expect(await client.setCell(0, 'H3', { type: 'text', value: 'blocker' })).toBe(true)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(10)')).toBe(true)

    // 缺席而不是 `false`：这条只换措辞，「不是数组」与「答不出」在 UI 那边同一处理。
    // 标志错误地恒为真会把每一条提示都改口成「被那儿的数组挡住」，用户找不到那个数组。
    const wire = await client.spillRegion(0, 'H1')
    expect(wire?.blockedBy ?? null).toEqual(blocker ? { row: 2, col: 7 } : null)
    expect(wire?.blockedByArray).toBeUndefined()
    client.dispose()
  })

  test('把值写进溢出区 → 数组收回，区域随之消失（与 ADR 0006 的写入语义一致）', async () => {
    const client = await freshClient(open)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    expect(await client.spillRegion(0, 'H2')).not.toBeNull()

    expect(await client.setCell(0, 'H2', { type: 'text', value: 'blocker' })).toBe(true)
    // 塌缩后 H1 是碰撞态锚点，挡住它的正是用户刚打进去的 H2 —— 这条把「谁挡的」
    // 和「谁写的」钉成同一格，用户照着提示清掉它数组就该复活。
    expect(await client.spillRegion(0, 'H1')).toEqual(
      blocker ? { sheet: 0, anchorRow: 0, anchorCol: 7, blockedBy: { row: 1, col: 7 } } : null,
    )
    expect(await client.spillRegion(0, 'H2')).toBeNull()
    client.dispose()
  })

  test('每个投影格都报得出**锚点的公式**；碰撞态锚点不报', async () => {
    const client = await freshClient(open)
    expect(await client.setFormula(0, 'B2', '=SEQUENCE(3, 2)')).toBe(true)

    // 承重的一条：`C4` 这一格自己没有任何公式（它是投影出来的），但查询必须报出
    // 锚点 `B2` 的那条。公式栏正是靠这个字段才不用再发一次读单元格。
    for (const addr of ['B2', 'C2', 'B4', 'C4']) {
      const wire = await client.spillRegion(0, addr)
      expect(wire?.anchorFormula).toBe('=SEQUENCE(3, 2)')
      expect(wire?.anchorRow).toBe(1)
      expect(wire?.anchorCol).toBe(1)
    }
    // 区外一格都不报 —— 报了就会让公式栏在无关格子上显示一条别人的公式。
    expect(await client.spillRegion(0, 'D2')).toBeNull()

    // 碰撞态锚点：整块没有 `rows`/`cols`，`anchorFormula` 也不带。它自己的公式在
    // 它自己格子上，投影读得到，不需要绕这一圈。
    expect(await client.setCell(0, 'H3', { type: 'text', value: 'blocker' })).toBe(true)
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3)')).toBe(true)
    const collided = await client.spillRegion(0, 'H1')
    expect(collided?.anchorFormula).toBeUndefined()
    client.dispose()
  })
})
