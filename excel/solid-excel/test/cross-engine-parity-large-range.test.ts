/**
 * ALWAYS-ON 跨引擎烟测 —— **大区域实参**（>10 万格的整轴与有界矩形）。
 *
 * 单开一份而不是并进 `cross-engine-parity-smoke.test.ts`：那份问「这个函数
 * 算出什么」，这份问「**区域有多大**会改变答案」。同一批函数在小区域上两侧
 * 早就一致，分歧只在跨过某个格数之后才出现 —— 这是一整类，而且它的夹具
 * （一格甩到第 10 万行）会把烟测那份的所有场景一起拖慢。
 *
 * # 起点
 *
 * TS 侧的三条物化口有一道 10 万格闸门（`excel/excel-core-ts/src/eval/
 * range-gate.ts` 前身），越界一律吐 `[[#NUM!]]`；**Rust 侧没有这道闸门**。
 * 于是同一条 `=MATCH(3,F1:F100001,0)`，Rust 答 3（Excel 也是 3），TS 答
 * `#N/A` —— 而且是 `#N/A` 不是 `#NUM!`，因为 `MATCH` 把那片 1×1 的错误当成
 * 「一格没命中」。用户看到的是「没找到」，真相是「区域太大，引擎放弃了」。
 *
 * 闸门抬到一整列（1,048,576 格）+ 拒绝改走外带标记之后，下面 19 条从
 * 「两侧不一致」变成「两侧一致且都等于 Excel」。
 *
 * # 断言写闭式字面量，不写「两侧相等」
 *
 * 这一类尤其不能只断言相等：闸门的老症状**恰好**是「一侧算得出、一侧
 * `#N/A`」，而修坏的方向是「两侧一起退回 `#N/A`」—— 相等断言对后者是瞎的。
 *
 * # 已知仍在分歧的 1 条
 *
 * 见 `DIVERGENT`。每条按**引擎**分别钉死当前答案，而不是从网里摘掉：摘掉
 * 会让「谁先修好」这件事没有触发器。它们红了不是回归，是有人动了那一侧 ——
 * 去核对 Excel 的答案再改期望值。
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import {
  displaysOf,
  flatten,
  loadWasmModule,
  makeEngine,
  type Engine,
  type WorkloadCell,
} from './cross-engine-parity-engines'
import { a1 } from './parity-seed'

/**
 * F1:F5 = 1..5、G1:G5 = 10..50，外加 F100001 = 9 / G100001 = 90 把已用区域
 * 顶到 10 万行开外。只有 12 格 —— 大的是**矩形**，不是数据量，这正是闸门
 * 看错的东西。
 */
const FIXTURE: WorkloadCell[] = [
  ...[1, 2, 3, 4, 5].map((v, r): WorkloadCell => ({ kind: 'number', value: v, row: r, col: 5 })),
  ...[10, 20, 30, 40, 50].map(
    (v, r): WorkloadCell => ({ kind: 'number', value: v, row: r, col: 6 }),
  ),
  { kind: 'number', value: 9, row: 100_000, col: 5 },
  { kind: 'number', value: 90, row: 100_000, col: 6 },
]

// `A:XFD` includes every formula cell on Sheet1, including the formula that
// performs the check. Put just its numeric inputs on Sheet2 so the known #111
// divergence measures the materialization limit rather than a self-reference.
const WHOLE_GRID_FIXTURE: WorkloadCell[] = FIXTURE.map((cell) => ({ ...cell, sheet: 1 }))

/**
 * `[公式, 两侧共同的显示串]`。有界（`F1:F100001`）与整轴（`F:F`）成对写：
 * 修前有界那一半在 TS 上全军覆没，整轴那一半靠稀疏孪生活着 —— 两种形态
 * 分开才看得见闸门与稀疏孪生各自负责的边界。
 */
const AGREED: ReadonlyArray<readonly [string, string]> = [
  // —— 定位：修前 TS 全是 #N/A（闸门的 #NUM! 被 MATCH 当成「没命中」）——
  ['=MATCH(3,F1:F100001,0)', '3'],
  ['=MATCH(9,F1:F100001,0)', '100001'],
  ['=MATCH(3,F:F,0)', '3'],
  // 二维区域按行主序数：F1,G1,F2,G2,F3 → 3 在第 5 个。
  ['=MATCH(3,F:G,0)', '5'],
  // —— 查找：修前 TS 是 #REF!（VLOOKUP 把 1×1 当成一列）——
  ['=VLOOKUP(3,F1:G100001,2,FALSE)', '30'],
  ['=VLOOKUP(3,F:G,2,FALSE)', '30'],
  ['=HLOOKUP(10,F:G,2,FALSE)', '20'],
  ['=XLOOKUP(3,F1:F100001,G1:G100001)', '30'],
  ['=XLOOKUP(3,F:F,G:G)', '30'],
  // —— 取值：修前 TS 把 #NUM! 直接冒上去 ——
  ['=LARGE(F1:F100001,1)', '9'],
  ['=LARGE(F:F,1)', '9'],
  ['=SMALL(F:F,1)', '1'],
  ['=MEDIAN(F:F)', '3.5'],
  ['=RANK(3,F:F)', '4'],
  ['=SUMPRODUCT(F1:F100001,G1:G100001)', '1360'],
  ['=SUMPRODUCT(F:F,G:G)', '1360'],
  ['=CORREL(F1:F100001,G1:G100001)', '1'],
  ['=INDEX(F:F,3)', '3'],
  ['=TEXTJOIN(",",TRUE,F1:F6)', '1,2,3,4,5'],
  // —— 反向控制：有稀疏孪生的那一族修前就是对的，跟着红说明坏的不是闸门 ——
  ['=SUM(F:F)', '24'],
  ['=COUNTA(F:F)', '6'],
  ['=COUNT(F1:F100001)', '6'],
  ['=SUMIF(F:F,">3",G:G)', '180'],
]

