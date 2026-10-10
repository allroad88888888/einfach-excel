//! 明确的时钟／累计时长输入；数值单位是天，不依赖地区或系统时区。
use crate::cell_input::CellInput;

pub(crate) fn parse_time(input: &str) -> Option<CellInput> {
    let (clock, half) = match input.rsplit_once(' ') {
        Some((clock, suffix))
            if suffix.eq_ignore_ascii_case("am") || suffix.eq_ignore_ascii_case("a") =>
        {
            (clock.trim_end_matches(' '), Some(false))
        }
        Some((clock, suffix))
            if suffix.eq_ignore_ascii_case("pm") || suffix.eq_ignore_ascii_case("p") =>
        {
            (clock.trim_end_matches(' '), Some(true))
        }
        _ => (input, None),
    };
    let mut parts = clock.split(':');
    let mut hour = digits(parts.next()?)?;
    let minute = parts.next();
    let second = parts.next();
    if parts.next().is_some() || (minute.is_none() && half.is_none()) {
        return None;
    }
    // 缺少分／秒代表零；存在但非法时必须保持文字，不能悄悄补零。
    let minutes = minute.map(two_digits).unwrap_or(Some(0))?;
    let seconds = second.map(two_digits).unwrap_or(Some(0))?;
    if minutes >= 60 || seconds >= 60 {
        return None;
    }
    if let Some(pm) = half {
        if !(1..=12).contains(&hour) {
            return None;
        }
        hour = hour % 12 + if pm { 12 } else { 0 };
    }
    let value = (hour as f64 * 3600.0 + minutes as f64 * 60.0 + seconds as f64) / 86_400.0;
    if !crate::date_serial::valid_date_serial(value) {
        return None;
    }
    let pattern = match (half.is_some(), hour >= 24, second.is_some()) {
        (true, _, true) => "h:mm:ss AM/PM",
        (true, _, false) => "h:mm AM/PM",
        (false, true, _) => "[h]:mm:ss",
        (false, false, true) => "h:mm:ss",
        (false, false, false) => "h:mm",
    };
    Some(CellInput::Time { value, pattern })
}

fn digits(input: &str) -> Option<u64> {
    (!input.is_empty() && input.bytes().all(|byte| byte.is_ascii_digit()))
        .then(|| input.parse().ok())
        .flatten()
}

fn two_digits(input: &str) -> Option<u64> {
    if input.len() != 2 {
        return None;
    }
    digits(input)
}
