/// 严格校验新边框命令；无效线型不降级为清除边框。
#[derive(Deserialize)]
struct BorderRangeJSON {
    preset: String,
    style: String,
    color: String,
}

impl BorderRangeJSON {
    fn parse(self) -> Result<(einfach_excel_core::sheet::BorderPreset, BorderSpec), String> {
        use einfach_excel_core::sheet::BorderPreset;
        let preset = match self.preset.as_str() {
            "all" => BorderPreset::All,
            "outside" => BorderPreset::Outside,
            "inside" => BorderPreset::Inside,
            "horizontal" => BorderPreset::Horizontal,
            "vertical" => BorderPreset::Vertical,
            "top" => BorderPreset::Top,
            "right" => BorderPreset::Right,
            "bottom" => BorderPreset::Bottom,
            "left" => BorderPreset::Left,
            "none" => BorderPreset::None,
            _ => return Err("invalid border preset".into()),
        };
        if !matches!(
            self.style.as_str(),
            "thin" | "medium" | "thick" | "dashed" | "dotted" | "double"
        ) {
            return Err("invalid border style".into());
        }
        if self.color.len() != 7
            || !self.color.starts_with('#')
            || !self.color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        {
            return Err("border color must be #RRGGBB".into());
        }
        Ok((
            preset,
            BorderSpecJSON {
                style: self.style,
                color: Some(self.color),
            }
            .into_spec(),
        ))
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 范围位置在 Rust 内计算；调用方用既有格式事务保存一次撤销。
    pub fn patch_range_borders(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        input: JsValue,
    ) -> Result<u32, JsValue> {
        let parsed: BorderRangeJSON = serde_wasm_bindgen::from_value(input)
            .map_err(|err| JsValue::from_str(&format!("invalid border request: {err}")))?;
        let (preset, border) = parsed.parse().map_err(|err| JsValue::from_str(&err))?;
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        self.history
            .patch_range_borders(&mut self.workbook, sheet_idx as usize, range, preset, border)
            .map(|count| count as u32)
            .map_err(JsValue::from_str)
    }
}

#[cfg(test)]
mod border_request_tests {
    use super::*;

    #[test]
    fn supported_presets_styles_and_colors_parse_without_js() {
        for preset in [
            "all",
            "outside",
            "inside",
            "horizontal",
            "vertical",
            "top",
            "right",
            "bottom",
            "left",
            "none",
        ] {
            for style in ["thin", "medium", "thick", "dashed", "dotted", "double"] {
                let request = BorderRangeJSON {
                    preset: preset.into(),
                    style: style.into(),
                    color: "#Ab12Cd".into(),
                };
                let (_, border) = request.parse().unwrap();
                assert_eq!(border.color.as_deref(), Some("#Ab12Cd"));
                assert_ne!(border.style, BorderStyle::None);
            }
        }
    }

    #[test]
    fn invalid_input_is_rejected_instead_of_clearing_existing_borders() {
        for (preset, style, color) in [
            ("diagonal", "thin", "#123abc"),
            ("all", "unknown", "#123abc"),
            ("all", "none", "#123abc"),
            ("all", "thin", "red"),
            ("all", "thin", "#123"),
            ("all", "thin", "#gggggg"),
            ("all", "thin", "#12345678"),
            ("all", "thin", "url(x)"),
        ] {
            assert!(BorderRangeJSON {
                preset: preset.into(),
                style: style.into(),
                color: color.into()
            }
            .parse()
            .is_err());
        }
    }
}
