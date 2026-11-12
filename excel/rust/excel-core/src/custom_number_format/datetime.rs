//! 含日期时间记号的段：按 1900 序号显示年月日、时分秒、上下午、累计时长与小数秒。
use super::lexer::{DatePart, Section, Token};
use super::output::Out;
use crate::date_format::{MONTHS, WEEKDAYS};
use crate::date_serial::{excel_serial_to_date_parts, valid_date_serial, weekday_sunday_indexed};

pub(super) fn render(section: &Section, serial: f64) -> Out {
    let mut out = Out::default();
    let Some(clock) = Clock::new(section, serial) else {
        out.push_str("#####");
        return out;
    };
    for token in &section.tokens {
        match token {
            Token::Date(part) => out.push_str(&clock.part(*part)),
            other => out.literal(other),
        }
    }
    out
}

struct Clock {
    day: i64,
    /// 舍入到显示精度后的累计时间单位（1 秒 = `scale` 个单位）。
    total: i64,
    scale: i64,
    precision: usize,
    twelve_hour: bool,
}

impl Clock {
    fn new(section: &Section, serial: f64) -> Option<Self> {
        if !valid_date_serial(serial) {
            return None;
        }
        let precision = section.tokens.iter().filter_map(|token| match token {
            Token::Date(DatePart::SubSecond(digits)) => Some((*digits).min(3)),
            _ => None,
        }).max().unwrap_or(0);
        let scale = 10i64.pow(precision as u32);
        // 先按显示精度整体舍入，23:59:59.6 才会正确进位到次日 00:00:00。
        let total = (serial * 86_400.0 * scale as f64).round() as i64;
        let twelve_hour = section.has(|t| matches!(t, Token::Date(DatePart::Meridian(..))));
        Some(Clock { day: total.div_euclid(86_400 * scale), total, scale, precision, twelve_hour })
    }

    fn seconds_of_day(&self) -> i64 {
        self.total.rem_euclid(86_400 * self.scale) / self.scale
    }

    fn part(&self, part: DatePart) -> String {
        let seconds = self.seconds_of_day();
        let hour = seconds / 3600;
        match part {
            DatePart::Year(run) => {
                let year = self.date().map_or(1900, |date| date.year);
                if run <= 2 { format!("{:02}", year % 100) } else { format!("{year:04}") }
            }
            DatePart::Month(run) => {
                let month = self.date().map_or(1, |date| date.month) as usize;
                match run {
                    1 => month.to_string(),
                    2 => format!("{month:02}"),
                    3 => MONTHS[month - 1][..3].into(),
                    4 => MONTHS[month - 1].into(),
                    _ => MONTHS[month - 1][..1].into(),
                }
            }
            DatePart::Day(run) => {
                let day = self.date().map_or(0, |date| date.day);
                let weekday = WEEKDAYS[weekday_sunday_indexed(self.day) as usize];
                match run {
                    1 => day.to_string(),
                    2 => format!("{day:02}"),
                    3 => weekday[..3].into(),
                    _ => weekday.into(),
                }
            }
            DatePart::Hour(run) => {
                let shown = if self.twelve_hour { (hour + 11) % 12 + 1 } else { hour };
                pad(shown, run)
            }
            DatePart::Minute(run) => pad(seconds / 60 % 60, run),
            DatePart::Second(run) => pad(seconds % 60, run),
            DatePart::Elapsed(unit, run) => {
                let whole_seconds = self.total.div_euclid(self.scale);
                let value = match unit {
                    'h' => whole_seconds / 3600,
                    'm' => whole_seconds / 60,
                    _ => whole_seconds,
                };
                pad(value, run)
            }
            DatePart::SubSecond(digits) => {
                let fraction = self.total.rem_euclid(self.scale);
                let text = format!("{fraction:0width$}", width = self.precision);
                format!(".{}", &text[..digits.min(self.precision)])
            }
            DatePart::Meridian(am, pm) => if hour < 12 { am } else { pm }.into(),
        }
    }

    fn date(&self) -> Option<crate::date_serial::ExcelDateParts> {
        excel_serial_to_date_parts(self.day as f64)
    }
}

fn pad(value: i64, run: usize) -> String {
    if run >= 2 { format!("{value:02}") } else { value.to_string() }
}
