#[derive(Clone, Debug, Serialize, Deserialize)]
struct SheetDrawingsJSON {
    sheet: usize,
    drawings: Vec<einfach_excel_core::drawings::SheetDrawing>,
}

impl WasmWorkbook {
    fn drawings_json(&self) -> Vec<SheetDrawingsJSON> {
        (0..self.workbook.sheet_count())
            .filter_map(|sheet| {
                let drawings = self.workbook.sheet(sheet)?.drawings();
                (!drawings.is_empty()).then(|| SheetDrawingsJSON {
                    sheet,
                    drawings: drawings.to_vec(),
                })
            })
            .collect()
    }

    /// 恢复在临时工作簿内完成；重复表、重复 id 或非法对象使整个文件失败。
    fn restore_drawings_json(
        workbook: &mut Workbook,
        entries: Vec<SheetDrawingsJSON>,
    ) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) {
                return Err("Duplicate object worksheet in workbook file.".into());
            }
            workbook
                .sheet_mut(entry.sheet)
                .ok_or("The object worksheet no longer exists.")?
                .replace_drawings(entry.drawings)?;
        }
        Ok(())
    }
}
