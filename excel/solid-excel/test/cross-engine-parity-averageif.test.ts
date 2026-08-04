/**
 * ALWAYS-ON 跨引擎烟测 —— **AVERAGEIF / AVERAGEIFS 的两条规则**：值区覆盖哪个
 * 矩形，以及那片格子里什么东西进分母。
 *
 * 单开一份规格而不是并进 `cross-engine-parity-smoke.test.ts`：那份贴着 300 行
 * 上限，先例是 `cross-engine-parity-cross-sheet.test.ts` /
 * `cross-engine-parity-order.test.ts`（同一套驱动、不同的失败提问）。工作负载
 * 也自带一份 —— 本类要的洞（空格）与既有语料的稠密夹具是冲突的。
 *
 * # 这一类此前为什么漏了（任务 #103）
 *
 * 三条分歧同时活着，而这张网全绿：
 *
 * 1. **值区形状**（`AVERAGEIF(A1:A4,">1",B1)`）—— Excel 只取值区左上角、行列数
 *    由条件区决定。TS 侧在 `da709fd` 修好，Rust 侧仍挂着一条「形状必须相同，
 *    否则 `#VALUE!`」的守卫。同一个文件里紧邻的 `fn_sumif` 一直是对的 ——
 *    只测 SUMIF 说明不了 AVERAGEIF。
 * 2. **分母口径** —— average_range 里的空格 / 布尔 / 文本都不进分母（Excel：
 *    "If a cell in average_range is an empty cell, AVERAGEIF ignores it"、
 *    "Cells in range that contain TRUE or FALSE are ignored"）。Rust 一直用
 *    `number_only` 是对的；TS 两条实现都用了 SUMIF 那档 `toNumber`，空格 → 0
 *    进分母。**只有一侧错**，所以「两侧相等」的断言在这一类上从来不响。
 * 3. **`AVERAGEIF(区域,"")`** —— 是第 2 条的极端症状而不是独立缺陷：唯一命中
 *    的位置在值区侧是空格，Excel 与 Rust 给 `#DIV/0!`，TS 给 `0`（命中一格、
 *    值 0）。更麻烦的是 TS **自己两条路就是岔的**：条件区几何决定走物化还是
 *    稀疏，`AVERAGEIF(A1:A4,"")` 走物化答 0、`AVERAGEIF(A:A,"")` 走稀疏答
 *    `#DIV/0!` —— 稀疏那条路压根不枚举空格才碰巧对。TS 侧的配对覆盖在
 *    `excel/excel-core-ts/test/criteria-value-range.test.ts`。
 *
 * # 断言写闭式字面量，不写「两侧相等」
 *
 * 修好之后相等断言会永远为真，证不了两个引擎没有一起退回去；而在修好之前它
 * 只会红在半路上，说明不了谁对。所以每一行都钉 Excel 的答案。
 *
 * 表里每条「忽略」都配了一条方向相反的「不忽略」：
 *  - `AVERAGEIF(E1:E3,"",F1:F3)=20` 挡住「空判据一律 `#DIV/0!`」的假修法；
 *  - `COUNTIF(A1:A4,"")=1` 挡住把分母口径外溢到计数档；
 *  - 每条 AVERAGEIF 旁边的 `SUMIF` 同址行挡住「顺手把 SUMIF 也改成只认数字」
 *    （求和把空格当 0 加是无害且正确的）。
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
  type WorkloadCell,
} from './cross-engine-parity-engines'

/** `A1=1 / A2 空 / A3=3 / A4=5`，值列 B 在同样的行上有同一个洞。 */
const NUMBERS: ReadonlyArray<readonly [number, number, number]> = [
  // [row, col, value] —— 缺席的 (row, col) 就是空格，这是本文件唯一的夹具语言。
  [0, 0, 1],
  [2, 0, 3],
  [3, 0, 5],
  [0, 1, 10],
  [2, 1, 30],
  [3, 1, 40],
  // C/D：条件区无洞、值区有洞 —— 与 A/B 那组是两条不同的规则（洞在哪一侧）。
  [0, 2, 1],
  [1, 2, 2],
  [2, 2, 3],
  [0, 3, 10],
  [2, 3, 30],
  // E/F：条件区有洞、值区那一格**有数** —— 「空判据一律 #DIV/0!」的反向围栏。
  [0, 4, 1],
  [2, 4, 3],
  [0, 5, 10],
  [1, 5, 20],
  [2, 5, 30],
  // G/H：值区那一格是**数字样文本**（H2 由 setText 写入）。
  [0, 6, 1],
  [1, 6, 2],
  [2, 6, 3],
  [0, 7, 10],
  [2, 7, 50],
  // I/J：值区那一格是**布尔**（J2 由公式 `=1=1` 产出）。
  [0, 8, 1],
  [1, 8, 2],
  [2, 8, 3],
  [0, 9, 10],
  [2, 9, 50],
]

