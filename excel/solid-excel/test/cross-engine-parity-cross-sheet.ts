/**
 * 第十类分歧：**跨表 × 整轴引用**（`Sheet2!A:A`、`Sheet2!1:3`）。
 *
 * 单列一份文件而不是堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300 行
 * 上限。与 `-general-text.ts` / `-criteria-*.ts` / `-overflow.ts` /
 * `-scientific.ts` / `-dynamic-array.ts` / `-spill-order.ts` 同一个先例。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * 故障面精确落在**两个特征的交点**上，两个单独特征各自都是好的：
 *
 * - 同表整轴 `=SUM(C:C)` —— 一直对。
 * - 跨表有界 `=SUM(Sheet2!A1:A5)` —— 一直对。
 * - 两者相交 `=SUM(Sheet2!A:A)` —— Rust 引擎上曾经是 `#VALUE!`，TS 给 `4`。
 *
 * 根因在 Rust 的**解析器**：`formula/identifier.rs` 的 `!` 分支只认
 * `[$]列[$]行` 这一种右尾，整轴那两种角（只有列字母 `A`、只有行数字 `1`）
 * 扫不出来就让整条公式解析失败 —— `#VALUE!` 是「没解析成」的通用码，不是
 * 求值器算出来的。同表路径能过，只因为它在 `scan_abs_cell_addr` 失败后
 * 还接着试了整列 / 整行两个扫描器，而跨表分支两个都没接。
 *
 * 这一类此前漏掉，纯粹是因为**语料里没有跨表公式** —— 这张网的工作负载在
 * 此之前是单表的。严重度不低：`=SUM(Sheet2!A:A)` 是最常见的写法之一，而本仓
 * 两个后端可在运行期互换，同一份工作簿宿主选 TS 能算、选 WASM 就 `#VALUE!`。
 *
 * # 夹具形状
 *
 * 这是这张网里**第一个多表工作负载**。驱动（`cross-engine-parity-engines.ts`）
 * 按工作负载碰到的最大表索引拉起表：`WorkloadCell.sheet` 省略即 0 号表，所以
 * 既有的单表场景一格都没动。
 *
 * Sheet2 的夹具刻意**稀疏**（A1、A3 有值，A2 空）：整轴的答案要么来自稀疏
 * 遍历、要么来自矩形基数，稠密夹具两条路径分不开。
 *
 *   Sheet2!A1 = 1    Sheet2!B1 = 100
 *   Sheet2!A2 空     Sheet2!B2 空
 *   Sheet2!A3 = 3    Sheet2!B3 = 300
 *
 * Sheet1 的 CE 列放同形对照（CE1 = 1、CE3 = 3），让「同表整轴 / 跨表整轴」
 * 在同一张表里逐条对照。
 *
 * # 为什么 `COUNTBLANK` 那两行是重点
 *
 * 它们钉的不是「别报错」而是**矩形基数**：整轴引用在两个引擎里都用哨兵坐标
 * 表示（Rust 是 `u32::MAX`，TS 是 `EXCEL_MAX_ROW`），夹到网格上限之后还得
 * 能算出 1048576 − 2。一个只让公式不报错、却把基数算成遍历到的格子数的修法
 * 会在这里断，在 `SUM` 那几行上不会。
 *
 * 期望值一律写**闭式字面量**：「两侧相等」在这一类上尤其没用 —— 修好之后它
 * 会永远为真，证不了两个引擎没有一起退回去。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/** Sheet1 的同形对照列（`MIRROR_COL`）。列 80..83 已被 spill-order 占用。 */
const MIRROR_COL = 85
/** 一行一条公式的探针列。 */
const PROBE_COL = 86
/** 对照列的 A1 写法，喂进同表整轴公式（`=SUM(CH:CH)`）。 */
const MIRROR = a1(0, MIRROR_COL).replace(/\d+$/, '')

/** Sheet2 的稀疏夹具 + Sheet1 的同形对照列。 */
const FIXTURE: WorkloadCell[] = [
  { sheet: 1, row: 0, col: 0, kind: 'number', value: 1 },
  { sheet: 1, row: 2, col: 0, kind: 'number', value: 3 },
  { sheet: 1, row: 0, col: 1, kind: 'number', value: 100 },
  { sheet: 1, row: 2, col: 1, kind: 'number', value: 300 },
  { row: 0, col: MIRROR_COL, kind: 'number', value: 1 },
  { row: 2, col: MIRROR_COL, kind: 'number', value: 3 },
]

