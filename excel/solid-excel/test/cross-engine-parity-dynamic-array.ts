/**
 * 第九类分歧：**动态数组构造器的「一个引擎有、另一个没有」**。
 *
 * 单列一份文件而不是堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300 行
 * 上限，与 `-general-text.ts` / `-criteria-*.ts` / `-overflow.ts` 同一个先例。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * `WRAPROWS` / `WRAPCOLS` 曾经**只有 TS 参考引擎有**：Excel 365 那一批动态数组
 * 里的另外 9 个（`TOCOL` `TOROW` `TAKE` `DROP` `EXPAND` `CHOOSEROWS`
 * `CHOOSECOLS` `HSTACK` `VSTACK`）Rust 侧都在，唯独漏了这一对。两个后端在
 * `worker-factory.ts` 里可运行期互换，于是同一份工作簿换个后端就从「有值」
 * 变成 `#NAME?`。名字集合本身由 `engine-function-set-parity.test.ts` 那条门禁
 * 盯着，但它只比名字 —— **比不了算出来的东西**，这张表补的是后一半。
 *
 * # 方向：这一对极容易搞反，所以用同一份输入把两个方向一起钉
 *
 * 微软 support「WRAPROWS function」：`wrap_count` 是 "The maximum number of
 * values for each row"，元素 "by row" 铺；「WRAPCOLS function」：是 "The
 * maximum number of values for each column"，"by column" 铺。于是同一个
 * `{1;2;3;4;5;6}` + `wrap_count = 2`：
 *
 * ```text
 * =WRAPROWS(v,2)      =WRAPCOLS(v,2)
 *   1 2                 1 3 5
 *   3 4                 2 4 6
 *   5 6
 * ```
 *
 * 只钉其中一个，方向写反的实现能靠「形状是 3×2」蒙混过去 —— 必须两条同表。
 *
 * # 其余口径与依据
 *
 * - `vector` 不是一维 → `#VALUE!`；`wrap_count < 1` → `#NUM!`（两条都是微软
 *   文档的原话）。这两个码**不一样**，所以必须分开钉：一个把所有实参错误都
 *   收成 `#VALUE!` 的实现只测其中一条照样全绿。
 * - `pad_with` 缺省是 `#N/A`；`wrap_count >= 元素个数` 时原样返回单行 / 单列，
 *   **不**补齐到 `wrap_count` 宽。
 * - `pad_with` 求值成错误值是合法的（缺省值本身就是 `#N/A`），但**数组** pad
 *   两侧都拒（嵌套数组漏进结果，下游接不住）。这两条方向相反，成对钉。
 *
 * 期望值一律写字面量，不写「两侧相等」—— 这一类的历史起点正是「一侧根本没有
 * 这个函数」，相等断言在补齐之前红得毫无信息量，补齐之后又可能一起错。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/** 列 AK —— 6 元素列向量 1..6，本表所有折叠用例的输入。 */
const VECTOR_COL = 36
/** 列 AL —— 第二列夹具，只为让 `AK1:AL2` 是个货真价实的 2×2（不含空格）。 */
const SECOND_COL = 37
/** 第 11 行 AK11:AP11 —— 同样的 1..6，但摆成**行**向量。 */
const ROW_VECTOR_ROW = 10
/** 折叠用例的首列；步长 4 = 最宽结果 3 列 + 1 列留白（右缘 ghost 用）。 */
const CASE_COL0 = 39
const CASE_STRIDE = 4
/** 单格错误用例所在列。 */
const ERROR_COL = CASE_COL0 + CASE_STRIDE * 9

/** 一条折叠用例：锚点在第 0 行、第 `CASE_COL0 + i * CASE_STRIDE` 列。 */
interface SpillCase {
  readonly formula: string
  readonly rows: number
  readonly cols: number
  /** 结果矩形的显示值，行主序。 */
  readonly displayed: readonly string[]
}

/**
 * 折叠用例。前两条是方向的手算例子，必须挨着读。
 *
 * `AK1:AK5` 那几条是 5 个元素折成 6 格 —— 差的那一格正好落在 WRAPROWS 的末行
 * 右端、WRAPCOLS 的末列下端，两个不同的位置，pad 写错位置会当场分开。
 */
export const DYNAMIC_ARRAY_CASES: readonly SpillCase[] = [
  // 方向：同一份输入，两个转置关系的矩形。
  { formula: '=WRAPROWS(AK1:AK6,2)', rows: 3, cols: 2, displayed: ['1', '2', '3', '4', '5', '6'] },
  { formula: '=WRAPCOLS(AK1:AK6,2)', rows: 2, cols: 3, displayed: ['1', '3', '5', '2', '4', '6'] },
  // 缺省 pad = #N/A，补在两个不同的位置。
  {
    formula: '=WRAPROWS(AK1:AK5,2)',
    rows: 3,
    cols: 2,
    displayed: ['1', '2', '3', '4', '5', '#N/A'],
  },
  {
    formula: '=WRAPCOLS(AK1:AK5,2)',
    rows: 2,
    cols: 3,
    displayed: ['1', '3', '5', '2', '4', '#N/A'],
  },
  // 显式 pad 顶掉缺省。
  {
    formula: '=WRAPROWS(AK1:AK5,2,"x")',
    rows: 3,
    cols: 2,
    displayed: ['1', '2', '3', '4', '5', 'x'],
  },
  {
    formula: '=WRAPCOLS(AK1:AK5,2,"x")',
    rows: 2,
    cols: 3,
    displayed: ['1', '3', '5', '2', '4', 'x'],
  },
  // wrap_count >= 元素个数 → 单行 / 单列，且**不**补齐到 9 宽。
  { formula: '=WRAPROWS(AK1:AK3,9)', rows: 1, cols: 3, displayed: ['1', '2', '3'] },
  { formula: '=WRAPCOLS(AK1:AK3,9)', rows: 3, cols: 1, displayed: ['1', '2', '3'] },
  // 行向量输入：读序仍是从左到右，折出来与列向量那条一模一样。
  { formula: '=WRAPROWS(AK11:AP11,2)', rows: 3, cols: 2, displayed: ['1', '2', '3', '4', '5', '6'] },
]

