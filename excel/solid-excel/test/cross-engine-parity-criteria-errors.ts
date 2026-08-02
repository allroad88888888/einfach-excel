/**
 * **criteria 这一层（`*IF` / `*IFS` 家族）在错误值上的跨引擎规格** —— 夹具、地址、
 * 闭式期望值。
 *
 * 单列一份文件而不是继续堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300 行
 * 上限，而这一层要讲清三条**极易改串**的规则，说明比数据长。原先住在 cases.ts 的
 * 列 W/X/Y（错误格短不短路）一并搬来 —— 它和下面两条问的是同一件事的三个面，拆在
 * 两份文件里只会让人从一条去推另一条。
 *
 * 三条规则，逐层递进：
 *
 * 0. 条件区里的错误格**不短路**整个聚合（列 W/X/Y，`CRITERIA_CASES`）。
 * A. 不短路之后它**匹配上什么** —— 按显示文本比（列 AA-AD，见下）。
 * B. criteria 实参**本身**是错误值时**传播**（同上）。
 *
 * # A 与 B 方向相反，最容易改串
 *
 * * **A —— 条件是「写着错误码的字符串」**。`"#N/A"` / `"<>#N/A"` 里的 `#N/A` 只是
 *   文本，错误格按**显示文本**参与比较。于是 `"#N/A"` 数得到错误格，`"<>#N/A"`
 *   数得到除它以外的一切。Excel 的标准「数非错误格」配方（Exceljet）就靠这个：
 *   10 格里 1 个 `#N/A` + 1 个 `#VALUE!` 时，`COUNTIF(rng,"<>#N/A")` = 9、
 *   `COUNTIFS(rng,"<>#N/A",rng,"<>#VALUE!")` = 8。
 * * **B —— criteria 实参**本身**求值成错误值**（`=COUNTIF(rng,#REF!)`，或 criteria
 *   指向一个算成错误的格子）。这是普通的实参错误，原样传播，不做任何文本比较。
 *
 * 一句话区分：**A 看字符串内容，B 看值的种类**。同一个 `#N/A`，写成 `"#N/A"` 是
 * 条件，求值成错误值是传播。两条各有独立的行，一起红就说明改串了。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * 两侧**各错一半，方向还相反**，所以「两侧相等」在这里从来抓不到东西：
 *
 * * A —— TS 侧 `makeCriterionMatcher` 写死了错误格一律不匹配，于是 `"#DIV/0!"`
 *   永远回 0，Excel 的标准配方在 TS 后端上根本写不出来。Rust 侧只对了一半：
 *   `coerce_to_text(Value::Error)` 确实产出 `#N/A`，但 `matches_criterion` 的
 *   文本兜底**无视 op**，`<>` 退化成 `=` —— `COUNTIF(rng,"<>#N/A")` 回的是
 *   「等于 #N/A」的个数，正好反过来。配方的两半在两个引擎上各坏一半。
 * * B —— TS 传播，Rust 完全没有这道检查，直接拿 `#REF!` 去做文本比较，去数
 *   「显示文本等于 `#REF!` 的格子」。
 *
 * 上一轮夹具**刻意避开了** A（当时是一条不打算修的已知分歧，钉了只会红在那儿），
 * 所以 A/B 两组是新开的，不是把旧行改数字。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/**
 * 规则 0 —— 列 Y。条件区里的错误格**不短路**。这里的判据是 `">3"`，一个**有序
 * 比较**，错误格只是单纯地不满足它；它**转而**匹配上什么（按显示文本比，于是
 * `"#N/A"` 命中它）是下面 A 组的事，两者不要互相推导。
 *
 * 这一组必须跨引擎钉，是因为两个引擎都曾 `COUNTIF` / `SUMIF` 对而
 * `COUNTIFS` / `SUMIFS` 错 —— 「两侧相等」一路全绿，钉住的正是缺陷本身。
 *
 * 夹具把两个错误放在**相反的行**：`W4` 是条件格（`">3"` 不命中它），`X1` 是值格，
 * 落在 `"<5"` 唯一命中的那一行。`"<5"` 两行是控制组 —— 值档必须照旧传播，所以
 * 「到处都不传播了」也满足不了这张表。
 */
