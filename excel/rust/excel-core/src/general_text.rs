//! Excel「General」格式下 **数字 → 文本** 的单点实现。
//!
//! 这条规格被 `&` 拼接、`LEN`、`T`、`CONCAT`、`EXACT` 等一切把数字读成文本的
//! 路径共用，所以它只能有一份：`eval::coerce_to_text` 是本 crate 里唯一的调用
//! 点，TS 参考引擎的孪生实现是
//! `excel/excel-core-ts/src/eval/general-text.ts`，两侧必须逐字节同判。
//!
//! # 这是 Excel 的哪一套规则
//!
//! Excel 对同一个 f64 有四套互不相同的规则：转文本、在网格里渲染、从文本解析、
//! 算术。这里实现的是**第一套** —— `=A1&""` / `=LEN(A1)` 看到的文本，不受列宽
//! 影响。网格渲染那套在 `format::value_to_display`（列宽会让它更早退到科学计数
//! 甚至 `####`），是**另一条路**，本文件不碰它。两者今天的差异是已知的、单列
//! 的待办，别把它们合并成一个函数。
//!
//! 规格按 Apache POI `NumberToTextConverter` 反推的 Excel 行为实现 —— POI 的
//! `NumberToTextConversionExamples` 是从 Excel 里实测抄回来的对照表，本仓
//! `tests/general_text_parity.rs` 把其中的关键行原样钉住：
//!
//! - 最多保留 **15 位有效数字**，收位用 **half-up**（不是浮点格式化默认的
//!   half-even —— 见下一节）。
//! - 十进制指数 `|exp| > 98` 时降到 **14 位**，好让整串仍塞得进 20 字符。
//! - **大数**：指数 **> 19** 才走科学计数。所以 `1e19` 是
//!   `"10000000000000000000"`（20 字符），`1e20` 才是 `"1E+20"`。
//! - **小数**：只有普通写法（`"0."` + 前导零 + 有效数字）**超过 20 字符**时才走
//!   科学计数。所以 `1e-7` 是 `"0.0000001"`，`1e-19` 才是 `"1E-19"`。
//! - 指数一律大写 `E`、带符号、**至少两位**：`E-07`、`E+21`、`E+100`。
//! - 尾随零先剪掉再计位数，所以 `=0.5&""` 是 `"0.5"`，`=(0.1+0.2)&""` 是
//!   `"0.3"` 而不是 `"0.30000000000000004"`。
//!
//! # 为什么从「最短往返表示」起步
//!
//! Rust 的 `{:e}` 与 JS 的 `Number.prototype.toExponential()` 都输出**最短且能
//! 往返**的十进制串 —— 这个串在数学上唯一，两侧逐字节相同（已逐值核对）。若改
//! 用 `{:.14e}` / `toExponential(14)` 一步取 15 位，两个语言的定点舍入规则不同
//! （Rust half-even，JS half-up），`12345678901234.5` 这类恰好落在第 16 位平局
//! 上的值就会分叉成两个答案。先拿同一个数字串、再用本文件自己的 half-up 收位，
//! 「两侧同判」就是构造出来的，不是靠运气。
//!
//! 代价：最短表示最多 17 位，从 17 位收到 15 位是二次舍入，理论上可能与「从精确
//! 值直接收到 15 位」差一个末位。要触发它，精确十进制展开必须长过 17 位**且**第
//! 16、17 位恰好压在边界上；能真正命中平局的那批值（16 位整数、`x.5`）的精确展开
//! 本来就不超过 17 位，走的是无损路径。

/// 普通写法的字符预算：超了才退到科学计数（Excel 的缓冲区宽度）。
const MAX_TEXT_LEN: usize = 20;
/// Excel 的有效数字上限。
const MAX_SIG_DIGITS: usize = 15;
/// 三位指数时的有效数字上限 —— 让 `1.2345678901235E+100` 仍是 20 字符。
const WIDE_EXPONENT_SIG_DIGITS: usize = 14;
/// 超过它就算「三位指数」。
const WIDE_EXPONENT_THRESHOLD: i32 = 98;
/// 十进制指数大于它的数走科学计数。
const PLAIN_EXPONENT_LIMIT: i32 = 19;

/// 把 f64 渲染成 Excel「General」转文本规格下的字符串。
///
/// 非有限值不是 Excel 能持有的单元格数值（它先报 `#NUM!`），这里只做一个两侧
/// 一致的兜底，免得 Rust 的 `"inf"` 和 JS 的 `"Infinity"` 各说各话。
pub fn excel_general_to_text(n: f64) -> String {
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n < 0.0 { "-Infinity" } else { "Infinity" }.to_string();
    }
    // `-0.0 == 0.0`，所以负零也走这里 —— Excel 的负零显示为 `0`。
    if n == 0.0 {
        return "0".to_string();
    }

    let negative = n < 0.0;
    let (digits, exp) = shortest_digits(n.abs());
    let (digits, exp) = round_significant(&digits, exp, MAX_SIG_DIGITS);
    let (digits, exp) = if exp.abs() > WIDE_EXPONENT_THRESHOLD {
        round_significant(&digits, exp, WIDE_EXPONENT_SIG_DIGITS)
    } else {
        (digits, exp)
    };
    let sig = count_significant(&digits);

    let mut out = String::with_capacity(MAX_TEXT_LEN + 2);
    if negative {
        out.push('-');
    }
    if exp < 0 {
        push_less_than_one(&mut out, &digits, exp, sig);
    } else {
        push_greater_than_one(&mut out, &digits, exp, sig);
    }
    out
}

