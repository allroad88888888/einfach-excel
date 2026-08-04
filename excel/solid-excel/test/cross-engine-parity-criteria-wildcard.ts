/**
 * **criteria 的文本比较层在跨引擎上的规格** —— 大小写，以及通配符判据「只匹配
 * 文本格」。夹具、地址、闭式期望值。
 *
 * 与兄弟文件 `cross-engine-parity-criteria-errors.ts` 的分工：那份问「错误格
 * 短不短路、不短路之后按什么比」，本份问「**判据本身**怎么解释」—— 大小写折不折、
 * 带了通配符之后还看不看非文本格。两份共用 `*IF` / `*IFS` 那套代码路径，但坏的
 * 方式完全不同，所以分开钉。
 *
 * # 两条规则与它们的 Excel 依据
 *
 * * **不区分大小写** —— MS 官方 COUNTIF 文档原话：“Criteria aren't case
 *   sensitive. In other words, the string "apples" and the string "APPLES"
 *   will match the same cells.”
 * * **通配符判据只匹配文本格** —— Exceljet「Count cells that contain text」
 *   （`=COUNTIF(data,"*")`）原话：“Empty cells and cells that contain numeric
 *   values or errors should not be included in the count.” 同页给出互补的
 *   `=COUNTIF(data,"<>*")`，在同一个 11 格区域上一个回 4、另一个回 7 —— 两者
 *   **严格互补**，所以数字格 / 错误格 / 空格全部落在 `"<>*"` 那一侧。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * 两侧**各错一半，方向还相反**，所以「两侧相等」在这里同样抓不到东西：
 *
 * * 大小写 —— Rust 的文本兜底是逐字节 `==`，`COUNTIF(rng,"APPLE")` 数不到
 *   `apple`；同一个函数里**紧邻的**通配符档却一直是不敏感的（`wildcard_match`
 *   两侧折小写），于是 `"APPLE"` 回 1 而 `"APPLE*"` 回 2，自相矛盾。TS 一直对。
 * * 通配符 × 非文本格 —— Rust 先 `coerce_to_text` 再匹配，把数字、布尔、错误
 *   格全数进 `"*"`（本夹具上回 8 而不是 5），`"<>*"` 相应恒为 0。TS 只错了错误
 *   格那一小片：它被写死成 `=` 和 `<>` **两侧都不算**，于是 `"*"` 与 `"<>*"`
 *   加起来凑不满整个区域。
 * * `~` 转义 —— 反过来是 **TS 错、Rust 对**：TS 只把 `*` / `?` 当通配符标记，
 *   `"~~"` 没被解码，命中的是内容为 `~~` 的格子而不是内容为 `~` 的格子。总数
 *   都是 1，**只有定位到具体哪一格才分得出来**，所以下面单独列了两行子区域。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/**
 * 列 AE —— 条件区。8 格覆盖 criteria 会遇到的全部值种类，**故意不留空格**：
 * 「区域枚举跳不跳空格」是一条正交的、两个引擎至今仍不同判的分歧（Rust 的
 * `stream_range` 跳过空格，TS 逐格枚举），把空格放进来会让这张表红在那上面，
 * 而不是红在本文件要钉的两条规则上。
 *
 * 行号与含义 —— 下面所有闭式数字都从这张表算出来：
 * 1 `apple`(文本) 2 `APPLE`(文本) 3 `5`(数字) 4 `TRUE`(布尔)
 * 5 `#N/A`(错误) 6 `a*b`(文本) 7 `~`(文本) 8 `"5"`(文本型数字)
 *
 * 于是：**文本格 5 个**（1/2/6/7/8），**非文本格 3 个**（3/4/5）。
 *
 * 布尔格写成 `=(1=1)` 而不是 `=TRUE()`：后者在 TS 参考引擎上回
 * `#VALUE!`（一条与本类无关的、单独的分歧），拿它当夹具会让这张表红在**播种**
 * 上而不是红在语义上。两个引擎各有一条单测钉住「这两种写法真的产出布尔 / 文本」
 * （`criteria_wildcard_case.rs` / `criteria-wildcard-case.test.ts` 末条）。
 */
const CRITERIA_TEXT_SOURCE: ReadonlyArray<number | string> = [
  '="apple"',
  '="APPLE"',
  5,
  '=(1=1)',
  '=NA()',
  '="a*b"',
  '="~"',
  '="5"',
]

/** 列 AF —— 值区，1..8 全是干净数字，免得值档的传播盖住条件档的断言。 */
const CRITERIA_TEXT_VALUES: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8]

/** Excel 的答案。列 AG。 */
export const CRITERIA_WILDCARD_CASES: ReadonlyArray<
  readonly [formula: string, displayed: string]
