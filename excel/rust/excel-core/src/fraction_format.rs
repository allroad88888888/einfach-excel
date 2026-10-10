//! 带分数显示：指定最大分母精度，或固定分母；不改变原始浮点值。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum FractionDenominator {
    #[default]
    OneDigit,
    TwoDigit,
    ThreeDigit,
    Fixed(u32),
}

pub(crate) fn format_fraction(number: f64, denominator: FractionDenominator) -> String {
    if !number.is_finite() {
        return "#####".into();
    }
    let mut whole = number.abs().floor();
    let fraction = number.abs() - whole;
    let (mut numerator, divisor) = match denominator {
        FractionDenominator::Fixed(0) => return "#####".into(),
        FractionDenominator::Fixed(divisor) => {
            ((fraction * f64::from(divisor)).round() as u32, divisor)
        }
        _ => {
            let max = match denominator {
                FractionDenominator::OneDigit => 9,
                FractionDenominator::TwoDigit => 99,
                _ => 999,
            };
            let mut best = (0, 1);
            let mut error = fraction;
            // 至多 999 个候选，常见精确分数提前退出；相同误差取较小分母。
            for divisor in 1..=max {
                let numerator = (fraction * f64::from(divisor)).round() as u32;
                let distance = (fraction - f64::from(numerator) / f64::from(divisor)).abs();
                if distance < error {
                    best = (numerator, divisor);
                    error = distance;
                }
                if error == 0.0 {
                    break;
                }
            }
            best
        }
    };
    if numerator == divisor {
        whole += 1.0;
        numerator = 0;
    }
    let sign = if number < 0.0 && (whole != 0.0 || numerator != 0) {
        "-"
    } else {
        ""
    };
    if numerator == 0 {
        format!("{sign}{whole:.0}")
    } else if whole == 0.0 {
        format!("{sign}{numerator}/{divisor}")
    } else {
        format!("{sign}{whole:.0} {numerator}/{divisor}")
    }
}
