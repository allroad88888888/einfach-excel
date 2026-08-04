/**
 * 第十类分歧：**Rust 解析器认不出的跨表引用形状**。两组，同一条根因家族 ——
 * `formula/` 里跨表分流缺了某一支，于是整条公式解析失败：
 *
 * 1. 跨表 × 整轴（`Sheet2!A:A`、`Sheet2!1:3`）—— `identifier.rs` 的 `!` 分支
 *    只认 `[$]列[$]行` 一种右尾。
 * 2. 跨表 × 带引号表名（`'My Sheet'!A1`）—— `primary.rs` 的首字符分流里根本
 *    没有 `'` 这一支，连**有界**形式都解析不出来。
 *
 * 两组同住一份文件，因为它们是同一个提问的两半：「`!` 左边的表名怎么取」与
 * 「`!` 右边的尾巴怎么收」。修法上也是同一条复用链 —— 带引号的那一支收完
 * 表名后直接交给整轴那一支新建的 `finish_sheet_qualified_ref`。
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
/** 一行一条公式的探针列（整轴组）。 */
const PROBE_COL = 86
/** 带引号表名组的探针列。 */
const QUOTED_PROBE_COL = 87
/** 对照列的 A1 写法，喂进同表整轴公式（`=SUM(CH:CH)`）。 */
const MIRROR = a1(0, MIRROR_COL).replace(/\d+$/, '')

/**
 * Sheet2（2 号索引是 `'My Sheet'`）的稀疏夹具 + Sheet1 的同形对照列。
 *
 * 两张被引用表的 A / B 列**刻意同形**（A1=1、A2 空、A3=3、B1=100、B3=300）：
 * 带引号那一组的每条期望值都能在整轴那一组里找到同值的不带引号对照，于是
 * 「引号只影响表名怎么取、不影响下游」这句话是被断言证着的，不是注释里说说。
 * `'My Sheet'` 多出的 D 列溢出锚点落在所有被断言的行 / 列区间之外。
 */
const FIXTURE: WorkloadCell[] = [
  { sheet: 1, row: 0, col: 0, kind: 'number', value: 1 },
  { sheet: 1, row: 2, col: 0, kind: 'number', value: 3 },
  { sheet: 1, row: 0, col: 1, kind: 'number', value: 100 },
  { sheet: 1, row: 2, col: 1, kind: 'number', value: 300 },
  { sheet: 2, row: 0, col: 0, kind: 'number', value: 1 },
  { sheet: 2, row: 2, col: 0, kind: 'number', value: 3 },
  { sheet: 2, row: 0, col: 1, kind: 'number', value: 100 },
  { sheet: 2, row: 2, col: 1, kind: 'number', value: 300 },
  // 'My Sheet'!D5 上溢出 1..3（占 D5:D7），供 `'My Sheet'!D5#` 那一行引用。
  // 锚点刻意放在**第 5 行**而不是 D1：整行用例只覆盖 1:1 与 1:3，溢出域落在
  // 它们外面，`'My Sheet'!1:3` 才与 `Sheet2!1:3` 逐字同值（404）。放 D1 时
  // 两组会各自算出 102 / 410，对照就断了 —— 这是被 TS 侧实测揪出来的。
  { sheet: 2, row: 4, col: 3, kind: 'formula', value: '=SEQUENCE(3)' },
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
  // INDEX / MATCH 数的是区域内**绝对位置**，空格照样占一格（A2 空 → A3 是第 3）。
  ['=INDEX(Sheet2!A:A,3)', '3'],
  ['=MATCH(3,Sheet2!A:A,0)', '3'],
  // MATCH 的两个对照面。这三行钉的是**位置从矩形起点数**：TS 侧整轴要先夹到
  // 已用区域才物化得了，夹取只许砍尾巴 —— 动了头这三行就分道扬镳。
  // `match_type` 显式写 0：两个引擎省略第三参时的默认档不同（TS 是 1、Rust 的
  // 遗留分支按精确档走），那是另一条差异，不该混进这一类里。
  [`=MATCH(3,${MIRROR}:${MIRROR},0)`, '3'],
  ['=MATCH(3,Sheet2!A1:A5,0)', '3'],
  ['=SUMIF(Sheet2!A:A,">1")', '3'],
  // 两条跨表整轴参与算术。
  ['=SUM(Sheet2!A:A)+SUM(Sheet2!B:B)', '404'],
  // —— 不存在的表名。整轴与单格必须给**同一个**码：`#REF!`（表不存在），
  //    而不是 `#VALUE!`（公式没解析成）。修复前整轴给的正是后者。
  ['=SUM(NoSuch!A:A)', '#REF!'],
  ['=SUM(NoSuch!A1)', '#REF!'],
  ['=SUM(NoSuch!1:1)', '#REF!'],
]

