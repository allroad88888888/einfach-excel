// 目录来自编译后的分发表，lite 不会宣称支持 full 才有的 REGEX 函数。
#[derive(Serialize)]
struct FunctionCatalogJSON {
    version: u32,
    functions: Vec<einfach_excel_core::BuiltinFunction>,
}

#[wasm_bindgen]
pub fn function_catalog() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&FunctionCatalogJSON {
        version: 2,
        functions: einfach_excel_core::builtin_function_catalog(),
    }).map_err(|error| JsValue::from_str(&error.to_string()))
}
