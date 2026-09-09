//! Excel 1900 日期序号的唯一换算处；不依赖系统时区，不逐年遍历。
use chrono::{Datelike, Duration, NaiveDate};

/// 9999-12-31；当天的小数部分仍表示时间。
pub(crate) const MAX_DATE_SERIAL: f64 = 2_958_465.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ExcelDateParts {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub fraction: f64,
}

pub(crate) fn days_in_excel_month(year: i32, month: u32) -> Option<u32> {
    if year == 1900 && month == 2 {
        return Some(29);
    }
    let (next_year, next_month) = if month == 12 {
        (year.checked_add(1)?, 1)
    } else {
        (year, month.checked_add(1)?)
    };
    let first = NaiveDate::from_ymd_opt(year, month, 1)?;
    let next = NaiveDate::from_ymd_opt(next_year, next_month, 1)?;
    Some((next - first).num_days() as u32)
}

/// 引擎内部允许有界的负序号，供日期偏移使用；产品输入另校验 0..=9999 年。
pub(crate) fn excel_serial_to_date_parts(serial: f64) -> Option<ExcelDateParts> {
    if !serial.is_finite() || serial.floor() < i64::MIN as f64 || serial.floor() >= i64::MAX as f64
    {
        return None;
    }
    let whole = serial.floor() as i64;
    let fraction = serial - whole as f64;
    // Excel 保留 1900-02-29；零序号显示为 1900-01-00。
    if whole == 0 || whole == 60 {
        return Some(ExcelDateParts {
            year: 1900,
            month: if whole == 0 { 1 } else { 2 },
            day: if whole == 0 { 0 } else { 29 },
            fraction,
        });
    }
    let adjusted = if whole > 60 { whole - 1 } else { whole };
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 31)?;
    let date = epoch.checked_add_signed(Duration::try_days(adjusted)?)?;
    Some(ExcelDateParts {
        year: date.year(),
        month: date.month(),
        day: date.day(),
        fraction,
    })
}

pub(crate) fn excel_date_parts_to_serial(parts: ExcelDateParts) -> Option<f64> {
    if !parts.fraction.is_finite() || !(0.0..1.0).contains(&parts.fraction) {
        return None;
    }
    if (parts.year, parts.month, parts.day) == (1900, 1, 0) {
        return Some(parts.fraction);
    }
    if parts.day == 0 || parts.day > days_in_excel_month(parts.year, parts.month)? {
        return None;
    }
    if (parts.year, parts.month, parts.day) == (1900, 2, 29) {
        return Some(60.0 + parts.fraction);
    }
    let date = NaiveDate::from_ymd_opt(parts.year, parts.month, parts.day)?;
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 31)?;
    let days = date.signed_duration_since(epoch).num_days();
    Some(days as f64 + if days >= 60 { 1.0 } else { 0.0 } + parts.fraction)
}

pub(crate) fn valid_date_serial(serial: f64) -> bool {
    serial.is_finite() && (0.0..MAX_DATE_SERIAL + 1.0).contains(&serial)
}

/// Sunday=0；与 Excel WEEKDAY 一样保留 1900 年前两个月的历史偏移。
pub(crate) fn weekday_sunday_indexed(serial: i64) -> i64 {
    (serial.rem_euclid(7) + 6) % 7
}

/// 只识别无歧义的四位年在前日期，拒绝把 02/03 等猜成某个地区格式。
pub(crate) fn parse_iso_date(input: &str) -> Option<f64> {
    let separator = if input.contains('-') { '-' } else { '/' };
    let parts: Vec<_> = input.split(separator).collect();
    if parts.len() != 3
        || parts[0].len() != 4
        || parts[1].is_empty()
        || parts[1].len() > 2
        || parts[2].is_empty()
        || parts[2].len() > 2
        || parts
            .iter()
            .any(|part| !part.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    let year = parts[0].parse().ok()?;
    let month = parts[1].parse().ok()?;
    let day = parts[2].parse().ok()?;
    if !(1900..=9999).contains(&year) || day == 0 {
        return None;
    }
    excel_date_parts_to_serial(ExcelDateParts {
        year,
        month,
        day,
        fraction: 0.0,
    })
}