/**
 * 单格用例：错误码。
 *
 * `#NUM!`（wrap_count < 1）与 `#VALUE!`（非一维 / 非数字 / 数组 pad / 元数）
 * 是两个不同的码，混成一个的实现必须在这里红。`#DIV/0!` 那两条是方向相反的
 * 一半：`vector` 与 `wrap_count` 求值出错要**传播**，而 `pad_with` 出错不传播
 * （上面 `pad` 用例里没有错误 pad，那条由 Rust 单测钉）。
 */
export const DYNAMIC_ARRAY_ERROR_CASES: ReadonlyArray<
  readonly [formula: string, displayed: string]
> = [
  ['=WRAPROWS(AK1:AK6,0)', '#NUM!'],
  ['=WRAPCOLS(AK1:AK6,0)', '#NUM!'],
  ['=WRAPROWS(AK1:AK6,-1)', '#NUM!'],
  // 截断后落到 0 —— 非整数 wrap_count 走的是同一条闸门。
  ['=WRAPCOLS(AK1:AK6,0.5)', '#NUM!'],
  // 二维实参（AK1:AL2 两列都有值，不是靠空格凑出来的）。
  ['=WRAPROWS(AK1:AL2,2)', '#VALUE!'],
  ['=WRAPCOLS(AK1:AL2,2)', '#VALUE!'],
  // 数组 pad 两侧都拒。
  ['=WRAPROWS(AK1:AK6,2,SEQUENCE(2))', '#VALUE!'],
  ['=WRAPCOLS(AK1:AK6,2,SEQUENCE(2))', '#VALUE!'],
  // wrap_count 转不成数字。
  ['=WRAPROWS(AK1:AK6,"x")', '#VALUE!'],
  // 传播：vector 与 wrap_count 各一条。
  ['=WRAPROWS(1/0,2)', '#DIV/0!'],
  ['=WRAPCOLS(AK1:AK6,1/0)', '#DIV/0!'],
  // 元数：两侧的内部码不同（Rust `#ARGS!` / TS `#VALUE!`），渲染边界都收成
  // `#VALUE!` —— 收窄漏了一侧就在这里红。
  ['=WRAPROWS(AK1:AK6)', '#VALUE!'],
  ['=WRAPCOLS(AK1:AK6,2,"x",9)', '#VALUE!'],
]

const caseCol = (i: number): number => CASE_COL0 + i * CASE_STRIDE

/** 矩形按行主序的地址。本地实现而非复用 `cases.ts::region`：那边会反过来 import 本文件。 */
function rectAddrs(row0: number, col0: number, rows: number, cols: number): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out.push(a1(row0 + r, col0 + c))
  }
  return out
}

/**
 * 每条折叠用例的两个「幽灵」探针：结果矩形正下方一格、正右方一格。
 *
 * 它们必须是空的。少了这两格，一个把 3×2 折成 3×3 或 4×2 的实现只会在
 * 「多出来的那格没被采样」处静悄悄溢出 —— 形状断言看不见多出来的边。
 */
const ghostAddrs = (i: number, c: SpillCase): string[] => [
  a1(c.rows, caseCol(i)),
  a1(0, caseCol(i) + c.cols),
]

export const DYNAMIC_ARRAY_ADDRS: string[] = [
  ...DYNAMIC_ARRAY_CASES.flatMap((c, i) => [
    ...rectAddrs(0, caseCol(i), c.rows, c.cols),
    ...ghostAddrs(i, c),
  ]),
  ...DYNAMIC_ARRAY_ERROR_CASES.map((_, row) => a1(row, ERROR_COL)),
]

export const EXPECTED_DYNAMIC_ARRAY_DISPLAYS: string[] = [
  ...DYNAMIC_ARRAY_CASES.flatMap((c) => [...c.displayed, '', '']),
  ...DYNAMIC_ARRAY_ERROR_CASES.map(([, displayed]) => displayed),
]

/** 列 AK / AL + 第 11 行的行向量 + 每条用例各自的锚点。 */
export const DYNAMIC_ARRAY_WORKLOAD: WorkloadCell[] = [
  ...Array.from({ length: 6 }, (_, r): WorkloadCell => ({
    row: r,
    col: VECTOR_COL,
    kind: 'number',
    value: r + 1,
  })),
  ...Array.from({ length: 6 }, (_, r): WorkloadCell => ({
    row: r,
    col: SECOND_COL,
    kind: 'number',
    value: r + 7,
  })),
  ...Array.from({ length: 6 }, (_, c): WorkloadCell => ({
    row: ROW_VECTOR_ROW,
    col: VECTOR_COL + c,
    kind: 'number',
    value: c + 1,
  })),
  ...DYNAMIC_ARRAY_CASES.map(
    (c, i): WorkloadCell => ({ row: 0, col: caseCol(i), kind: 'formula', value: c.formula }),
  ),
  ...DYNAMIC_ARRAY_ERROR_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: ERROR_COL, kind: 'formula', value: formula }),
  ),
]
