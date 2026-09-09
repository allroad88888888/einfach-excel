//! 只从原生样本推断序列参数；实际预检与写入仍复用 auto_fill 引擎。
use super::*;
mod named;

impl Workbook {
    /// UI 只提供样本范围与序列类别，不能提交另一份 JS 推算的工作簿事实。
    pub fn infer_auto_fill_request(
        &self,
        mut request: AutoFillRequest,
    ) -> Result<AutoFillRequest, AutoFillError> {
        // 必须先约束范围，再枚举样本；不能先为非法超大范围分配内存。
        validate_geometry(&request)?;
        let sheet = self
            .sheet(request.sheet_idx)
            .ok_or(AutoFillError::SheetOutOfRange)?;
        request.step = None;
        request.text_pattern = None;
        if request.series != AutoFillSeries::CustomList {
            request.list = None;
        }
        match request.series {
            AutoFillSeries::Copy => {
                // 日期格式的原生数字优先走日历规律，不能被普通等差序列抢走。
                if let Ok((addresses, _)) = source_numbers(sheet, &request, 1) {
                    if addresses.iter().all(|addr| {
                        matches!(
                            sheet.get_format(&addr.to_string()).number_format,
                            crate::NumberFormat::Date(_)
                        )
                    }) {
                        let mut candidate = request.clone();
                        candidate.series = AutoFillSeries::DateDay;
                        return Ok(self.infer_auto_fill_request(candidate).unwrap_or(request));
                    }
                }
                // 自动模式只试验源样本；目标溢出／spill 等错误不能降级成复制吞掉。
                for series in [
                    AutoFillSeries::IntegerStep,
                    AutoFillSeries::TextNumber,
                    AutoFillSeries::WeekdayName,
                    AutoFillSeries::MonthName,
                ] {
                    let mut candidate = request.clone();
                    candidate.series = series;
                    let Ok(candidate) = self.infer_auto_fill_request(candidate) else {
                        continue;
                    };
                    let valid = match candidate.series {
                        AutoFillSeries::TextNumber => {
                            plan_text_number_series(sheet, &candidate, None)
                        }
                        AutoFillSeries::WeekdayName | AutoFillSeries::MonthName => {
                            plan_named_series(sheet, &candidate, None)
                        }
                        _ => plan_numeric_series(sheet, &candidate, None),
                    };
                    if valid.is_ok() {
                        return Ok(candidate);
                    }
                }
                return Ok(request);
            }
            AutoFillSeries::IntegerStep | AutoFillSeries::DecimalStep => {
                let (_, values) = source_numbers(sheet, &request, 2)?;
                let step = values[1] - values[0];
                request.series = if step.abs() >= NUMBER_EPSILON
                    && is_fill_integer(step)
                    && values.iter().copied().all(is_fill_integer)
                {
                    AutoFillSeries::IntegerStep
                } else {
                    AutoFillSeries::DecimalStep
                };
                request.step = Some(step);
            }
            AutoFillSeries::LinearTrend => {
                let (_, values) = source_numbers(sheet, &request, 3)?;
                let (slope, _) = linear_trend(&values).ok_or(AutoFillError::InvalidSource(
                    "source numbers do not define a finite linear trend",
                ))?;
                request.step = Some(slope);
            }
            AutoFillSeries::DateDay | AutoFillSeries::DateWeek | AutoFillSeries::DateMonth => {
                let (_, values) = source_numbers(sheet, &request, 1)?;
                if !values
                    .iter()
                    .all(|value| crate::date_serial::valid_date_serial(*value))
                {
                    return Err(AutoFillError::InvalidSource("source date is out of range"));
                }
                let analysis = analyze_dates(&values).ok_or(AutoFillError::InvalidSource(
                    "source dates do not define a day, week or month sequence",
                ))?;
                request.series = match analysis.kind {
                    DateSeriesKind::Day => AutoFillSeries::DateDay,
                    DateSeriesKind::Week => AutoFillSeries::DateWeek,
                    DateSeriesKind::Month => AutoFillSeries::DateMonth,
                };
                request.step = Some(analysis.step as f64);
            }
            AutoFillSeries::TextNumber => {
                let parsed = source_texts(sheet, &request)?
                    .iter()
                    .map(|value| parse_text_number(value))
                    .collect::<Option<Vec<_>>>()
                    .ok_or(AutoFillError::InvalidSource(
                        "source strings do not contain a safe trailing number",
                    ))?;
                if parsed.len() < 2 {
                    return Err(AutoFillError::InvalidSource(
                        "use at least two text-number samples",
                    ));
                }
                let first = &parsed[0];
                request.step = Some((parsed[1].value - first.value) as f64);
                request.text_pattern = Some(AutoFillTextPattern {
                    prefix: first.prefix.clone(),
                    suffix: first.suffix.clone(),
                    width: if parsed.iter().all(|value| value.width == first.width) {
                        first.width
                    } else {
                        0
                    },
                });
            }
            AutoFillSeries::WeekdayName
            | AutoFillSeries::MonthName
            | AutoFillSeries::CustomList => {
                return named::infer_named_series(sheet, request);
            }
        }
        // 等差一致性、文本前后缀、溢出等仍由原生填充的完整预检统一判定。
        Ok(request)
    }
}