/**
 * 第二组：**带引号表名**（2 号表叫 `My Sheet`，名字里有空格）。
 *
 * 每一行都在整轴那一组里有一条同值的不带引号对照（两张被引用表同形），所以
 * 这一组断的是「引号这一层」本身，而不是跨表语义。
 *
 * 三条不在这张表里，各有理由：
 *
 * - `INDIRECT("'My Sheet'!A1")` —— TS 给 `1`，Rust 给 `#REF!`。Rust 的
 *   `INDIRECT` 走**另一条**文本扫描器（`eval.rs::parse_indirect_ref`，不经过
 *   `parse_formula`），表名判据仍是 `[A-Za-z_][A-Za-z0-9_]*`。今天两个引擎
 *   给不出同一个闭式答案，钉进这张 always-on 的网只会长红；它钉在
 *   `excel/rust/excel-core/tests/quoted_sheet_name.rs`（Rust 侧现状口径）。
 * - `'It''s'!A1`（`''` 转义）与非 ASCII 表名 —— 驱动的 `SHEET_NAMES` 是按索引
 *   排开的固定名单，一个索引一个名字；再塞两张表会把所有共用 `WORKLOAD` 的
 *   场景都拖上。转义规则钉在 Rust 侧
 *   `src/formula/quoted_name_tests.rs` 与 `tests/quoted_sheet_name*.rs`。
 */
const QUOTED_SHEET_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  // —— 报障形状本身：带引号 + 有界。修复前 Rust 侧连这条都解析不出来。
  ["='My Sheet'!A1", '1'],
  ["=SUM('My Sheet'!A1:A3)", '4'],
  ["=SUM('My Sheet'!A1:B3)", '404'],
  // —— 带引号 × 整轴：本文件两组分歧的交点。
  ["=SUM('My Sheet'!A:A)", '4'],
  ["=COUNT('My Sheet'!A:A)", '2'],
  ["=SUM('My Sheet'!A:B)", '404'],
  ["=SUM('My Sheet'!1:1)", '101'],
  ["=SUM('My Sheet'!1:3)", '404'],
  // 矩形基数 1048576 − 2：带引号那条路径同样得走到夹取，而不是只求「别报错」。
  ["=COUNTBLANK('My Sheet'!A:A)", '1048574'],
  // —— 带引号 × `$`。绝对性只是写法标注，取值必须与相对形式逐字相同。
  ["='My Sheet'!$A$1", '1'],
  ["=SUM('My Sheet'!$A:$A)", '4'],
  ["=SUM('My Sheet'!$1:$3)", '404'],
  // —— 带引号 × spill：`'My Sheet'!D5` 上是 `=SEQUENCE(3)`，溢出 D5:D7。
  ["=SUM('My Sheet'!D5#)", '6'],
  // —— 不必要的引号。`'Sheet2'!A1` 与 `Sheet2!A1` 必须同值：引号是写法不是
  //    语义，两侧的语法树里都不该留下它的痕迹。
  ["='Sheet2'!A1", '1'],
  ['=Sheet2!A1', '1'],
  // —— 带引号 + 表名不存在。与不带引号同一个码：`#REF!`（表不存在）而不是
  //    `#VALUE!`（公式没解析成）—— 修复前带引号给的正是后者。
  ["='No Such Sheet'!A1", '#REF!'],
  ["=SUM('No Such Sheet'!A:A)", '#REF!'],
  // —— 对照：不带引号的同形表，逐条同值。
  ['=SUM(Sheet2!A1:A3)', '4'],
]

export const CROSS_SHEET_ADDRS: readonly string[] = [
  ...CROSS_SHEET_CASES.map((_, row) => a1(row, PROBE_COL)),
  ...QUOTED_SHEET_CASES.map((_, row) => a1(row, QUOTED_PROBE_COL)),
]

export const EXPECTED_CROSS_SHEET_DISPLAYS: readonly string[] = [
  ...CROSS_SHEET_CASES.map(([, displayed]) => displayed),
  ...QUOTED_SHEET_CASES.map(([, displayed]) => displayed),
]

export const CROSS_SHEET_WORKLOAD: readonly WorkloadCell[] = [
  ...FIXTURE,
  ...CROSS_SHEET_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: PROBE_COL, kind: 'formula', value: formula }),
  ),
  ...QUOTED_SHEET_CASES.map(
    ([formula], row): WorkloadCell => ({
      row,
      col: QUOTED_PROBE_COL,
      kind: 'formula',
      value: formula,
    }),
  ),
]