export const CRITERIA_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  ['=COUNTIF(W1:W4,">3")', '2'], // the single-criterion form was always right
  ['=COUNTIFS(W1:W4,">3")', '2'], // ...and the multi-criterion form must agree
  ['=SUMIF(W1:W4,">3",X1:X4)', '50'],
  ['=SUMIFS(X1:X4,W1:W4,">3")', '50'],
  ['=AVERAGEIF(W1:W4,">3",X1:X4)', '25'],
  ['=AVERAGEIFS(X1:X4,W1:W4,">3")', '25'],
  ['=MAXIFS(X1:X4,W1:W4,">3")', '30'],
  ['=MINIFS(X1:X4,W1:W4,">3")', '20'],
  // Control — the VALUE tier still propagates: `"<5"` matches row 1, whose X
  // cell is an error. The Rust `SUMIF` used to drop it and answer `0`, a
  // plausible number that no equality-only assertion could catch.
  ['=SUMIF(W1:W4,"<5",X1:X4)', '#DIV/0!'],
  ['=SUMIFS(X1:X4,W1:W4,"<5")', '#DIV/0!'],
]
export const CRITERIA_ADDRS = CRITERIA_CASES.map((_, i) => a1(i, 24))
export const EXPECTED_CRITERIA_DISPLAYS = CRITERIA_CASES.map(([, displayed]) => displayed)

/**
 * 列 AA —— 条件区。10 格里 1 个 `#N/A` + 1 个 `#VALUE!`，其余是干净数字：
 * Exceljet 那条配方的形状，好让 9 / 8 两个数字可以直接引用。
 *
 * 两个错误格用公式造（`=NA()` / `=1+"x"`），它们各自的错误码已由本套件的
 * `ERROR_LITERALS` / `ERROR_ADDRS` 两类分别钉住，这里可以放心当既定事实用。
 */
const CRITERIA_SOURCE: ReadonlyArray<number | string> = [
  10,
  20,
  '=NA()',
  30,
  40,
  '=1+"x"',
  50,
  60,
  70,
  80,
]

/** 列 AB —— 值区，1..10 全是干净数字，免得值档的传播盖住条件档的断言。 */
const VALUE_SOURCE: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** 列 AD —— 纯文本小夹具，只服务那条 `<>` 退化回归。 */
const TEXT_SOURCE: ReadonlyArray<string> = ['apple', 'banana', 'apple', 'cherry']

/** 列 AD 第 6 行 —— 一个算成 `#DIV/0!` 的格子，B 组用它当 criteria。 */
const CRITERIA_ERROR_CELL_ROW = 5

