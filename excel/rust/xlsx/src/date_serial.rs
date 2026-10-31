//! Excel 1900 日期系统的序列号与 `YYYY-MM-DD` / `HH:MM[:SS]` 文本互转（数据验证边界用）。
//! 序列号 60 是 Excel 虚构的 1900-02-29，不可表示；与引擎 `parse_iso_date` 一致只收 1900 年起的日期。

const MAX_SERIAL: i64 = 2_958_465; // 9999-12-31

/// 公历日期 → 自 1970-01-01 起的天数（Howard Hinnant 的 days_from_civil）。
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// 1899-12-30 的天数偏移：序列号 61 以后与真实日历一一对应。
const EPOCH_1899_12_30: i64 = -25_569;

pub fn serial_to_iso(serial: f64) -> Option<String> {
    if !serial.is_finite() || serial.fract() != 0.0 {
        return None;
    }
    let serial = serial as i64;
    let days = match serial {
        1..=59 => serial + EPOCH_1899_12_30 + 1, // 1900-01-01 .. 1900-02-28
        61..=MAX_SERIAL => serial + EPOCH_1899_12_30,
        _ => return None,
    };
    let (y, m, d) = civil_from_days(days);
    Some(format!("{y:04}-{m:02}-{d:02}"))
}

pub fn iso_to_serial(text: &str) -> Option<f64> {
    let separator = if text.contains('-') { '-' } else { '/' };
    let parts: Vec<i64> = text.split(separator).map(|p| p.parse().ok()).collect::<Option<_>>()?;
    let [y, m, d] = parts[..] else { return None };
    if !(1900..=9999).contains(&y) || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let days = days_from_civil(y, m, d);
    // 往返校验挡掉 2 月 30 日这类不存在的日期。
    if civil_from_days(days) != (y, m, d) {
        return None;
    }
    let serial = days - EPOCH_1899_12_30;
    match serial {
        61..=MAX_SERIAL => Some(serial as f64),
        2..=60 => Some((serial - 1) as f64),
        _ => None,
    }
}

/// 一天内的小数 → `HH:MM` 或 `HH:MM:SS`（整秒）。
pub fn fraction_to_clock(fraction: f64) -> Option<String> {
    if !(0.0..1.0).contains(&fraction) {
        return None;
    }
    let seconds = (fraction * 86_400.0).round() as i64;
    if seconds >= 86_400 {
        return None;
    }
    let (h, m, s) = (seconds / 3_600, seconds % 3_600 / 60, seconds % 60);
    Some(if s == 0 { format!("{h:02}:{m:02}") } else { format!("{h:02}:{m:02}:{s:02}") })
}

pub fn clock_to_fraction(text: &str) -> Option<f64> {
    let parts: Vec<f64> = text.trim().split(':').map(|p| p.parse().ok()).collect::<Option<_>>()?;
    let (h, m, s) = match parts[..] {
        [h, m] => (h, m, 0.0),
        [h, m, s] => (h, m, s),
        _ => return None,
    };
    let seconds = h * 3_600.0 + m * 60.0 + s;
    (h >= 0.0 && m >= 0.0 && s >= 0.0 && seconds < 86_400.0).then(|| seconds / 86_400.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_round_trip_around_the_1900_leap_bug() {
        assert_eq!(serial_to_iso(61.0).as_deref(), Some("1900-03-01"));
        assert_eq!(serial_to_iso(59.0).as_deref(), Some("1900-02-28"));
        assert_eq!(serial_to_iso(1.0).as_deref(), Some("1900-01-01"));
        assert_eq!(serial_to_iso(60.0), None);
        assert_eq!(serial_to_iso(46_023.0).as_deref(), Some("2026-01-01"));
        for serial in [1.0, 59.0, 61.0, 36_526.0, 46_023.0, 2_958_465.0] {
            assert_eq!(iso_to_serial(&serial_to_iso(serial).unwrap()), Some(serial));
        }
        assert_eq!(iso_to_serial("2026-02-30"), None);
        assert_eq!(iso_to_serial("1899-12-31"), None);
    }

    #[test]
    fn clock_round_trips() {
        assert_eq!(fraction_to_clock(0.354_166_666_666_666_7).as_deref(), Some("08:30"));
        assert_eq!(fraction_to_clock(0.5).as_deref(), Some("12:00"));
        assert_eq!(fraction_to_clock(0.999_999_9), None);
        assert!((clock_to_fraction("17:00").unwrap() - 17.0 / 24.0).abs() < 1e-12);
        assert_eq!(clock_to_fraction("24:00"), None);
    }
}