/**
 * 仍在分歧的 1 条：`[公式, TS 显示, WASM 显示, 谁等于 Excel]`。
 *
 * Rust 的 `SUMPRODUCT` 现已按稀疏绝对位置对齐整轴实参，故
 * `SUMPRODUCT(F:F,G:G)` 已移入 `AGREED`，与 Excel 同为 1360。
 *
 * 剩下的 #111 区域物化上限分歧：TS 按设计拒绝 `Sheet2!A:XFD`（`#NUM!`），Rust
 * 则以稀疏扫描答 264，与 Excel 一致。输入数值放在 Sheet2，避免 A:XFD 吃到
 * Sheet1 的公式单元而自引用；这是测试隔离，不是借这次 SUMPRODUCT 修复替 #111
 * 定策略。
 */
const DIVERGENT: ReadonlyArray<readonly [string, string, string, string]> = [
  ['=SUMPRODUCT(Sheet2!A:XFD)', '#NUM!', '264', 'wasm'],
]

/**
 * 公式全部落在 Z 列、夹具最后一格（F100001）**再往下 10 行**。
 *
 * 贴着放是有意的：TS 侧的整轴夹取取的是**整张表**的已用行上界，公式放得越远，
 * 每条 `F:F` 要物化的矩形就越大（放在第 20 万行时这份规格跑 20s，贴着放 6s）。
 * 断言一格没变 —— 夹取只砍尾巴，砍掉的全是空格。
 */
const FORMULA_ROW0 = 100_010
const AGREED_ADDRS = AGREED.map((_, i) => a1(FORMULA_ROW0 + i, 25))
const DIVERGENT_ADDRS = DIVERGENT.map((_, i) => a1(FORMULA_ROW0 + AGREED.length + i, 25))

const WORKLOAD: WorkloadCell[] = [
  ...FIXTURE,
  ...WHOLE_GRID_FIXTURE,
  ...AGREED.map(
    ([formula], i): WorkloadCell => ({
      kind: 'formula',
      value: formula,
      row: FORMULA_ROW0 + i,
      col: 25,
    }),
  ),
  ...DIVERGENT.map(
    ([formula], i): WorkloadCell => ({
      kind: 'formula',
      value: formula,
      row: FORMULA_ROW0 + AGREED.length + i,
      col: 25,
    }),
  ),
]

describe('cross-engine parity — 大区域实参 (TS runtime vs WASM engine)', () => {
  let ts: Engine
  let wasm: Engine

  beforeAll(async () => {
    await loadWasmModule()
    ts = makeEngine('ts')
    wasm = makeEngine('wasm')
    await ts.bulkImport(WORKLOAD)
    await wasm.bulkImport(WORKLOAD)
  }, 120_000)

  afterAll(() => {
    wasm?.dispose()
    ts?.dispose()
  })

  test('10 万格以上的区域实参：两侧一致，且都等于 Excel', async () => {
    const tsRead = await ts.read(AGREED_ADDRS)
    const wasmRead = await wasm.read(AGREED_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 闭式字面量才是真正的门：相等断言在「两侧一起退回 #N/A」时同样为真，
    // 而那正是这道闸门被装回去时的形态。
    const want = AGREED.map(([, display]) => display)
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, AGREED_ADDRS)).toEqual(want)
      for (const addr of AGREED_ADDRS) expect(read.get(addr)?.isError).toBe(false)
    }
  })

  test('闸门的拒绝不会再被读成「没找到」—— 大区域上没有一条答 #N/A', async () => {
    // 这条与上一条的区别是**失败提问**：上面问「值对不对」，这里问「错在
    // 哪一档」。老症状是 `#N/A`（MATCH 把闸门的 1×1 #NUM! 当成没命中），
    // 它和「真的没找到」长得一模一样 —— 值断言看不出区别，因为 3 确实在。
    // 所以单独钉一条：大区域上出现 `#N/A` 就是闸门又开始说谎了。
    const reads = [await ts.read(AGREED_ADDRS), await wasm.read(AGREED_ADDRS)]
    for (const read of reads) {
      expect(AGREED_ADDRS.filter((addr) => read.get(addr)?.display === '#N/A')).toEqual([])
    }
  })

  test('已知分歧的 1 条：按引擎各自钉死当前答案', async () => {
    const tsRead = await ts.read(DIVERGENT_ADDRS)
    const wasmRead = await wasm.read(DIVERGENT_ADDRS)
    // 摘掉断言等于放弃触发器；分引擎钉死既不长红，又在任何一侧被改动时立刻红。
    expect(displaysOf(tsRead, DIVERGENT_ADDRS)).toEqual(DIVERGENT.map(([, tsWant]) => tsWant))
    expect(displaysOf(wasmRead, DIVERGENT_ADDRS)).toEqual(
      DIVERGENT.map(([, , wasmWant]) => wasmWant),
    )
    // 分歧还在 —— 这一条红了是**好事**：说明有人修好了其中一条，去把它
    // 挪进 `AGREED`，别放宽这里。
    expect(DIVERGENT.filter(([, tsWant, wasmWant]) => tsWant === wasmWant)).toEqual([])
  })
})