/** Excel 的答案。列 AC。 */
export const CRITERIA_ERROR_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  // --- A：条件字符串里写错误码 -------------------------------------------
  // Exceljet 配方本体，两个数字都钉死。9 = 除那 1 个 #N/A 以外的全部（含 #VALUE!）。
  ['=COUNTIF(AA1:AA10,"<>#N/A")', '9'],
  // 再排掉 #VALUE! 就剩 8 —— 这就是「数非错误格」的标准写法。
  ['=COUNTIFS(AA1:AA10,"<>#N/A",AA1:AA10,"<>#VALUE!")', '8'],
  // 正向：错误码字符串数得到对应的错误格，且只数得到**那一种**。
  ['=COUNTIF(AA1:AA10,"#N/A")', '1'],
  ['=COUNTIF(AA1:AA10,"#VALUE!")', '1'],
  ['=COUNTIF(AA1:AA10,"#DIV/0!")', '0'],
  // 值档跟着条件档走：命中第 3 行 → 取 AB3 = 3。
  ['=SUMIF(AA1:AA10,"#N/A",AB1:AB10)', '3'],
  // 同族一致性：单条件与多条件、求和与极值必须给同一套行。9 行命中，1..10 去掉 3。
  ['=SUMIFS(AB1:AB10,AA1:AA10,"<>#N/A")', '52'],
  ['=SUMIF(AA1:AA10,"<>#N/A",AB1:AB10)', '52'],
  ['=MAXIFS(AB1:AB10,AA1:AA10,"<>#N/A")', '10'],
  ['=MINIFS(AB1:AB10,AA1:AA10,"<>#N/A")', '1'],
  // 控制行：错误格仍然拿不下**有序比较**。改 A 只是让它参与文本比较，不是让它
  // 到处都算命中 —— 少了这一行，一个「错误格一律匹配」的引擎也能满足上面的表。
  ['=COUNTIF(AA1:AA10,">0")', '8'],
  ['=COUNTIF(AA1:AA10,"<0")', '0'],
  // 连带回归：`<>` 对**普通文本**也得是真的「不等于」。Rust 的文本兜底曾无视 op，
  // 这一行在修 A 之前回的是 2 的补集（「等于 apple」的个数）。与错误无关，但走的
  // 是同一条代码路径，`"<>#N/A"` 正踩它。
  ['=COUNTIF(AD1:AD4,"<>apple")', '2'],

  // --- B：criteria 实参本身求值成错误 ------------------------------------
  // 字面错误常量当 criteria → 原样传播。Rust 曾回 0（把 `#REF!` 当文本去比）。
  ['=COUNTIF(AA1:AA10,#REF!)', '#REF!'],
  ['=SUMIF(AA1:AA10,#REF!,AB1:AB10)', '#REF!'],
  ['=COUNTIFS(AA1:AA10,#REF!)', '#REF!'],
  ['=SUMIFS(AB1:AB10,AA1:AA10,#REF!)', '#REF!'],
  ['=MAXIFS(AB1:AB10,AA1:AA10,#REF!)', '#REF!'],
  ['=MINIFS(AB1:AB10,AA1:AA10,#REF!)', '#REF!'],
  // criteria 指向一个算成错误的格子 → 传播的是**那个**错误码，不是某个通用码。
  ['=COUNTIF(AA1:AA10,AD6)', '#DIV/0!'],
  ['=SUMIFS(AB1:AB10,AA1:AA10,AD6)', '#DIV/0!'],
]

export const CRITERIA_ERROR_ADDRS = CRITERIA_ERROR_CASES.map((_, i) => a1(i, 28))
export const EXPECTED_CRITERIA_ERROR_DISPLAYS = CRITERIA_ERROR_CASES.map(
  ([, displayed]) => displayed,
)

/** criteria 这一层的全部夹具与公式：列 W/X/Y（规则 0）+ AA/AB/AC/AD（A、B）。 */
export const CRITERIA_WORKLOAD: WorkloadCell[] = [
  // 列 W / X —— 规则 0 的条件源与值源。两个错误在**相反的行**：W4 是条件格，
  // X1 是值格。
  { row: 0, col: 22, kind: 'number', value: 1 },
  { row: 1, col: 22, kind: 'number', value: 5 },
  { row: 2, col: 22, kind: 'number', value: 9 },
  { row: 3, col: 22, kind: 'formula', value: '=1/0' },
  { row: 0, col: 23, kind: 'formula', value: '=1/0' },
  { row: 1, col: 23, kind: 'number', value: 20 },
  { row: 2, col: 23, kind: 'number', value: 30 },
  { row: 3, col: 23, kind: 'number', value: 40 },
  // 列 Y —— 规则 0 的公式本体。
  ...CRITERIA_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 24, kind: 'formula', value: formula }),
  ),
  ...CRITERIA_SOURCE.map(
    (value, row): WorkloadCell =>
      typeof value === 'number'
        ? { row, col: 26, kind: 'number', value }
        : { row, col: 26, kind: 'formula', value },
  ),
  ...VALUE_SOURCE.map((value, row): WorkloadCell => ({ row, col: 27, kind: 'number', value })),
  ...TEXT_SOURCE.map(
    (text, row): WorkloadCell => ({
      row,
      col: 29,
      kind: 'formula',
      value: `="${text}"`,
    }),
  ),
  { row: CRITERIA_ERROR_CELL_ROW, col: 29, kind: 'formula', value: '=1/0' },
  ...CRITERIA_ERROR_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 28, kind: 'formula', value: formula }),
  ),
]
