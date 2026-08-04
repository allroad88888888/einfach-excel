/**
 * ALWAYS-ON 跨引擎烟测 —— 实参列表里的**空占位**（`=SUM(1,,2)` 里那个 `,,`）。
 *
 * 单开一份规格而不是并进 `cross-engine-parity-smoke.test.ts`：那份已经贴着
 * 300 行上限，与 `cross-engine-parity-order.test.ts` /
 * `cross-engine-parity-cross-sheet.test.ts` 同一个先例。工作负载也自带一份而
 * 不是并进 `cross-engine-parity-cases.ts` 的 `WORKLOAD` —— 那份正被并发改动，
 * 而这一类需要一整片干净的溢出空间。
 *
 * # 起点
 *
 * 故障面**不在某几个函数上，而在解析层**：Rust 侧
 * `formula/operators.rs::parse_func_arg` 无条件下探 `parse_expr()`，空槽位在
 * 源码里没有任何 token，`primary` 返回 `None`，`parse_func_args` 的 `?` 把整条
 * 公式拽失败 —— 显示成 `#VALUE!`（「没解析成」的通用码）。所以中枪的是**任何**
 * 写了空占位的公式：`=SUM(1,,2)` / `=SORT(F1:F5,,-1)` / `=XLOOKUP(a,b,c,,0)` /
 * `=ROUND(3.14,)` 一起全灭。TS 侧同一条结构性根因，已在 commit da709fd 修掉
 * （`parser/parser.ts` 的 `parseArgOrOmitted` + `OmittedExpr`），Rust 侧因此
 * 落后成大面积分歧。
 *
 * 两侧的语义必须是同一条：空槽位是「传了个**空值**进去」，不是「这个参数不
 * 存在」。`args.length` 照常把空槽算进去，各函数对空值的既有处理照旧生效。
 *
 * # 断言写闭式字面量，不写「两侧相等」
 *
 * 修好之后相等断言会永远为真，证不了两个引擎没有一起退回去 —— 而这一类恰恰
 * 最容易一起退：两侧的修法都是「空 ⇒ 取默认值」，任何一侧把它改回「强转 0」，
 * `SORT` 那几行会变成 `#VALUE!` 而**两侧仍然相等**。所以每条钉死显示串。
 *
 * # 已知分歧单列一组
 *
 * 最后一组钉的是**两个引擎目前答得不一样**的格子。空格引用的差异不由空占位
 * 引起；`SORTBY` 则是 TS 函数分派层丢失尾随空槽语法。每条均说明根因；这一组
 * 红了不一定是坏消息 —— 可能是某一侧修好了，那时把它挪进上面的组里。
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import { displaysOf, loadWasmModule, makeEngine, type Engine } from './cross-engine-parity-engines'
import { a1 } from './parity-seed'
import {
  DIVERGENT_ADDRS,
  DIVERGENT_CASES,
  EXPECTED_SCALAR_DISPLAYS,
  EXPECTED_SPILL_DISPLAYS,
  FIXTURE,
  SCALAR_ADDRS,
  SCALAR_CASES,
  SPILL_ADDRS,
  SPILL_CASES,
} from './cross-engine-parity-omitted-args'

describe('cross-engine parity — omitted arguments (TS runtime vs WASM engine)', () => {
  let ts: Engine
  let wasm: Engine

  beforeAll(async () => {
    await loadWasmModule()
    ts = makeEngine('ts')
    wasm = makeEngine('wasm')
    for (const engine of [ts, wasm]) {
      await engine.bulkImport(FIXTURE)
      for (const [i, [formula]] of SCALAR_CASES.entries()) {
        await engine.setFormula(a1(i, 9), formula)
      }
      for (const c of SPILL_CASES) {
        await engine.setFormula(a1(0, c.col), c.formula)
      }
      // 装公式的地址必须与 `DIVERGENT_ADDRS` 同一套算法（含那里的行距）。
      for (const [i, c] of DIVERGENT_CASES.entries()) {
        await engine.setFormula(DIVERGENT_ADDRS[i], c.formula)
      }
    }
  }, 30_000)

  afterAll(() => {
    wasm?.dispose()
    ts?.dispose()
  })

  test('标量：空占位在两个引擎上都算得出来，且取到的是默认值 / 空值', async () => {
    const tsRead = await ts.read(SCALAR_ADDRS)
    const wasmRead = await wasm.read(SCALAR_ADDRS)
    // 闭式字面量，两侧各判一次 —— 「两侧相等」拦不住一起退回 `#VALUE!`。
    expect(displaysOf(tsRead, SCALAR_ADDRS)).toEqual(EXPECTED_SCALAR_DISPLAYS)
    expect(displaysOf(wasmRead, SCALAR_ADDRS)).toEqual(EXPECTED_SCALAR_DISPLAYS)
  })

  test('溢出：可选参数「空 ⇒ 取默认值」而不是「强转 0」', async () => {
    const tsRead = await ts.read(SPILL_ADDRS)
    const wasmRead = await wasm.read(SPILL_ADDRS)
    expect(displaysOf(tsRead, SPILL_ADDRS)).toEqual(EXPECTED_SPILL_DISPLAYS)
    expect(displaysOf(wasmRead, SPILL_ADDRS)).toEqual(EXPECTED_SPILL_DISPLAYS)
  })

  /**
   * 已知分歧的现状钉。这一组**红了先去看是不是有人修好了某一侧** —— 是的话
   * 把那条挪进上面两组，不要放宽断言。
   */
  test('已知分歧：逐条钉住现状', async () => {
    const tsRead = await ts.read(DIVERGENT_ADDRS)
    const wasmRead = await wasm.read(DIVERGENT_ADDRS)
    expect(displaysOf(tsRead, DIVERGENT_ADDRS)).toEqual(DIVERGENT_CASES.map((c) => c.ts))
    expect(displaysOf(wasmRead, DIVERGENT_ADDRS)).toEqual(DIVERGENT_CASES.map((c) => c.wasm))
  })
})
