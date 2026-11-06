#[derive(Clone, Debug, Serialize, Deserialize)]
struct RichTextJSON {
    sheet: usize,
    row: u32,
    col: u32,
    runs: Vec<einfach_excel_core::rich_text::RichTextRun>,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn change_rich_text(&mut self, sheet: u32, row: u32, col: u32, runs: JsValue) -> Result<bool, JsValue> {
        let runs = serde_wasm_bindgen::from_value(runs)
            .map_err(|error| JsValue::from_str(&format!("Invalid rich text: {error}")))?;
        self.history.change_rich_text(&mut self.workbook, sheet as usize, CellAddress::new(row, col), runs)
            .map_err(JsValue::from_str)
    }
}

impl WasmWorkbook {
    fn rich_text_json(&self) -> Vec<RichTextJSON> {
        (0..self.workbook.sheet_count()).flat_map(|index|
            self.workbook.sheet(index).into_iter().flat_map(move |sheet|
                sheet.rich_text_in_range(Self::full_sheet_range()).into_iter()
                    .map(move |(addr, runs)| RichTextJSON { sheet: index, row: addr.row, col: addr.col, runs }))).collect()
    }

    fn restore_rich_text_json(workbook: &mut Workbook, entries: Vec<RichTextJSON>) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert((entry.sheet, entry.row, entry.col)) { return Err("Duplicate rich text cell in workbook file.".into()); }
            workbook.sheet_mut(entry.sheet).ok_or("The rich text worksheet no longer exists.")?
                .set_rich_text(CellAddress::new(entry.row, entry.col), entry.runs)?;
        }
        Ok(())
    }
}