/** 公式列（Z 列，col 25），下标即行号。 */
const FORMULAS: ReadonlyArray<readonly [string, string]> = [
  // ── (1) 值区形状：左上角 + 条件区形状，值区自己的行列数不参与 ──
  ['Z1', '=AVERAGEIF(A1:A4,">1",B1)'],
  ['Z2', '=AVERAGEIF(A1:A4,">1",B1:B2)'],
  ['Z3', '=AVERAGEIF(A1:A4,">1",B1:B10)'],
  ['Z4', '=AVERAGEIF(A1:A4,">1",B1:B4)'],
  ['Z5', '=SUMIF(A1:A4,">1",B1)'],
  // 锚点下移一行 ⇒ B2:B5，B5 在网格里但是空格 —— 形状与分母两条规则同一行验。
  ['Z6', '=AVERAGEIF(A1:A4,">1",B2)'],
  ['Z7', '=SUMIF(A1:A4,">1",B2)'],
  // 矩形越过网格下边界 ⇒ #REF!（B1048574 + 4 行要读到第 1048577 行）。
  ['Z8', '=AVERAGEIF(A1:A4,">1",B1048574)'],
  ['Z9', '=SUMIF(A1:A4,">1",B1048574)'],
  // ── (2) 分母口径：值区的空格不进分母 ──
  ['Z10', '=AVERAGEIF(C1:C3,">0",D1:D3)'],
  ['Z11', '=AVERAGEIFS(D1:D3,C1:C3,">0")'],
  ['Z12', '=SUMIF(C1:C3,">0",D1:D3)'],
  // ── (3) `AVERAGEIF(区域,"")`：唯一命中的位置值区是空 ⇒ 一个数都没有 ──
  ['Z13', '=AVERAGEIF(A1:A4,"")'],
  ['Z14', '=AVERAGEIF(A1:A4,"",B1:B4)'],
  ['Z15', '=AVERAGEIF(E1:E3,"",F1:F3)'],
  ['Z16', '=SUMIF(E1:E3,"",F1:F3)'],
  ['Z17', '=AVERAGEIF(E1:E3,"")'],
  ['Z18', '=COUNTIF(A1:A4,"")'],
  // ── 分母口径的另外两档：文本与布尔，与裸 AVERAGE 同一条规则 ──
  ['Z19', '=AVERAGEIF(G1:G3,">0",H1:H3)'],
  ['Z20', '=AVERAGE(H1:H3)'],
  ['Z21', '=AVERAGEIF(I1:I3,">0",J1:J3)'],
  ['Z22', '=AVERAGE(J1:J3)'],
]

const ADDRS = FORMULAS.map(([addr]) => addr)

/**
 * Excel 的答案，逐条闭式。
 *
 * A1:A4 = 1/空/3/5，B1:B4 = 10/空/30/40：`">1"` 命中 A3、A4 ⇒ (30+40)/2 = 35，
 * 求和 70。锚点写 B2 时矩形是 B2:B5，命中 B4=40 与 B5=空 ⇒ 平均 40（分母 1）、
 * 求和 40（空格加 0）—— 同一个矩形、两条不同的取值规则。
 */
const EXPECTED = [
  '35',
  '35',
  '35',
  '35',
  '70',
  '40',
  '40',
  '#REF!',
  '#REF!',
  // D1:D3 = 10/空/30 ⇒ 平均 20（分母 2，不是 3），求和 40。
  '20',
  '20',
  '40',
  // A2 / E2 是空格，判据 `""` 命中它；值区那一格也是空 ⇒ #DIV/0!。
  '#DIV/0!',
  '#DIV/0!',
  // 同一条判据，值区那一格是 F2=20 ⇒ 20。「空判据一律 #DIV/0!」在这里断。
  '20',
  '20',
  '#DIV/0!',
  // 计数那一档照旧把空格数进去 —— 分母口径不许外溢到 COUNTIF。
  '1',
  // H2 是文本 "60"、J2 是布尔 TRUE，都不进分子分母 ⇒ (10+50)/2 = 30。
  '30',
  '30',
  '30',
  '30',
]

const WORKLOAD: readonly WorkloadCell[] = [
  ...NUMBERS.map(([row, col, value]): WorkloadCell => ({ kind: 'number', value, row, col })),
  // J2 = TRUE。`=1=1` 而不是 `=TRUE` —— 后者在两个引擎里分别可能被当成定义名。
  { kind: 'formula', value: '=1=1', row: 1, col: 9 },
  ...FORMULAS.map(
    ([, formula], i): WorkloadCell => ({ kind: 'formula', value: formula, row: i, col: 25 }),
  ),
]

describe('cross-engine parity — AVERAGEIF 值区形状与分母口径 (TS runtime vs WASM engine)', () => {
  let ts: Engine
  let wasm: Engine

  beforeAll(async () => {
    await loadWasmModule()
    ts = makeEngine('ts')
    wasm = makeEngine('wasm')
    for (const engine of [ts, wasm]) {
      await engine.bulkImport(WORKLOAD)
      // 数字样文本只能走 setText —— bulk 导入的语汇里没有文本格，而「看着像数字
      // 的文本要被忽略」正是这一档要问的问题。
      await engine.setText('H2', '60')
    }
  }, 30_000)

  afterAll(() => {
    wasm?.dispose()
    ts?.dispose()
  })

  test('AVERAGEIF 的值区形状与分母口径在两个引擎上给同一个 Excel 答案', async () => {
    const tsRead = await ts.read(ADDRS)
    const wasmRead = await wasm.read(ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // 闭式断言跑在**两份**读数上：相等只证明两个引擎一致，证不了它们一起错，
    // 而「一起错」在这份文件的历史里出现过不止一次（见文件头）。
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, ADDRS)).toEqual(EXPECTED)
    }
  })
})