/// 拆出最短往返表示的数字串与十进制指数：返回 `(digits, exp)`，
/// 满足 `value == 0.d0 d1 … × 10^(exp + 1)`，即 `d0.d1d2… × 10^exp`。
fn shortest_digits(x: f64) -> (String, i32) {
    // `{:e}` 无精度参数时给的就是最短往返表示，形如 `1.2345e17` / `5e-1`。
    let rendered = format!("{x:e}");
    let (mantissa, exponent) = rendered
        .split_once('e')
        .expect("LowerExp for f64 always emits an 'e' separator");
    let exp = exponent
        .parse::<i32>()
        .expect("LowerExp for f64 always emits a decimal exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    (digits, exp)
}

/// half-up 收到 `target` 位有效数字；不足则补零（补零不改变数值，只是让后面的
/// 切片逻辑能按定长下标取数）。进位溢出时指数加一。
fn round_significant(digits: &str, exp: i32, target: usize) -> (String, i32) {
    if digits.len() <= target {
        let mut padded = String::from(digits);
        while padded.len() < target {
            padded.push('0');
        }
        return (padded, exp);
    }
    // 只看第一位被丢掉的数字即可实现 half-up：>= 5 一律进位，< 5 一律舍去。
    let round_up = digits.as_bytes()[target] >= b'5';
    let mut kept = digits.as_bytes()[..target].to_vec();
    if !round_up {
        return (String::from_utf8(kept).expect("ASCII digits"), exp);
    }
    let mut i = target;
    loop {
        if i == 0 {
            // 全 9 进位：`999…9` → `100…0`，数量级抬一位。
            kept.insert(0, b'1');
            kept.truncate(target);
            return (String::from_utf8(kept).expect("ASCII digits"), exp + 1);
        }
        i -= 1;
        if kept[i] == b'9' {
            kept[i] = b'0';
        } else {
            kept[i] += 1;
            break;
        }
    }
    (String::from_utf8(kept).expect("ASCII digits"), exp)
}

/// 剪掉尾随零后的有效位数（至少 1 —— 零值已在入口挡掉）。
fn count_significant(digits: &str) -> usize {
    let trimmed = digits.trim_end_matches('0');
    trimmed.len().max(1)
}

/// `|value| < 1`：普通写法塞得进 20 字符就写普通写法。
fn push_less_than_one(out: &mut String, digits: &str, exp: i32, sig: usize) {
    let leading_zeros = (-exp - 1) as usize;
    // `"0."` 占 2 个字符，再加前导零与有效数字。
    if 2 + leading_zeros + sig > MAX_TEXT_LEN {
        push_scientific(out, digits, sig, '-', -exp);
        return;
    }
    out.push_str("0.");
    for _ in 0..leading_zeros {
        out.push('0');
    }
    out.push_str(&digits[..sig]);
}

/// `|value| >= 1`：只看指数，不看长度 —— 这是 Excel 两侧门槛不对称的地方。
fn push_greater_than_one(out: &mut String, digits: &str, exp: i32, sig: usize) {
    if exp > PLAIN_EXPONENT_LIMIT {
        push_scientific(out, digits, sig, '+', exp);
        return;
    }
    let int_digits = exp as usize + 1;
    if sig > int_digits {
        out.push_str(&digits[..int_digits]);
        out.push('.');
        out.push_str(&digits[int_digits..sig]);
        return;
    }
    out.push_str(&digits[..sig]);
    for _ in 0..(int_digits - sig) {
        out.push('0');
    }
}

/// `d[.ddd]E±NN` —— 指数带符号且至少两位。
fn push_scientific(out: &mut String, digits: &str, sig: usize, sign: char, exp_abs: i32) {
    out.push_str(&digits[..1]);
    if sig > 1 {
        out.push('.');
        out.push_str(&digits[1..sig]);
    }
    out.push('E');
    out.push(sign);
    if exp_abs < 10 {
        out.push('0');
    }
    out.push_str(&exp_abs.to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 形状层面的自检；与 Excel 实测值的对照表在
    /// `tests/general_text_parity.rs`，那张表才是预言机。
    #[test]
    fn shapes() {
        assert_eq!(excel_general_to_text(0.0), "0");
        assert_eq!(excel_general_to_text(-0.0), "0");
        assert_eq!(excel_general_to_text(1.0), "1");
        assert_eq!(excel_general_to_text(-1.0), "-1");
        assert_eq!(excel_general_to_text(0.5), "0.5");
        assert_eq!(excel_general_to_text(-0.5), "-0.5");
        assert_eq!(excel_general_to_text(1234.5), "1234.5");
    }

    /// 全 9 进位必须把数量级抬上去，而不是留下 `10.000…`。
    #[test]
    fn carry_lifts_the_exponent() {
        assert_eq!(excel_general_to_text(0.9999999999999999), "1");
        assert_eq!(excel_general_to_text(9.999999999999999e20), "1E+21");
    }

    /// 第 16 位恰好是「5 且后面没有了」的精确平局。half-up 是刻意的：
    /// Rust 的 `{:.14e}` 按 half-even 会收成 `1234567890123440`，JS 的
    /// `toExponential(14)` 按 half-up 收成 `…450` —— 那正是两个引擎分叉的口子，
    /// 也是本文件不走定点格式化、自己收位的原因。
    #[test]
    fn exact_tie_rounds_half_up() {
        assert_eq!(excel_general_to_text(1234567890123445.0), "1234567890123450");
    }

    /// 15 位有效数字但 16 个字符：小数点不占有效位，整数部分也不该被截断。
    #[test]
    fn fifteen_digits_keep_their_fraction() {
        assert_eq!(excel_general_to_text(12345678901234.5), "12345678901234.5");
    }
}
