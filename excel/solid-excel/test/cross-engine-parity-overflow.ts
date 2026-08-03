/**
 * 第八类分歧：**浮点溢出与下溢的出口**。
 *
 * 单列一份文件而不是堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300 行
 * 上限，而这一类的期望值离不开「Excel 在哪几个点上刻意不跟 IEEE」的说明。
 * 与 `-general-text.ts` / `-criteria-*.ts` 同一个先例。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * `=1E308*10` 这类式子此前在两个引擎上都**不报错**，各自吐一个宿主语言的
 * 非有限值：Rust 是 `inf`、TS 是 `Infinity`。后来数字→文本收口成一份规格，
 * 两侧变成了同一个 `Infinity` —— **一致，但仍然不是 Excel 的答案**。所以
 * 「两侧相等」这条断言在这一类上先是抓不到（各错各的），再是永远为真（一起
 * 错），只有字面量能证明它们不是一起错的。
 *
 * # Excel 的答案与依据
 *
 * Microsoft Learn，"Floating-point arithmetic may give inaccurate result in
 * Excel"：
 *
 * - **溢出** → `#NUM!`（"Excel uses its own special representation for this
 *   case (#NUM!)"）。
 * - **下溢** → `0`（"In IEEE and Excel, the result is 0"）。方向与溢出相反，
 *   必须成对钉 —— 一个「非有限或过小都报错」的实现在只测溢出的表上照样全绿。
 * - **除以零** → `#DIV/0!`（"Excel doesn't support infinities, rather, it
 *   gives a #DIV/0! error"），不能被溢出闸门吞掉。
 *
 * # 为什么一个 `1E308` 都不写
 *
 * **Rust 引擎的解析器不认科学计数字面量**：`=1E2` 在它上面是 `#VALUE!`
 * （`1` 后面跟了个叫 `E2` 的单元格引用），而 TS 引擎给 `100`。那是一条独立
 * 的、先于本类存在的词法分歧（另立待办）；这里一律用 `10^308` 这类幂表达式
 * 绕开它，好让这张表只量溢出闸门一件事。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/** Excel 的答案。列 AH。 */
export const OVERFLOW_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  // 四个二元算术运算符各自的溢出路径 —— 只修 `*` 会漏掉后面三条。
  ['=10^308*10', '#NUM!'],
  ['=9*10^307+9*10^307', '#NUM!'],
  ['=(0-9*10^307)-9*10^307', '#NUM!'],
  ['=10^308/10^-10', '#NUM!'],
  // `^` 本来就有闸门；一并钉住免得被「统一」掉。
  ['=10^309', '#NUM!'],
  // 聚合的累加器同样会顶破 —— 否则「运算符报 #NUM!、聚合吐 Infinity」是同一个
  // 产品里的两种答案。TS 侧这两个名字还各有一份稀疏孪生实现。
  ['=SUM(9*10^307,9*10^307)', '#NUM!'],
  ['=PRODUCT(10^300,10^300)', '#NUM!'],
  // 下溢：方向相反的那一半，必须**不**报错。
  ['=10^-200*10^-200', '0'],
  ['=10^-300/10^100', '0'],
  // 负数下溢是 IEEE 的 `-0`；Excel 没有负零，显示边界收口成 `0`。
  ['=(0-10^-200)*10^-200', '0'],
  // 除以零保留自己的码。
  ['=1/0', '#DIV/0!'],
  ['=0/0', '#DIV/0!'],
  // 上界本身允许（MS: "Largest allowed positive number via formula:
  // 1.7976931348623158e+308"），闸门不能提前一格。
  ['=10^308*1', '1E+308'],
]

export const OVERFLOW_ADDRS = OVERFLOW_CASES.map((_, i) => a1(i, 33))
export const EXPECTED_OVERFLOW_DISPLAYS = OVERFLOW_CASES.map(([, displayed]) => displayed)

/** 列 AH —— 每行一条公式，无外部夹具依赖。 */
export const OVERFLOW_WORKLOAD: WorkloadCell[] = OVERFLOW_CASES.map(
  ([formula], row): WorkloadCell => ({ row, col: 33, kind: 'formula', value: formula }),
)
