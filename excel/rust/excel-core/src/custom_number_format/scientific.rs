//! 自定义代码里的 `E+`/`E-`：尾数整数位数由整数占位决定，`##0.0E+0` 一类按工程记数取 3 的倍数。
use super::number::round_half_away;

pub(super) struct Scientific {
    pub mantissa: f64,
    pub exponent: i32,
}

/// `value` 已是非负数；尾数先按小数位舍入，进位溢出时指数再上调一次。
pub(super) fn split(value: f64, int_slots: usize, engineering: bool, frac: usize) -> Scientific {
    if value == 0.0 || !value.is_finite() {
        return Scientific { mantissa: 0.0, exponent: 0 };
    }
    let slots = int_slots.max(1) as i32;
    let (lead, step) = if engineering { (1, slots) } else { (slots, 1) };
    let magnitude = value.log10().floor() as i32;
    let mut exponent = (magnitude - (lead - 1)).div_euclid(step) * step;
    let limit = 10f64.powi(if engineering { step } else { lead });
    let mut mantissa = round_half_away(value / 10f64.powi(exponent), frac);
    if mantissa >= limit {
        exponent += step;
        mantissa = round_half_away(value / 10f64.powi(exponent), frac);
    }
    Scientific { mantissa, exponent }
}

/// `E+` 正指数也写 `+`，`E-` 只给负指数写 `-`；位数至少为指数里的 `0` 个数。
pub(super) fn exponent_text(exponent: i32, plus: bool, zeros: usize) -> String {
    let sign = if exponent < 0 { "-" } else if plus { "+" } else { "" };
    format!("E{sign}{:0width$}", exponent.unsigned_abs(), width = zeros.max(1))
}
