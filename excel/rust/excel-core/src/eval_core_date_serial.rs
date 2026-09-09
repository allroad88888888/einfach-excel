use super::*;
use crate::date_serial::{
    excel_date_parts_to_serial, excel_serial_to_date_parts, valid_date_serial, ExcelDateParts,
};

/// 内部年月日转换不套用 DATE 函数的短年份规则；非法日期返回 NaN。
pub(super) fn date_serial(year: i32, month: u32, day: u32) -> f64 {
    excel_date_parts_to_serial(ExcelDateParts {
        year,
        month,
        day,
        fraction: 0.0,
    })
    .unwrap_or(f64::NAN)
}

/// 调用方负责输入错误；无效值使用不可表示的日期哨兵，不迭代年份或溢出。
pub(super) fn date_from_serial(serial: f64) -> (i32, u32, u32) {
    excel_serial_to_date_parts(serial)
        .map(|p| (p.year, p.month, p.day))
        .unwrap_or((0, 0, 0))
}

/// DATE 接受月／日溢出，但结果必须仍在工作簿的 1900 日期系统范围内。
pub(super) fn date_formula_serial(year: f64, month: f64, day: f64) -> Option<f64> {
    if !year.is_finite()
        || !month.is_finite()
        || !day.is_finite()
        || !(0.0..10000.0).contains(&year)
        || month.abs() > 120_000.0
        || day.abs() > 4_000_000.0
    {
        return None;
    }
    let year = year.trunc() as i64;
    let year = if year < 1900 { year + 1900 } else { year };
    let total_months = year * 12 + month.trunc() as i64 - 1;
    let year = i32::try_from(total_months.div_euclid(12)).ok()?;
    let month = (total_months.rem_euclid(12) + 1) as u32;
    let serial = date_serial(year, month, 1) + day.trunc() - 1.0;
    valid_date_serial(serial).then_some(serial)
}

pub(super) fn date_part(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(i32, u32, u32) -> f64,
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(error) = v {
        return Value::Error(error);
    }
    match coerce_to_number(&v) {
        Some(n) if valid_date_serial(n) => {
            let (y, m, d) = date_from_serial(n);
            Value::Number(f(y, m, d))
        }
        Some(_) => Value::Error(ValueError::Overflow),
        None => Value::Error(ValueError::WrongType),
    }
}
