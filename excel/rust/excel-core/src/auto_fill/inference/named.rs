//! 从原生文本样本确定列表及循环步长；不从浏览器接收推算后的源事实。
use super::*;

pub(super) fn infer_named_series(
    sheet: &crate::Sheet,
    request: AutoFillRequest,
) -> Result<AutoFillRequest, AutoFillError> {
    let source = source_texts(sheet, &request)?;
    let lists = match request.series {
        AutoFillSeries::WeekdayName => vec![
            builtin("builtin-weekday-short", &BUILTIN_WEEKDAY_SHORT),
            builtin("builtin-weekday-long", &BUILTIN_WEEKDAY_LONG),
            chinese(
                "locale-weekday",
                [
                    "星期一",
                    "星期二",
                    "星期三",
                    "星期四",
                    "星期五",
                    "星期六",
                    "星期日",
                ],
            ),
            chinese(
                "locale-weekday",
                ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
            ),
        ],
        AutoFillSeries::MonthName => vec![
            builtin("builtin-month-short", &BUILTIN_MONTH_SHORT),
            builtin("builtin-month-long", &BUILTIN_MONTH_LONG),
            AutoFillListWitness {
                list_name: "locale-month".into(),
                locale: "zh".into(),
                values: (1..=12).map(|month| format!("{month}月")).collect(),
            },
            chinese(
                "locale-month",
                [
                    "一月",
                    "二月",
                    "三月",
                    "四月",
                    "五月",
                    "六月",
                    "七月",
                    "八月",
                    "九月",
                    "十月",
                    "十一月",
                    "十二月",
                ],
            ),
        ],
        AutoFillSeries::CustomList => vec![request.list.clone().ok_or(
            AutoFillError::InvalidWitness("enter a custom list with at least two items"),
        )?],
        _ => return Err(AutoFillError::UnsupportedSeries),
    };
    for list in lists {
        if list.values.len() < 2
            || list.values.len() > LIST_MAX_ITEMS
            || list.values.iter().map(|v| v.chars().count()).sum::<usize>() > 16_384
        {
            return Err(AutoFillError::InvalidWitness(
                "list must contain 2–512 items and at most 16384 characters",
            ));
        }
        let language = supported_locale_language(&list.locale).ok_or(
            AutoFillError::InvalidWitness("named series locale must be supported and canonical"),
        )?;
        let normalized: Vec<_> = list
            .values
            .iter()
            .map(|value| fold_named_value(value, language))
            .collect();
        let indices: Option<Vec<_>> = source
            .iter()
            .map(|value| {
                let value = fold_named_value(value, language);
                normalized.iter().position(|item| item == &value)
            })
            .collect();
        let Some(indices) = indices else { continue };
        if indices.is_empty() {
            continue;
        }
        let mut candidate = request.clone();
        // 模数内的正步长也表示逆序；例如 Wed、Tue 的 +6 与 -1 在星期表上等价。
        let step = if indices.len() > 1 {
            (indices[1] + list.values.len() - indices[0]) % list.values.len()
        } else {
            1
        };
        candidate.step = Some(step as f64);
        candidate.list = Some(list);
        // 这里只验证源序列。目标 spill／越界等仍交给完整预检，不能静默退化成复制。
        plan_named_series(sheet, &candidate, None)?;
        return Ok(candidate);
    }
    Err(AutoFillError::InvalidSource(
        "source strings do not match this named list",
    ))
}

fn builtin(name: &str, values: &[&str]) -> AutoFillListWitness {
    AutoFillListWitness {
        list_name: name.into(),
        locale: "en".into(),
        values: values.iter().map(|value| (*value).into()).collect(),
    }
}

fn chinese<const N: usize>(name: &str, values: [&str; N]) -> AutoFillListWitness {
    AutoFillListWitness {
        list_name: name.into(),
        locale: "zh".into(),
        values: values.into_iter().map(String::from).collect(),
    }
}
