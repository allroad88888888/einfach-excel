//! 日期显示使用原生 1900 序号；不交给系统时区或 JavaScript Date。
use crate::date_serial::{excel_serial_to_date_parts, valid_date_serial, weekday_sunday_indexed};

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const WEEKDAYS: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/// 支持年／月／日及英文名称格式；未支持的 token 不伪装成有效日期格式。
pub(crate) fn format_date(pattern: &str, serial: f64) -> Option<String> {
    if !valid_date_serial(serial) {
        return Some("#####".into());
    }
    let date = excel_serial_to_date_parts(serial)?;
    let mut output = String::new();
    let mut chars = pattern.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '"' {
            let mut closed = false;
            for literal in chars.by_ref() {
                if literal == '"' {
                    closed = true;
                    break;
                }
                output.push(literal);
            }
            if !closed {
                return None;
            }
        } else if ch == '\\' {
            output.push(chars.next()?);
        } else if matches!(ch.to_ascii_lowercase(), 'y' | 'm' | 'd') {
            let token = ch.to_ascii_lowercase();
            let mut count = 1;
            while chars
                .peek()
                .is_some_and(|next| next.to_ascii_lowercase() == token)
            {
                chars.next();
                count += 1;
            }
            let text = match (token, count) {
                ('y', 2) => format!("{:02}", date.year % 100),
                ('y', 4) => format!("{:04}", date.year),
                ('m', 1) => date.month.to_string(),
                ('m', 2) => format!("{:02}", date.month),
                ('m', 3) => MONTHS[date.month as usize - 1][..3].into(),
                ('m', 4) => MONTHS[date.month as usize - 1].into(),
                ('d', 1) => date.day.to_string(),
                ('d', 2) => format!("{:02}", date.day),
                ('d', 3 | 4) => {
                    let name = WEEKDAYS[weekday_sunday_indexed(serial.floor() as i64) as usize];
                    if count == 3 {
                        name[..3].into()
                    } else {
                        name.into()
                    }
                }
                _ => return None,
            };
            output.push_str(&text);
        } else if ch.is_ascii_alphabetic() || matches!(ch, '[' | ']' | ';') {
            return None;
        } else {
            output.push(ch);
        }
    }
    Some(output)
}
