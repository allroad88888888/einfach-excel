/**
 * 第七类分歧：**Excel「General」把数字读成文本的规格**。
 *
 * 单列一份文件而不是继续堆进 `cross-engine-parity-cases.ts`：那份已经贴着 300
 * 行上限，而这一类的期望值离不开「门槛在哪」的说明 —— 说明比数据长，塞回去只会
 * 把两件事挤在一个文件里。这里就一件事：General 转文本这一类的夹具、地址、闭式
 * 期望值。
 *
 * # 为什么这一类必须跨引擎钉
 *
 * 两个引擎都没实现过这条规格，各自用了宿主语言的默认写法：TS 是 `String(n)`
 * （给出 `'1e+21'` / `'1e-7'` —— 小写 `e`、指数不补零，Excel 里根本不存在这种
 * 写法），Rust 是 `Display`（给出 `'1000000000000000000000'` —— 22 位十进制数字
 * 铺开写，而 Excel 在这个量级上只用科学计数）。两边都错，且**错得不一样**，
 * 所以任何「两侧相等」的断言都抓不到它。下表一律写 Excel 的字面量答案。
 *
 * 规格与依据见 `excel/rust/excel-core/src/general_text.rs` 的模块文档；实现是
 * 两侧各一个单点函数（Rust `excel_general_to_text` / TS `excelGeneralToText`），
 * 由各自的转换入口调用。
 *
 * # 为什么每一行都是 `&""` 或 `LEN(...)`
 *
 * 本次只改了**公式侧**的转换（Rust `eval::coerce_to_text`、TS `coerce.toString`）。
 * **显示层是另一条路**且还没改（Rust `format::value_to_display`、TS 侧的显示
 * 分支），所以一个直接算出大数的公式，其单元格显示仍然走旧逻辑。用 `&""` 把结果
 * 变成字符串、或用 `LEN` 把它变成小整数，显示层就只是原样透传，这张表量到的才是
 * 转换规格本身。等显示层收口后，这里可以再加一批裸数字的行。
 */
import { a1, type WorkloadCell } from './cross-engine-parity-engines'

/** Excel 的答案，一行一个门槛。列 Z。 */
export const GENERAL_TEXT_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  // 大数门槛：十进制指数 **> 19** 才转科学计数。前两行是门槛两侧的相邻格，
  // 第三行正好 20 字符 —— 它证明门槛不在「15 位有效数字」也不在「16 位整数」。
  ['=10^19&""', '10000000000000000000'],
  ['=10^20&""', '1E+20'],
  ['=10^21&""', '1E+21'],
  // 小数门槛：普通写法（`0.` + 前导零 + 有效数字）**超过 20 字符**才转科学计数。
  // `1e-7` 留在普通写法上，是这一程里被猜错过的那格。
  ['=10^-7&""', '0.0000001'],
  ['=10^-18&""', '0.000000000000000001'],
  ['=10^-19&""', '1E-19'],
  // 15 位有效数字是硬上限：多出来的位收掉补零，不是原样吐 f64 的全部十进制位。
  ['=123456789012345678&""', '123456789012346000'],
  ['=LEN(123456789012345678)', '18'],
  // 收位顺带抹掉二进制噪声 —— Excel 用户看到的是 `0.3`。
  ['=(0.1+0.2)&""', '0.3'],
  // 尾随零先剪再计位数；负号不占有效数字预算。
  ['=0.5&""', '0.5'],
  ['=(-1/3)&""', '-0.333333333333333'],
  // 指数一律大写 `E`、带符号、至少两位 —— `E-07` 不是 `E-7`。
  ['=(1.5*10^-20)&""', '1.5E-20'],
]

export const GENERAL_TEXT_ADDRS = GENERAL_TEXT_CASES.map((_, i) => a1(i, 25))
export const EXPECTED_GENERAL_TEXT_DISPLAYS = GENERAL_TEXT_CASES.map(([, displayed]) => displayed)

/** 列 Z —— 每行一条公式，无外部夹具依赖。 */
export const GENERAL_TEXT_WORKLOAD: WorkloadCell[] = GENERAL_TEXT_CASES.map(
  ([formula], row): WorkloadCell => ({ row, col: 25, kind: 'formula', value: formula }),
)
