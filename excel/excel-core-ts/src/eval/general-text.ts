/**
 * Excel「General」格式下 **数字 → 文本** 的单点实现（TS 侧）。
 *
 * Rust 孪生实现是 `excel/rust/excel-core/src/general_text.rs`，**规格的完整说明
 * 与依据写在那份模块文档里**，这里不复述以免两处漂移。改动任意一侧都必须同步
 * 另一侧，跨引擎钉子在
 * `excel/solid-excel/test/cross-engine-parity-cases.ts` 的 `GENERAL_TEXT_CASES`。
 *
 * 摘要（细节见 Rust 侧文档）：
 * - 最多 **15 位有效数字**，收位 **half-up**；`|指数| > 98` 时降到 14 位。
 * - **大数**：十进制指数 **> 19** 才转科学计数（`1e19` 是
 *   `'10000000000000000000'`，`1e20` 才是 `'1E+20'`）。
 * - **小数**：普通写法（`'0.'` + 前导零 + 有效数字）**超过 20 字符**才转科学计数
 *   （`1e-7` 是 `'0.0000001'`，`1e-19` 才是 `'1E-19'`）。
 * - 指数大写 `E`、带符号、至少两位；尾随零先剪再计位数（`0.1 + 0.2` → `'0.3'`）。
 *
 * 这条规格被 `&` 拼接、`LEN`、`T`、`CONCAT` 共用，所以只能有一份：`coerce.ts`
 * 的 `toString` 是本包里唯一的调用点。
 *
 * 起点是 `toExponential()`（无参数 = 最短往返表示，与 Rust `{:e}` 逐字节相同）
 * 而不是 `toExponential(14)`：后者的定点舍入在 Rust 是 half-even、在 JS 是
 * half-up，恰好压在第 16 位平局上的值（如 `1234567890123445`）会分叉成两个答案。
 */

/** 普通写法的字符预算：超了才退到科学计数。 */
const MAX_TEXT_LEN = 20
/** Excel 的有效数字上限。 */
const MAX_SIG_DIGITS = 15
/** 三位指数时的有效数字上限 —— 让 `1.2345678901235E+100` 仍是 20 字符。 */
const WIDE_EXPONENT_SIG_DIGITS = 14
/** 超过它就算「三位指数」。 */
const WIDE_EXPONENT_THRESHOLD = 98
/** 十进制指数大于它的数走科学计数。 */
const PLAIN_EXPONENT_LIMIT = 19

interface Decimal {
  /** 定长有效数字串，无小数点。 */
  readonly digits: string
  /** 十进制指数：`value === d0.d1d2… × 10 ** exp`。 */
  readonly exp: number
}

/**
 * 把 `number` 渲染成 Excel「General」转文本规格下的字符串。
 *
 * 非有限值不是 Excel 能持有的单元格数值（它先报 `#NUM!`），这里只做一个与 Rust
 * 侧一致的兜底，免得两个引擎各说各话。
 */
export function excelGeneralToText(n: number): string {
  if (Number.isNaN(n)) return 'NaN'
  if (!Number.isFinite(n)) return n < 0 ? '-Infinity' : 'Infinity'
  // `-0 === 0`，所以负零也走这里 —— Excel 的负零显示为 `0`。
  if (n === 0) return '0'

  const negative = n < 0
  let d = roundSignificant(shortestDigits(Math.abs(n)), MAX_SIG_DIGITS)
  if (Math.abs(d.exp) > WIDE_EXPONENT_THRESHOLD) {
    d = roundSignificant(d, WIDE_EXPONENT_SIG_DIGITS)
  }
  const sig = countSignificant(d.digits)
  const body = d.exp < 0 ? lessThanOne(d, sig) : greaterThanOne(d, sig)
  return negative ? `-${body}` : body
}

/**
 * 拆出最短往返表示的数字串与十进制指数。无参数的 `toExponential()` 给的正是
 * 「唯一确定该值所需的最少位数」，形如 `'1.2345e+17'` / `'5e-1'`。
 */
function shortestDigits(x: number): Decimal {
  const rendered = x.toExponential()
  const at = rendered.indexOf('e')
  return {
    digits: rendered.slice(0, at).replace('.', ''),
    // `Number` 认得 `'+17'`，`'-7'` 也认得。
    exp: Number(rendered.slice(at + 1)),
  }
}

/**
 * half-up 收到 `target` 位有效数字；不足则补零（补零不改变数值，只是让后面的
 * 切片能按定长下标取数）。进位溢出时指数加一。
 */
function roundSignificant({ digits, exp }: Decimal, target: number): Decimal {
  if (digits.length <= target) return { digits: digits.padEnd(target, '0'), exp }
  // 只看第一位被丢掉的数字即可实现 half-up：>= 5 一律进位，< 5 一律舍去。
  const kept = digits.slice(0, target).split('')
  if (digits.charCodeAt(target) < 0x35) return { digits: kept.join(''), exp }
  for (let i = target - 1; i >= 0; i -= 1) {
    if (kept[i] === '9') {
      kept[i] = '0'
      continue
    }
    kept[i] = String.fromCharCode(kept[i].charCodeAt(0) + 1)
    return { digits: kept.join(''), exp }
  }
  // 全 9 进位：`999…9` → `100…0`，数量级抬一位。
  return { digits: '1'.padEnd(target, '0'), exp: exp + 1 }
}

/** 剪掉尾随零后的有效位数（至少 1 —— 零值已在入口挡掉）。 */
function countSignificant(digits: string): number {
  return Math.max(digits.replace(/0+$/, '').length, 1)
}

/** `|value| < 1`：普通写法塞得进 20 字符就写普通写法。 */
function lessThanOne({ digits, exp }: Decimal, sig: number): string {
  const leadingZeros = -exp - 1
  // `'0.'` 占 2 个字符，再加前导零与有效数字。
  if (2 + leadingZeros + sig > MAX_TEXT_LEN) return scientific(digits, sig, '-', -exp)
  return `0.${'0'.repeat(leadingZeros)}${digits.slice(0, sig)}`
}

/** `|value| >= 1`：只看指数，不看长度 —— 这是 Excel 两侧门槛不对称的地方。 */
function greaterThanOne({ digits, exp }: Decimal, sig: number): string {
  if (exp > PLAIN_EXPONENT_LIMIT) return scientific(digits, sig, '+', exp)
  const intDigits = exp + 1
  if (sig > intDigits) return `${digits.slice(0, intDigits)}.${digits.slice(intDigits, sig)}`
  return digits.slice(0, sig) + '0'.repeat(intDigits - sig)
}

/** `d[.ddd]E±NN` —— 指数带符号且至少两位。 */
function scientific(digits: string, sig: number, sign: '+' | '-', expAbs: number): string {
  const mantissa = sig > 1 ? `${digits[0]}.${digits.slice(1, sig)}` : digits[0]
  return `${mantissa}E${sign}${String(expAbs).padStart(2, '0')}`
}
