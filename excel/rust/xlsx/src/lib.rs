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
mod units;
mod write;

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

/// XLSX 字节 → 原生工作簿文件文本。`title` 一般取文件名去掉扩展名。
pub fn xlsx_to_native(bytes: Vec<u8>, title: &str) -> Result<String, XlsxError> {
    let file = read::read(bytes, title)?;
    serde_json::to_string(&file).map_err(|error| XlsxError::new(error.to_string()))
}

#[wasm_bindgen(js_name = xlsxToNative)]
pub fn xlsx_to_native_js(bytes: Vec<u8>, title: &str) -> Result<String, JsError> {
    xlsx_to_native(bytes, title).map_err(|error| JsError::new(&error.to_string()))
}

/// 原生工作簿文件文本 → XLSX 字节。不认识的原生字段（保护、筛选、打印设置等）不会写出。
pub fn native_to_xlsx(text: &str) -> Result<Vec<u8>, XlsxError> {
    let file: native::NativeFile = serde_json::from_str(text)
        .map_err(|_| XlsxError::new("This is not a valid .einfach.json workbook file."))?;
    if file.format != native::FORMAT || file.version != 1 {
        return Err(XlsxError::new("Unsupported workbook file version."));
    }
    write::write(&file)
}

#[wasm_bindgen(js_name = nativeToXlsx)]
pub fn native_to_xlsx_js(text: &str) -> Result<Vec<u8>, JsError> {
    native_to_xlsx(text).map_err(|error| JsError::new(&error.to_string()))
}
