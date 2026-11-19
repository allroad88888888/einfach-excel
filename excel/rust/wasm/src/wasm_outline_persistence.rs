/// 只持久化分组来源，不序列化折叠产生的隐藏索引；旧文档缺省为空。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SheetOutlineJSON {
    sheet: usize,
    outline: einfach_excel_core::outline::SheetOutline,
    #[serde(default, rename = "subtotalRegions", skip_serializing_if = "Vec::is_empty")]
    subtotal_regions: Vec<einfach_excel_core::subtotal::SubtotalRegion>,
}

impl WasmWorkbook {
    fn outlines_json(&self) -> Vec<SheetOutlineJSON> {
        (0..self.workbook.sheet_count()).filter_map(|sheet| {
            let outline = self.workbook.sheet(sheet)?.outline();
            let subtotal_regions = self.workbook.subtotal_regions(sheet)?;
            (!outline.rows.is_empty() || !outline.columns.is_empty() || !subtotal_regions.is_empty())
                .then(|| SheetOutlineJSON { sheet, outline: outline.clone(), subtotal_regions: subtotal_regions.to_vec() })
        }).collect()
    }

    fn restore_outlines_json(workbook: &mut Workbook, entries: Vec<SheetOutlineJSON>) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) {
                return Err("Duplicate sheet in persisted outline.".into());
            }
            workbook.set_outline(entry.sheet, entry.outline).map_err(str::to_string)?;
            workbook.restore_subtotal_regions(entry.sheet, entry.subtotal_regions).map_err(str::to_string)?;
        }
        Ok(())
    }
}
