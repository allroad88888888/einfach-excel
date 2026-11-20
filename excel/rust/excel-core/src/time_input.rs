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
    let (seconds, subsecond) = match second {
        Some(part) => parse_seconds(part)?,
        None => (0, None),
    };
    if minutes >= 60 || seconds >= 60 {
        return None;
    }
    if let Some(pm) = half {
        if !(1..=12).contains(&hour) {
            return None;
        }
        hour = hour % 12 + if pm { 12 } else { 0 };
    }
    let fraction_sec = subsecond.map_or(0.0, |(frac, _)| frac);
    let value = (hour as f64 * 3600.0 + minutes as f64 * 60.0 + seconds as f64 + fraction_sec)
        / 86_400.0;
    if !crate::date_serial::valid_date_serial(value) {
        return None;
    }
    let pattern = match (half.is_some(), hour >= 24, second.is_some(), subsecond) {
        (true, _, _, Some((_, 1))) => "h:mm:ss.0 AM/PM",
        (true, _, _, Some((_, 2))) => "h:mm:ss.00 AM/PM",
        (true, _, _, Some(_)) => "h:mm:ss.000 AM/PM",
        (false, true, _, Some((_, 1))) => "[h]:mm:ss.0",
        (false, true, _, Some((_, 2))) => "[h]:mm:ss.00",
        (false, true, _, Some(_)) => "[h]:mm:ss.000",
        (false, false, _, Some((_, 1))) => "hh:mm:ss.0",
        (false, false, _, Some((_, 2))) => "hh:mm:ss.00",
        (false, false, _, Some(_)) => "hh:mm:ss.000",
        (true, _, true, None) => "h:mm:ss AM/PM",
        (true, _, false, None) => "h:mm AM/PM",
        (false, true, _, None) => "[h]:mm:ss",
        (false, false, true, None) => "h:mm:ss",
        (false, false, false, None) => "h:mm",
    };
    Some(CellInput::Time { value, pattern })
}

fn parse_seconds(input: &str) -> Option<(u64, Option<(f64, usize)>)> {
    let Some((whole, frac)) = input.split_once('.') else {
        return Some((two_digits(input)?, None));
    };
    let seconds = two_digits(whole)?;
    if frac.is_empty() || frac.len() > 9 || !frac.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let fraction = format!("0.{frac}").parse::<f64>().ok()?;
    Some((seconds, Some((fraction, frac.len().clamp(1, 3)))))
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
