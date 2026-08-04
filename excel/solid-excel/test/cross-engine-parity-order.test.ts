/**
 * ALWAYS-ON 跨引擎烟测 —— **区域物化的遍历顺序**。
 *
 * 单开一份规格而不是并进 `cross-engine-parity-smoke.test.ts`：那份已经贴着
 * 300 行上限，与 `cross-engine-parity-spill.test.ts` 同一个先例（同一批工作
 * 负载、不同的失败提问）。那边问「这个函数算出什么」，这边问「区域展开成的
 * **序列**对不对」—— 值全对而顺序全错正是这一类的形态。
 *
 * 夹具、逐条期望值与它们的依据在 `cross-engine-parity-spill-order.ts`。
 *
 * # 起点
 *
 * `CC1 = =SEQUENCE(3)` 之后，Rust 侧答 `MATCH(2,CC1:CC3,0) = 1`、
 * `CONCAT(CC1:CC3) = "231"`、`TEXTJOIN(",",1,CC1:CC3) = "2,3,1"`，TS 侧分别是
 * 2 / "123" / "1,2,3"（Excel 的答案）。根因在 Rust 的区域物化按**存储分桶**
 * 发射：字面量表一张、公式表一张，各自升序，拼起来不是行主序，公式格一律
 * 沉底。修在 `excel/rust/excel-core/src/sheet.rs` §
 * `FacadeCtx::range_member_addrs` / `Sheet::for_each_sparse_cell_with`
 * （两条升序序列按坐标归并），引擎侧契约测试在
 * `excel/rust/excel-core/tests/range_materialization_order.rs`。
 *
 * # 断言写闭式字面量，不写「两侧相等」
 *
 * 顺序无关的聚合（`SUM` / `COUNT` / `AVERAGE`）在错序下两侧照样相等 —— Rust
 * 的 golden 回放语料正好只有这几个函数，所以那批 fixture 在这次修复里一格
 * 没动。相等断言对这一类是瞎的：它既不会在「一侧沉底」时红（值集合相同的
 * 聚合），也不会在「两侧一起沉底」时红。所以每条钉死显示串。
 *
 * 这里失败就是一条**真的**跨引擎发现：报告分歧地址，不要放宽断言。
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import {
  displaysOf,
  flatten,
  loadWasmModule,
  makeEngine,
  type Engine,
} from './cross-engine-parity-engines'
import { WORKLOAD } from './cross-engine-parity-cases'
import {
  EXPECTED_SPILL_ORDER_DISPLAYS,
  SPILL_ORDER_ADDRS,
} from './cross-engine-parity-spill-order'

describe('cross-engine parity — range materialization order (TS runtime vs WASM engine)', () => {
  let ts: Engine
  let wasm: Engine

  beforeAll(async () => {
    await loadWasmModule()
    ts = makeEngine('ts')
    wasm = makeEngine('wasm')
    await ts.bulkImport(WORKLOAD)
    await wasm.bulkImport(WORKLOAD)
  }, 30_000)

  afterAll(() => {
    wasm?.dispose()
    ts?.dispose()
  })

  test('区域按行主序展开 —— 混了公式格的区域不把公式排到最后', async () => {
    const tsRead = await ts.read(SPILL_ORDER_ADDRS)
    const wasmRead = await wasm.read(SPILL_ORDER_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 真正的门是字面量：相等断言在「两侧一起沉底」时同样为真。表里三列铺的
    // 是同一份 1,2,3，只有公式格的位置不同（spill 锚点 / 首格 / 中间），
    // 任何「按存储分桶发射」的实现三列里至少两列会错，而 `=SUM` 与
    // `=INDEX(...,2,1)` 两条反向控制在错序下仍然是对的 —— 它们跟着红就说明
    // 坏的不是顺序。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, SPILL_ORDER_ADDRS)).toEqual(EXPECTED_SPILL_ORDER_DISPLAYS)
    }
  })
})
