//! 时间沿用 1900 日期序号，一天为 1；不读取系统时区。
use crate::date_serial::valid_date_serial;

/// 当前时间类别支持这些标准样式；任意自定义日期时间语法另由 custom 类别扩展。
pub(crate) fn format_time(pattern: &str, number: f64) -> String {
    if !valid_date_serial(number) {
        return "#####".into();
    }
    let seconds = (number * 86_400.0).round() as u64;
    let hour = seconds / 3600 % 24;
    let minute = seconds / 60 % 60;
    let second = seconds % 60;
    let half = if hour < 12 { "AM" } else { "PM" };
    let twelve_hour = if hour % 12 == 0 { 12 } else { hour % 12 };
    match pattern.to_ascii_lowercase().as_str() {
        "h:mm" => format!("{hour}:{minute:02}"),
        "hh:mm" => format!("{hour:02}:{minute:02}"),
        "h:mm:ss" => format!("{hour}:{minute:02}:{second:02}"),
        "hh:mm:ss" => format!("{hour:02}:{minute:02}:{second:02}"),
        "h:mm am/pm" => format!("{twelve_hour}:{minute:02} {half}"),
        "h:mm:ss am/pm" => format!("{twelve_hour}:{minute:02}:{second:02} {half}"),
        "mm:ss" => format!("{minute:02}:{second:02}"),
        "[h]:mm:ss" => format!("{}:{minute:02}:{second:02}", seconds / 3600),
        _ => "#####".into(),
    }
}
