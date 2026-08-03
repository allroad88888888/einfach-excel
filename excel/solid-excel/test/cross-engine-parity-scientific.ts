/**
 * 第九类分歧：**科学计数字面量的词法边界**。
 *
 * 单列一份文件而不是堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300 行
 * 上限，而这一类离不开「`E2` 什么时候是指数、什么时候是格子」这段说明。与
 * `-general-text.ts` / `-criteria-*.ts` / `-overflow.ts` 同一个先例。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * `=1E2` 在 Rust 引擎上长期是 `#VALUE!` —— 它的词法层把这串读成「数字 `1`」
 * 后面跟着「单元格引用 `E2`」，两个记号之间没有运算符，整式解析失败。TS 参考
 * 引擎与 Excel 都给 `100`。所以这一类**从来不是「两侧一起错」**，而是一侧对
 * 一侧错；但「两侧相等」这条断言在修好之后会永远为真，证明不了它们没有一起
 * 退回去。字面量断言才拦得住。
 *
 * # 消歧规则
 *
 * `E2` 既是合法的指数部分、也是合法的单元格引用（E 列第 2 行）。切法照
 * `excel/excel-core-ts/src/parser/tokenizer.ts` 的 `readNumber` —— 尾数之后
 * 只有满足 `[eE] [+-]? digit+`（**至少一位**指数数字）才把指数吞进来，且是
 * **贪婪**的：不回头考虑「当成引用是不是更讲得通」。
 *
 * 下面每一条「吞」都配了一条方向相反的「不吞」：
 *
 * - `=1E2` → `100`，而 `=1+E2` → 读 E2 格。隔着运算符，指数扫描轮不到它。
 * - `=1E2+E2` → 同一条式子里两个 `E2`，前一个进指数、后一个是格子。**这条是
 *   全表最强的一根钉**：任何「一律当指数」或「一律当引用」的实现都过不去。
 * - `=E2` / `=SUM(E2:E5)` → 引用侧完全不受影响。
 *
 * 夹具在 E 列：`E2 = 7`、`E5 = 9`。两种切法给的数不同，答案本身就是证据。
 *
 * # 这里为什么没有「必须解析失败」的那一半
 *
 * `=1E` / `=1E$2` / `=1E2E2` / `=1E2:E5` / `=0x10` / `=2E308` 在两个引擎上都
 * 是 `#VALUE!`，也是这条规则的边界；但它们在 Rust 侧是**解析失败**，而 bulk
 * 导入路径的驱动断言 `rejectedFormulas === 0` / `formulasInstalled ===
 * formulas.length` —— 一条解析器拒收的公式按构造就装不进这张表。它们钉在
 * `excel/rust/excel-core/tests/scientific_notation.rs`（Rust 侧端到端）与
 * TS 侧 tokenizer 的既有单测里，不在本表。
 *
 * # 依据
 *
 * - TS 参考引擎实测：`=1E2` → `100`、`=1e2` → `100`、`=1E-2` → `0.01`、
 *   `=1E2+E2` → `107`（E2=7）、`=1E308` → `1E+308`。
 * - Microsoft，"Excel specifications and limits"：公式可用的最大正数是
 *   `1.7976931348623158e+308` —— 所以 `=1E308` 必须是个数而不是错误，闸门
 *   不能提前一格。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/** E 列夹具：`E2 = 7`、`E5 = 9`。 */
const E_COLUMN: WorkloadCell[] = [
  { row: 1, col: 4, kind: 'number', value: 7 }, // E2
  { row: 4, col: 4, kind: 'number', value: 9 }, // E5
]

/** Excel 的答案。列 AI。 */
export const SCIENTIFIC_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  // --- 吞：`E<digits>` 是指数 ---
  ['=1E2', '100'],
  ['=1e2', '100'], // 大小写同一个记号
  ['=1E+2', '100'],
  ['=1E-2', '0.01'],
  ['=1.5E3', '1500'],
  ['=.5E2', '50'], // 尾数可以省掉整数部分
  ['=1E0', '1'], // 零指数
  ['=1E2%', '1'], // 后缀 `%` 作用在整个字面量上
  ['=SUM(1E2,1)', '101'], // 实参位置
  ['=1E308', '1E+308'], // 上界本身允许
  // --- 不吞：`E2` 还是 E 列第 2 行 ---
  ['=E2', '7'],
  ['=1+E2', '8'], // 隔着运算符
  ['=SUM(E2:E5)', '16'], // 真区间不受影响
  // --- 两者同框：全表最强的一根钉 ---
  ['=1E2+E2', '107'],
]

export const SCIENTIFIC_ADDRS = SCIENTIFIC_CASES.map((_, i) => a1(i, 34))
export const EXPECTED_SCIENTIFIC_DISPLAYS = SCIENTIFIC_CASES.map(([, displayed]) => displayed)

/** 列 AI 每行一条公式，外加 E 列的两格夹具。 */
export const SCIENTIFIC_WORKLOAD: WorkloadCell[] = [
  ...E_COLUMN,
  ...SCIENTIFIC_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 34, kind: 'formula', value: formula }),
  ),
]