/**
 * 公式与它**必须显示**的东西。每一行都是闭式期望值。
 *
 * 配对是刻意的：凡跨表整轴的一行，尽量在附近有一行同表整轴或跨表有界的
 * 对照 —— 修复让跨表复用同表的扫描器，任何一侧单独漂移都该在这里断。
 */
export const CROSS_SHEET_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  // —— 报障的那一组：跨表整列聚合。
  ['=SUM(Sheet2!A:A)', '4'],
  ['=COUNT(Sheet2!A:A)', '2'],
  ['=COUNTA(Sheet2!A:A)', '2'],
  ['=MAX(Sheet2!A:A)', '3'],
  ['=AVERAGE(Sheet2!A:A)', '2'],
  // 矩形基数：1048576 − 2。夹取生效了才可能是这个数。
  ['=COUNTBLANK(Sheet2!A:A)', '1048574'],
  // —— 跨表整行。Sheet2 第 1 行是 A1=1 + B1=100。
  ['=SUM(Sheet2!1:1)', '101'],
  // 16384 − 2。
  ['=COUNTBLANK(Sheet2!1:1)', '16382'],
  // —— 两个对照面：它们在修复前就是对的，修复不能碰坏。
  [`=SUM(${MIRROR}:${MIRROR})`, '4'],
  ['=SUM(Sheet2!A1:A5)', '4'],
  [`=COUNTBLANK(${MIRROR}:${MIRROR})`, '1048574'],
  // —— 多轴：跨表整列区间 / 整行区间。A 列 4 + B 列 400。
  ['=SUM(Sheet2!A:C)', '404'],
  ['=SUM(Sheet2!1:3)', '404'],
  ['=COUNT(Sheet2!A:C)', '4'],
  // —— `$` 变体。绝对性只是写法标注，取值必须与相对形式逐字相同。
  ['=SUM(Sheet2!$A:$A)', '4'],
  ['=SUM(Sheet2!$1:$1)', '101'],
  ['=SUM(Sheet2!$A:$C)', '404'],
  // —— 跨表整轴出现在聚合以外的位置。
  ['=COUNTIF(Sheet2!A:A,">1")', '1'],
  ['=COUNTIFS(Sheet2!A:A,">1")', '1'],
  // INDEX 数的是区域内**绝对位置**，空格照样占一格（A2 空 → A3 是第 3）。
  //
  // `MATCH` **刻意不在这张表里**：TS 引擎对整轴区域的 `MATCH` 一律答 `#N/A`
  // （`=MATCH(3,CH:CH,0)` 同表也一样，`=MATCH(3,Sheet2!A1:A5,0)` 有界就对），
  // 而 Rust 与 Excel 都答 3。那是一条**与跨表无关**的 TS 侧缺陷，两个引擎今天
  // 给不出同一个闭式答案，钉进来只会让这张 always-on 的网长红。它钉在
  // `excel/rust/excel-core/tests/cross_sheet_whole_axis.rs`（Rust 侧口径），
  // TS 侧修好后再把这一行搬回来。
  ['=INDEX(Sheet2!A:A,3)', '3'],
  ['=SUMIF(Sheet2!A:A,">1")', '3'],
  // 两条跨表整轴参与算术。
  ['=SUM(Sheet2!A:A)+SUM(Sheet2!B:B)', '404'],
  // —— 不存在的表名。整轴与单格必须给**同一个**码：`#REF!`（表不存在），
  //    而不是 `#VALUE!`（公式没解析成）。修复前整轴给的正是后者。
  ['=SUM(NoSuch!A:A)', '#REF!'],
  ['=SUM(NoSuch!A1)', '#REF!'],
  ['=SUM(NoSuch!1:1)', '#REF!'],
]

export const CROSS_SHEET_ADDRS: readonly string[] = CROSS_SHEET_CASES.map((_, row) =>
  a1(row, PROBE_COL),
)

export const EXPECTED_CROSS_SHEET_DISPLAYS: readonly string[] = CROSS_SHEET_CASES.map(
  ([, displayed]) => displayed,
)

export const CROSS_SHEET_WORKLOAD: readonly WorkloadCell[] = [
  ...FIXTURE,
  ...CROSS_SHEET_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: PROBE_COL, kind: 'formula', value: formula }),
  ),
]
