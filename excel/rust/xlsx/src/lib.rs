//! XLSX 与 einfach 原生工作簿文件（`.einfach.json`）之间的双向转换。

mod address;
mod color;
mod date_serial;
mod formula;
mod native;
mod native_features;
mod native_rules;
mod number_format;
mod read;
mod report;
mod units;
mod write;

pub use report::{ConversionReport, ReportItem};

use std::fmt;

use wasm_bindgen::prelude::*;

#[derive(Debug)]
pub struct XlsxError(String);

impl XlsxError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for XlsxError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for XlsxError {}

/// XLSX 字节 → 原生工作簿文件文本与转换报告。`title` 一般取文件名去掉扩展名。
pub fn xlsx_to_native_with_report(
    bytes: Vec<u8>,
    title: &str,
) -> Result<(String, ConversionReport), XlsxError> {
    let (file, report) = read::read(bytes, title)?;
    let text = serde_json::to_string(&file).map_err(|error| XlsxError::new(error.to_string()))?;
    Ok((text, report))
}

/// XLSX 字节 → 原生工作簿文件文本。`title` 一般取文件名去掉扩展名。
pub fn xlsx_to_native(bytes: Vec<u8>, title: &str) -> Result<String, XlsxError> {
    xlsx_to_native_with_report(bytes, title).map(|(text, _)| text)
}

#[wasm_bindgen(js_name = xlsxToNative)]
pub fn xlsx_to_native_js(bytes: Vec<u8>, title: &str) -> Result<String, JsError> {
    xlsx_to_native(bytes, title).map_err(|error| JsError::new(&error.to_string()))
}

#[wasm_bindgen(getter_with_clone)]
pub struct XlsxImportOutput {
    pub text: String,
    pub report: String,
}

#[wasm_bindgen(js_name = xlsxToNativeWithReport)]
pub fn xlsx_to_native_with_report_js(bytes: Vec<u8>, title: &str) -> Result<XlsxImportOutput, JsError> {
    let (text, report) = xlsx_to_native_with_report(bytes, title)
        .map_err(|error| JsError::new(&error.to_string()))?;
    let report = serde_json::to_string(&report)
        .map_err(|error| JsError::new(&error.to_string()))?;
    Ok(XlsxImportOutput { text, report })
}

/// 原生工作簿文件文本 → XLSX 字节与转换报告。不认识的原生字段（保护、筛选、打印设置等）不会写出。
pub fn native_to_xlsx_with_report(text: &str) -> Result<(Vec<u8>, ConversionReport), XlsxError> {
    let file: native::NativeFile = serde_json::from_str(text)
        .map_err(|_| XlsxError::new("This is not a valid .einfach.json workbook file."))?;
    if file.format != native::FORMAT || file.version != 1 {
        return Err(XlsxError::new("Unsupported workbook file version."));
    }
    write::write(&file)
}

/// 原生工作簿文件文本 → XLSX 字节。不认识的原生字段（保护、筛选、打印设置等）不会写出。
pub fn native_to_xlsx(text: &str) -> Result<Vec<u8>, XlsxError> {
    native_to_xlsx_with_report(text).map(|(bytes, _)| bytes)
}

#[wasm_bindgen(js_name = nativeToXlsx)]
pub fn native_to_xlsx_js(text: &str) -> Result<Vec<u8>, JsError> {
    native_to_xlsx(text).map_err(|error| JsError::new(&error.to_string()))
}

#[wasm_bindgen(getter_with_clone)]
pub struct XlsxExportOutput {
    pub bytes: Vec<u8>,
    pub report: String,
}

#[wasm_bindgen(js_name = nativeToXlsxWithReport)]
pub fn native_to_xlsx_with_report_js(text: &str) -> Result<XlsxExportOutput, JsError> {
    let (bytes, report) = native_to_xlsx_with_report(text)
        .map_err(|error| JsError::new(&error.to_string()))?;
    let report = serde_json::to_string(&report)
        .map_err(|error| JsError::new(&error.to_string()))?;
    Ok(XlsxExportOutput { bytes, report })
}

#[cfg(test)]
mod iterative_calc_tests {
    use super::*;

    #[test]
    fn iterative_calculation_roundtrips_through_xlsx_calc_pr() {
        let input = r#"{
            "format": "einfach-workbook",
            "version": 1,
            "title": "IterTest",
            "canvases": [{ "rowCount": 100, "colCount": 26 }],
            "workbook": {
                "version": 1,
                "sheets": [{ "idx": 0, "name": "Sheet1" }],
                "cells": [],
                "calculationMode": "manual",
                "iterativeCalculation": {
                    "enabled": true,
                    "maxIterations": 50,
                    "maxChange": 0.0005
                }
            }
        }"#;
        let bytes = native_to_xlsx(input).expect("export xlsx");
        let restored = xlsx_to_native(bytes, "IterTest").expect("import xlsx");
        let parsed: native::NativeFile = serde_json::from_str(&restored).expect("parse native");
        assert_eq!(parsed.workbook.calculation_mode.as_deref(), Some("manual"));
        assert_eq!(
            parsed.workbook.iterative_calculation,
            Some(native::IterativeCalculation {
                enabled: true,
                max_iterations: 50,
                max_change: 0.0005,
            })
        );
    }
}
