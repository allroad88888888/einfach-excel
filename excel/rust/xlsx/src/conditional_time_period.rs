//! SpreadsheetML timePeriod values and matching compatibility formulas.
pub(crate) fn supported(period: &str) -> bool {
    matches!(period, "today" | "yesterday" | "tomorrow" | "last7Days" |
        "thisWeek" | "lastWeek" | "nextWeek" | "thisMonth" | "lastMonth" | "nextMonth")
}

pub(crate) fn formula(period: &str, cell: &str) -> Option<String> {
    let (start, end) = match period {
        "today" => ("TODAY()", "TODAY()+1"),
        "yesterday" => ("TODAY()-1", "TODAY()"),
        "tomorrow" => ("TODAY()+1", "TODAY()+2"),
        "last7Days" => ("TODAY()-6", "TODAY()+1"),
        "thisWeek" => ("TODAY()-WEEKDAY(TODAY(),1)+1", "TODAY()-WEEKDAY(TODAY(),1)+8"),
        "lastWeek" => ("TODAY()-WEEKDAY(TODAY(),1)-6", "TODAY()-WEEKDAY(TODAY(),1)+1"),
        "nextWeek" => ("TODAY()-WEEKDAY(TODAY(),1)+8", "TODAY()-WEEKDAY(TODAY(),1)+15"),
        "thisMonth" => ("DATE(YEAR(TODAY()),MONTH(TODAY()),1)", "DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)"),
        "lastMonth" => ("DATE(YEAR(TODAY()),MONTH(TODAY())-1,1)", "DATE(YEAR(TODAY()),MONTH(TODAY()),1)"),
        "nextMonth" => ("DATE(YEAR(TODAY()),MONTH(TODAY())+1,1)", "DATE(YEAR(TODAY()),MONTH(TODAY())+2,1)"),
        _ => return None,
    };
    Some(format!("AND(ISNUMBER({cell}),INT({cell})>={start},INT({cell})<{end})"))
}
