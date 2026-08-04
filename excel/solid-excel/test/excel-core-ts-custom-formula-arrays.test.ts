/**
 * TS 参考引擎里「自定义公式**返回二维数组**」的形状契约。
 *
 * 与 `excel-core-ts-custom-formulas.test.ts` 分开：那份盯注册生命周期、
 * 标量回程与错误 token，这份只盯数组回程一件事 —— 形状规则、元素类型、
 * 尺寸闸门、碰撞、以及异步结算走的是不是同一条 marshaling。
 *
 * 每条断言都与 Rust/WASM 侧的孪生文件
 * `excel/rust/wasm/tests/custom_formula_array_web.rs` 一一对应，规格在
 * `excel/rust/excel-core/src/CUSTOM_FORMULAS.md` § "Array returns"。
 * **两侧的 case 表必须同步改** —— 这一类没有进
 * `cross-engine-parity-cases.ts` 那张网（驱动 `Engine` 接口没有注册自定义
 * 公式的口子，且 `wasm-pkg/` 是 lite 构建），所以「对称地各钉一份」就是
 * 目前唯一的 parity 保障。
 *
 * 走的是真实 RPC 路径（`runtime.handle(...)`），不直接调 `wrapCustomResult`。
 */

import { describe, expect, test } from '@jest/globals'

import { createWorkerRuntimeTs } from '../src-vnext/adapter/worker-runtime-ts'

type Runtime = ReturnType<typeof createWorkerRuntimeTs>
type Rpc = (req: Record<string, unknown>) => Promise<unknown>

function makeRpc(runtime: Runtime): Rpc {
  let nextId = 1
  return async (req) => {
    const resp = await runtime.handle({ id: nextId++, ...req } as never)
    if (!resp.ok) {
      throw new Error(`RPC ${String(req.cmd)} failed: ${resp.error.code} ${resp.error.message}`)
    }
    return resp.result
  }
}

async function initSheet(runtime: Runtime): Promise<Rpc> {
  const rpc = makeRpc(runtime)
  await rpc({ cmd: 'initWorkbook', sheets: ['Sheet1'] })
  return rpc
}

/** `addr=display` 一行一格 —— jest 的数组 diff 会直接点名是哪一格。 */
async function displays(rpc: Rpc, addrs: readonly string[]): Promise<string[]> {
  const cells = (await rpc({
    cmd: 'readCells',
    cells: addrs.map((addr) => ({ sheet: 0, addr })),
  })) as Array<{ addr: string; display: string }>
  return cells.map((cell) => `${cell.addr}=${cell.display}`)
}

/** 注册一个同步自定义公式并把它落在 `addr` 上。 */
async function place(rpc: Rpc, name: string, source: string, addr: string): Promise<void> {
  await rpc({ cmd: 'registerCustomFormula', name, source })
  await rpc({ cmd: 'setFormulaDetailed', sheet: 0, addr, formula: `=${name}()` })
}

describe('worker-runtime-ts 自定义公式 —— 二维数组回程', () => {
  test('返回 [[1,2],[3,4]] 溢出成 2×2，矩形之外不脏', async () => {
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYGRID', 'return [[1,2],[3,4]]', 'A1')

    expect(await displays(rpc, ['A1', 'B1', 'A2', 'B2', 'C1', 'A3'])).toEqual([
      'A1=1',
      'B1=2',
      'A2=3',
      'B2=4',
      'C1=',
      'A3=',
    ])
  })

  test('元素类型与标量回程同一套规则（数字/文本/布尔/null/错误 token/{error}）', async () => {
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(
      rpc,
      'MYMIX',
      'return [[1.5, "txt"], [true, null], ["#DIV/0!", { error: "#N/A" }]]',
      'A1',
    )

    expect(await displays(rpc, ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'])).toEqual([
      'A1=1.5',
      'B1=txt',
      'A2=TRUE',
      'B2=',
      'A3=#DIV/0!',
      'B3=#N/A',
    ])
  })

  test('1×1 是合法的最小数组，与 =SEQUENCE(1,1) 同形', async () => {
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYONE', 'return [[42]]', 'A1')

    expect(await displays(rpc, ['A1', 'B1', 'A2'])).toEqual(['A1=42', 'B1=', 'A2='])
  })

  test('一维数组不猜行还是列 —— 直接 #VALUE!，且一格都不写', async () => {
    // Rust 侧同判：`js_array_to_value` 见 outer[0] 不是数组就拒绝，warn 里
    // 直接给出 [[a,b,c]] / [[a],[b],[c]] 两种写法。TS 此前把它当 N×1 列铺开，
    // 也就是替宿主猜了一个方向 —— 猜错要到渲染时才看得见。
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYFLAT', 'return [1, 2, 3]', 'A1')

    expect(await displays(rpc, ['A1', 'A2', 'A3', 'B1'])).toEqual([
      'A1=#VALUE!',
      'A2=',
      'A3=',
      'B1=',
    ])
  })

  test('参差数组 #VALUE!，绝不静默补空', async () => {
    // 此前 TS 把缺的那格补成 blank，于是 [[1,2],[3]] 静静地变成 2×2。
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYRAGGED', 'return [[1, 2], [3]]', 'A1')

    expect(await displays(rpc, ['A1', 'B1', 'A2', 'B2'])).toEqual([
      'A1=#VALUE!',
      'B1=',
      'A2=',
      'B2=',
    ])
  })

  test('三维（元素本身又是数组）#VALUE!，单元格只能装标量', async () => {
    // 此前 TS 把内层数组原样塞进单元格，读取侧再塌成左上角标量 —— 结果是
    // [[[1]]] 显示成 1，一个「看起来对」的错。
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYNESTED', 'return [[[1]]]', 'A1')

    expect(await displays(rpc, ['A1', 'B1', 'A2'])).toEqual(['A1=#VALUE!', 'B1=', 'A2='])
  })

  test('空数组 [] 与 [[]] 都是 #CALC! —— 复用 FILTER 空结果的答案', async () => {
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYEMPTY', 'return []', 'A1')
    await place(rpc, 'MYEMPTYROW', 'return [[]]', 'C1')

    expect(await displays(rpc, ['A1', 'C1'])).toEqual(['A1=#CALC!', 'C1=#CALC!'])
  })
})

