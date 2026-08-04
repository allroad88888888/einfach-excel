/**
 * ALWAYS-ON 跨引擎烟测 —— **Rust 解析器认不出的跨表引用形状**：整轴
 * （`Sheet2!A:A`、`Sheet2!1:3`）与带引号表名（`'My Sheet'!A1`）。
 *
 * 单开一份规格而不是并进 `cross-engine-parity-smoke.test.ts`：那份已经贴着
 * 300 行上限，与 `cross-engine-parity-order.test.ts` /
 * `cross-engine-parity-spill.test.ts` 同一个先例（同一批工作负载、不同的失败
 * 提问）。
 *
 * 夹具、逐条期望值与它们的依据在 `cross-engine-parity-cross-sheet.ts`。
 *
 * # 起点
 *
 * 故障面精确落在**两个特征的交点**上，两个单独特征各自都是好的：同表整轴
 * `=SUM(CH:CH)` 一直对、跨表有界 `=SUM(Sheet2!A1:A5)` 一直对，唯独两者相交
 * 的 `=SUM(Sheet2!A:A)` 在 Rust 引擎上是 `#VALUE!`，TS 给 `4`。整组同形：
 * `COUNT` / `COUNTA` / `COUNTBLANK` / `MAX` / 整行 `Sheet2!1:1` 全线 `#VALUE!`。
 *
 * 根因在 Rust 的**解析器**而不是求值器：`formula/identifier.rs` 的 `!` 分支
 * 只认 `[$]列[$]行` 这一种右尾，整轴那两种角（只有列字母 `A`、只有行数字
 * `1`）扫不出来就让整条公式解析失败 —— `#VALUE!` 是「没解析成」的通用码。
 * 同表路径能过，只因为它在 `scan_abs_cell_addr` 失败后还接着试了整列 / 整行
 * 两个扫描器，跨表分支两个都没接。修法是让跨表复用同表那三个扫描器
 * （`formula/refs.rs` 的 `finish_sheet_qualified_ref`），引擎侧契约测试在
 * `excel/rust/excel-core/tests/cross_sheet_whole_axis.rs`。
 *
 * # 这一类此前为什么漏了
 *
 * 不是断言不够狠，是**语料里没有跨表公式** —— 这张网的工作负载在此之前全是
 * 单表的。所以本类同时带来了驱动侧的第一个多表夹具（`WorkloadCell.sheet`）。
 * 严重度不低：`=SUM(Sheet2!A:A)` 是最常见的写法之一，而本仓两个后端可在运行
 * 期互换，同一份工作簿宿主选 TS 能算、选 WASM 就 `#VALUE!`。
 *
 * # 断言写闭式字面量，不写「两侧相等」
 *
 * 修好之后相等断言会永远为真，证不了两个引擎没有一起退回去。`COUNTBLANK`
 * 那两行尤其是字面量才拦得住：它们钉的不是「别报错」而是**矩形基数**
 * （1048576 − 2），一个只让公式不报错、却把基数算成遍历到的格子数的修法在
 * `SUM` 那几行上全绿、只会在这里断。
 *
 * # 第二组：带引号表名
 *
 * 同一条根因家族的另一半。`'My Sheet'!A1` 在 Rust 上**连有界形式都解析不
 * 出来** —— `formula/primary.rs` 的首字符分流里根本没有 `'` 这一支，TS 侧
 * （`parser/tokenizer.ts::readQuotedSheetName`）一直完整支持。严重度高于整轴
 * 那一组：表名带空格是 Excel **新建工作表的默认行为**（"Sheet 1"），用户改名
 * 成"销售 数据"之后任何引用都得加引号。
 *
 * 这一组同时钉住**渲染侧**的对称要求：结构性编辑会重渲染受影响的公式并写回
 * 源表，写回时表名必须重新加引号，否则一次插行就把用户的公式写坏。渲染侧的
 * 往返在 `excel/rust/excel-core/tests/quoted_sheet_name_render.rs`。
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
import { CROSS_SHEET_ADDRS, EXPECTED_CROSS_SHEET_DISPLAYS } from './cross-engine-parity-cross-sheet'

describe('cross-engine parity — cross-sheet whole-axis refs (TS runtime vs WASM engine)', () => {
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

  test("Sheet2!A:A / Sheet2!1:3 / 'My Sheet'!A1 —— 三种跨表写法两侧同值", async () => {
    const tsRead = await ts.read(CROSS_SHEET_ADDRS)
    const wasmRead = await wasm.read(CROSS_SHEET_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 真正的门是字面量。表里每条跨表整轴附近都配了一条同表整轴或跨表有界的
    // 对照（`=SUM(CH:CH)` / `=SUM(Sheet2!A1:A5)`），带引号那一组每一行也在整轴
    // 组里有同值的不带引号对照 —— 任何一侧单独漂移都会断；不存在的表名那几行
    // 钉的是**码的口径**：`#REF!`（表不存在）而不是 `#VALUE!`（公式没解析成），
    // 修复前整轴与带引号给的正是后者。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, CROSS_SHEET_ADDRS)).toEqual(EXPECTED_CROSS_SHEET_DISPLAYS)
    }
  })
})
