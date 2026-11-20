//! 时间沿用 1900 日期序号，一天为 1；不读取系统时区。
use crate::date_serial::valid_date_serial;

/// 当前时间类别支持这些标准样式；任意自定义日期时间语法另由 custom 类别扩展。
pub(crate) fn format_time(pattern: &str, number: f64) -> String {
    if !valid_date_serial(number) {
        return "#####".into();
    }
    let lower = pattern.to_ascii_lowercase();
    let (base, precision) = extract_subsecond_precision(&lower);
    let scale = 10u64.pow(precision as u32);
    let total = (number * 86_400.0 * scale as f64).round() as u64;
    let seconds = total / scale;
    let sub = total % scale;
    let suffix = if precision == 0 {
        String::new()
    } else {
        format!(".{sub:0width$}", width = precision)
    };
    let hour = seconds / 3600 % 24;
    let minute = seconds / 60 % 60;
    let second = seconds % 60;
    let half = if hour < 12 { "AM" } else { "PM" };
    let twelve_hour = if hour % 12 == 0 { 12 } else { hour % 12 };
    match (base.as_str(), precision) {
        ("h:mm", 0) => format!("{hour}:{minute:02}"),
        ("hh:mm", 0) => format!("{hour:02}:{minute:02}"),
        ("h:mm:ss", _) => format!("{hour}:{minute:02}:{second:02}{suffix}"),
        ("hh:mm:ss", _) => format!("{hour:02}:{minute:02}:{second:02}{suffix}"),
        ("h:mm am/pm", 0) => format!("{twelve_hour}:{minute:02} {half}"),
        ("h:mm:ss am/pm", _) => format!("{twelve_hour}:{minute:02}:{second:02}{suffix} {half}"),
        ("mm:ss", _) => format!("{minute:02}:{second:02}{suffix}"),
        ("[h]:mm:ss", _) => format!("{}:{minute:02}:{second:02}{suffix}", seconds / 3600),
        _ => "#####".into(),
    }
}

fn extract_subsecond_precision(lower: &str) -> (String, usize) {
    for (zeros, p) in [("ss.000", 3), ("ss.00", 2), ("ss.0", 1)] {
        if let Some((head, tail)) = lower.split_once(zeros) {
            if tail.is_empty() || tail == " am/pm" {
                return (format!("{head}ss{tail}"), p);
            }
        }
    }
    (lower.to_owned(), 0)
}