describe('worker-runtime-ts 自定义公式 —— 数组回程的尺寸闸门', () => {
  test('超过 1_048_576 格 → #VALUE!，且闸门只读 length、跑在遍历之前', async () => {
    // 稀疏数组：只有 index 0 真正存在，length 是 200 万。index 1 装了一个
    // 会记账的 getter —— 闸门若在遍历之后才判，这个计数就不是 0，同时还会
    // 白走两百万轮。Rust 侧的同一条用例靠「否则吃掉 GB 级内存」立论。
    const rpc = await initSheet(createWorkerRuntimeTs())
    const probe = globalThis as Record<string, unknown>
    probe.__tsHugeRowReads = 0
    try {
      await place(
        rpc,
        'MYHUGE',
        'const a = [[1]];' +
          'Object.defineProperty(a, 1, { get() { globalThis.__tsHugeRowReads += 1; return [2] } });' +
          'a.length = 2000000;' +
          'return a',
        'A1',
      )
      expect(await displays(rpc, ['A1', 'A2'])).toEqual(['A1=#VALUE!', 'A2='])
      expect(probe.__tsHugeRowReads).toBe(0)
    } finally {
      delete probe.__tsHugeRowReads
    }
  })

  test('超出上限一格就拒绝 —— 闸门是 > cap，不是 >= cap 的 off-by-one', async () => {
    const rpc = await initSheet(createWorkerRuntimeTs())
    await place(rpc, 'MYOVER', 'const a = [[1]]; a.length = 1048577; return a', 'A1')

    expect(await displays(rpc, ['A1'])).toEqual(['A1=#VALUE!'])
  })
})

describe('worker-runtime-ts 自定义公式 —— 数组回程与既有 spill 语义', () => {
  test('碰撞走既有 #SPILL!：障碍物清掉后数组自愈', async () => {
    const rpc = await initSheet(createWorkerRuntimeTs())
    await rpc({ cmd: 'registerCustomFormula', name: 'MYCOL', source: 'return [[1],[2],[3]]' })
    await rpc({ cmd: 'setCell', sheet: 0, addr: 'A2', value: { type: 'number', value: 99 } })
    await rpc({ cmd: 'setFormulaDetailed', sheet: 0, addr: 'A1', formula: '=MYCOL()' })

    expect(await displays(rpc, ['A1', 'A2', 'A3'])).toEqual(['A1=#SPILL!', 'A2=99', 'A3='])

    await rpc({ cmd: 'clearCell', sheet: 0, addr: 'A2' })
    expect(await displays(rpc, ['A1', 'A2', 'A3'])).toEqual(['A1=1', 'A2=2', 'A3=3'])
  })
})

describe('worker-runtime-ts 自定义公式 —— 异步结算的数组回程', () => {
  /** 注册一个异步自定义公式、落格、等泵抽干。 */
  async function settle(rpc: Rpc, runtime: Runtime, name: string, source: string, addr: string) {
    await rpc({ cmd: 'registerCustomFormula', name, source, isAsync: true })
    await rpc({ cmd: 'setFormulaDetailed', sheet: 0, addr, formula: `=${name}()` })
    await runtime.asyncPumpIdle()
  }

  test('异步结算一个 2×2 数组，溢出与同步完全一致', async () => {
    const runtime = createWorkerRuntimeTs()
    const rpc = await initSheet(runtime)
    await settle(rpc, runtime, 'AGRID', 'return [[10,20],[30,40]]', 'A1')

    expect(await displays(rpc, ['A1', 'B1', 'A2', 'B2'])).toEqual([
      'A1=10',
      'B1=20',
      'A2=30',
      'B2=40',
    ])
  })

  test('异步结算走同一条闸门：一维 / 参差 / 空数组的答案与同步逐条相同', async () => {
    // 泵（`async-custom-pump.ts`）把 resolve 交回 runtime，runtime 用的是
    // 同一个 `wrapCustomResult` —— 这条断言就是「只有一条 marshaling」的证据。
    // 一旦有人给异步开第二条路，这里会先于渲染层炸。
    const runtime = createWorkerRuntimeTs()
    const rpc = await initSheet(runtime)
    await settle(rpc, runtime, 'AFLAT', 'return [1,2,3]', 'A1')
    await settle(rpc, runtime, 'ARAGGED', 'return [[1,2],[3]]', 'C1')
    await settle(rpc, runtime, 'AEMPTY', 'return []', 'E1')
    await settle(rpc, runtime, 'ANESTED', 'return [[[1]]]', 'G1')

    expect(await displays(rpc, ['A1', 'A2', 'C1', 'D1', 'E1', 'G1'])).toEqual([
      'A1=#VALUE!',
      'A2=',
      'C1=#VALUE!',
      'D1=',
      'E1=#CALC!',
      'G1=#VALUE!',
    ])
  })
})