> = [
  // --- 大小写：三种写法一个答案 ------------------------------------------
  ['=COUNTIF(AE1:AE8,"apple")', '2'],
  ['=COUNTIF(AE1:AE8,"APPLE")', '2'],
  ['=COUNTIF(AE1:AE8,"ApPlE")', '2'],
  // `<>` 是同一条路径的补集：8 - 2 = 6。
  ['=COUNTIF(AE1:AE8,"<>APPLE")', '6'],
  // 布尔格也走文本兜底，一并不区分大小写。
  ['=COUNTIF(AE1:AE8,"true")', '1'],

  // --- 通配符判据只匹配文本格 ---------------------------------------------
  ['=COUNTIF(AE1:AE8,"*")', '5'],
  // 严格互补：非文本格 = 数字 + 布尔 + 错误 = 3。5 + 3 = 8 正好铺满整个区域 ——
  // 这一对是本组的**核心**，任何「某种格子两侧都不算」的实现都凑不满。
  ['=COUNTIF(AE1:AE8,"<>*")', '3'],
  ['=COUNTIF(AE1:AE8,"?*")', '5'],
  // `"?"` = 恰好一个字符的**文本**格：`~` 与文本 `"5"`。数字 5 不算。
  ['=COUNTIF(AE1:AE8,"?")', '2'],
  // 数字格的分界：带通配符吃不到数字 5……
  ['=COUNTIF(AE1:AE8,"5*")', '1'],
  // ……不带通配符照旧强转，数字 5 与文本 `"5"` 都命中。少了这一行，一个「通配符
  // 一律不匹配任何东西」的实现也能满足上面的表。
  ['=COUNTIF(AE1:AE8,"5")', '2'],
  // 错误格 / 布尔格的显示文本都不参与通配符匹配。
  ['=COUNTIF(AE1:AE8,"*N*")', '0'],
  ['=COUNTIF(AE1:AE8,"T*")', '0'],

  // --- 与「条件字符串里写错误码」的分界线 ----------------------------------
  // 同一个错误格：不带通配符时按显示文本比（命中），带通配符时根本不参与（不
  // 命中）。这两行与正上方的 `"*N*"` 必须同时成立 —— 合并两档就一起红。
  ['=COUNTIF(AE1:AE8,"#N/A")', '1'],
  ['=COUNTIF(AE1:AE8,"<>#N/A")', '7'],

  // --- `~` 转义 ------------------------------------------------------------
  ['=COUNTIF(AE1:AE8,"a~*b")', '1'],
  // `~~` = 一个字面量 `~`。总数 1 分辨不出对错（拿 `~~` 原样去比也回 1，只是
  // 命中了别的格子），所以下面两行把它**定位**到第 7 格。
  ['=COUNTIF(AE1:AE8,"~~")', '1'],
  ['=COUNTIF(AE7:AE7,"~~")', '1'],
  ['=COUNTIF(AE1:AE6,"~~")', '0'],

  // --- 同族自洽：八个名字在同一条判据上给同一套命中行 ----------------------
  // `"*"` → 文本行 1/2/6/7/8 → 和 24、极值 8 / 1。
  ['=SUMIF(AE1:AE8,"*",AF1:AF8)', '24'],
  ['=SUMIFS(AF1:AF8,AE1:AE8,"*")', '24'],
  ['=COUNTIFS(AE1:AE8,"*")', '5'],
  ['=MAXIFS(AF1:AF8,AE1:AE8,"*")', '8'],
  ['=MINIFS(AF1:AF8,AE1:AE8,"*")', '1'],
  // 两个平均用 `"APPLE"` 而不是 `"*"`：命中行 1/2 → 3 / 2 = 1.5，二进制精确，
  // 不必再赌一次数字转文本的渲染（那一类由 `GENERAL_TEXT_CASES` 单独钉）。
  ['=SUMIF(AE1:AE8,"APPLE",AF1:AF8)', '3'],
  ['=AVERAGEIF(AE1:AE8,"APPLE",AF1:AF8)', '1.5'],
  ['=AVERAGEIFS(AF1:AF8,AE1:AE8,"APPLE")', '1.5'],
]

export const CRITERIA_WILDCARD_ADDRS = CRITERIA_WILDCARD_CASES.map((_, i) => a1(i, 32))
export const EXPECTED_CRITERIA_WILDCARD_DISPLAYS = CRITERIA_WILDCARD_CASES.map(
  ([, displayed]) => displayed,
)

/** 本组的全部夹具与公式：列 AE（条件区）/ AF（值区）/ AG（公式）。 */
export const CRITERIA_WILDCARD_WORKLOAD: WorkloadCell[] = [
  ...CRITERIA_TEXT_SOURCE.map(
    (value, row): WorkloadCell =>
      typeof value === 'number'
        ? { row, col: 30, kind: 'number', value }
        : { row, col: 30, kind: 'formula', value },
  ),
  ...CRITERIA_TEXT_VALUES.map(
    (value, row): WorkloadCell => ({ row, col: 31, kind: 'number', value }),
  ),
  ...CRITERIA_WILDCARD_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 32, kind: 'formula', value: formula }),
  ),
]
