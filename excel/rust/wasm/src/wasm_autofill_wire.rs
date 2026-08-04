#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum AutoFillDirectionJSON {
    Up,
    Down,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum AutoFillSeriesJSON {
    Copy,
    IntegerStep,
    DecimalStep,
    LinearTrend,
    DateDay,
    DateWeek,
    DateMonth,
    TextNumber,
    WeekdayName,
    MonthName,
    CustomList,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AutoFillRangeJSON {
    start_row: u32,
    start_col: u32,
    end_row: u32,
    end_col: u32,
}

impl From<AutoFillRangeJSON> for CellRange {
    fn from(value: AutoFillRangeJSON) -> Self {
        CellRange::new(
            CellAddress::new(value.start_row, value.start_col),
            CellAddress::new(value.end_row, value.end_col),
        )
    }
}

impl From<CellRange> for AutoFillRangeJSON {
    fn from(value: CellRange) -> Self {
        Self {
            start_row: value.start.row,
            start_col: value.start.col,
            end_row: value.end.row,
            end_col: value.end.col,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AutoFillTextPatternJSON {
    prefix: String,
    suffix: String,
    width: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AutoFillListWitnessJSON {
    list_name: String,
    values: Vec<String>,
    locale: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AutoFillRequestJSON {
    sheet: u32,
    source_range: AutoFillRangeJSON,
    target_range: AutoFillRangeJSON,
    direction: AutoFillDirectionJSON,
    series: AutoFillSeriesJSON,
    #[serde(default)]
    step: Option<f64>,
    #[serde(default)]
    text_pattern: Option<AutoFillTextPatternJSON>,
    #[serde(default)]
    list: Option<AutoFillListWitnessJSON>,
}

impl From<AutoFillRequestJSON> for AutoFillRequest {
    fn from(value: AutoFillRequestJSON) -> Self {
        Self {
            sheet_idx: value.sheet as usize,
            source_range: value.source_range.into(),
            target_range: value.target_range.into(),
            direction: match value.direction {
                AutoFillDirectionJSON::Up => AutoFillDirection::Up,
                AutoFillDirectionJSON::Down => AutoFillDirection::Down,
                AutoFillDirectionJSON::Left => AutoFillDirection::Left,
                AutoFillDirectionJSON::Right => AutoFillDirection::Right,
            },
            series: match value.series {
                AutoFillSeriesJSON::Copy => AutoFillSeries::Copy,
                AutoFillSeriesJSON::IntegerStep => AutoFillSeries::IntegerStep,
                AutoFillSeriesJSON::DecimalStep => AutoFillSeries::DecimalStep,
                AutoFillSeriesJSON::LinearTrend => AutoFillSeries::LinearTrend,
                AutoFillSeriesJSON::DateDay => AutoFillSeries::DateDay,
                AutoFillSeriesJSON::DateWeek => AutoFillSeries::DateWeek,
                AutoFillSeriesJSON::DateMonth => AutoFillSeries::DateMonth,
                AutoFillSeriesJSON::TextNumber => AutoFillSeries::TextNumber,
                AutoFillSeriesJSON::WeekdayName => AutoFillSeries::WeekdayName,
                AutoFillSeriesJSON::MonthName => AutoFillSeries::MonthName,
                AutoFillSeriesJSON::CustomList => AutoFillSeries::CustomList,
            },
            step: value.step,
            text_pattern: value.text_pattern.map(|pattern| AutoFillTextPattern {
                prefix: pattern.prefix,
                suffix: pattern.suffix,
                width: pattern.width,
            }),
            list: value.list.map(|list| AutoFillListWitness {
                list_name: list.list_name,
                values: list.values,
                locale: list.locale,
            }),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoFillReportJSON {
    write_range: Option<AutoFillRangeJSON>,
    written: usize,
}

#[cfg(target_arch = "wasm32")]
const AUTO_FILL_REJECTION_ERROR_NAME: &str = "EinfachAutoFillRejected";
/// Default wire code for a rejected `apply_auto_fill` call.
const AUTO_FILL_REJECTION_ERROR_CODE: &str = "AUTO_FILL_REJECTED";
/// Wire code for [`AutoFillError::TooLarge`] specifically — lets hosts tell
/// "the target range exceeds the engine's size budget" apart from every
/// other semantic rejection without parsing the message text. Mirrors
/// `MAX_AUTO_FILL_CELLS` (`excel/rust/excel-core/src/auto_fill.rs`) and the two TS
/// adapter pre-flight checks (`worker-workbook-backend.ts`,
/// `static-backend.ts`) that reject the same request before it ever reaches
/// this wasm boundary.
const AUTO_FILL_TOO_LARGE_ERROR_CODE: &str = "AUTO_FILL_TOO_LARGE";

/// Selects the wire `code` for a rejected [`AutoFillError`]. Only
/// `TooLarge` gets its own code; every other variant keeps the generic
/// `AUTO_FILL_REJECTED` code the wire has always used.
fn auto_fill_error_code(err: &AutoFillError) -> &'static str {
    match err {
        AutoFillError::TooLarge { .. } => AUTO_FILL_TOO_LARGE_ERROR_CODE,
        _ => AUTO_FILL_REJECTION_ERROR_CODE,
    }
}

fn auto_fill_rejection(code: &str, message: String) -> JsValue {
    #[cfg(target_arch = "wasm32")]
    {
        let error = js_sys::Error::new(&message);
        let error_value = error.as_ref();
        let _ = js_sys::Reflect::set(
            error_value,
            &JsValue::from_str("name"),
            &JsValue::from_str(AUTO_FILL_REJECTION_ERROR_NAME),
        );
        let _ = js_sys::Reflect::set(
            error_value,
            &JsValue::from_str("code"),
            &JsValue::from_str(code),
        );
        return error.into();
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        // Native tests compile the wire helpers but never execute this
        // wasm-bindgen boundary. Keep a native fallback so `cargo test` can
        // type-check the exported implementation.
        let _ = code;
        JsValue::from_str(&message)
    }
}

impl From<AutoFillReport> for AutoFillReportJSON {
    fn from(value: AutoFillReport) -> Self {
        Self {
            write_range: value.write_range.map(Into::into),
            written: value.written,
        }
    }
}
