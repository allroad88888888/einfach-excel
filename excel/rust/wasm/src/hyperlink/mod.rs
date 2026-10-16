// 超链接导出与 v1 文件字段；旧文件缺省为空，不将链接塞进字体格式。
#[derive(Clone, Debug, Serialize, Deserialize)]
struct HyperlinkJSON {
    sheet: usize,
    row: u32,
    col: u32,
    url: String,
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 一个原生命令完成显示文字/链接修改及单条撤销记录。
    pub fn change_hyperlink(
        &mut self, sheet: u32, row: u32, col: u32, url: Option<String>, text: Option<String>,
    ) -> Result<bool, JsValue> {
        self.history.change_hyperlink(&mut self.workbook, sheet as usize,
            CellAddress::new(row, col), url.as_deref(), text.as_deref())
            .map_err(JsValue::from_str)
    }
}

impl WasmWorkbook {
    fn hyperlinks_json(&self) -> Vec<HyperlinkJSON> {
        (0..self.workbook.sheet_count()).flat_map(|index|
            self.workbook.sheet(index).into_iter().flat_map(move |sheet|
                sheet.hyperlinks_in_range(Self::full_sheet_range()).into_iter()
                    .map(move |(addr, url)| HyperlinkJSON {
                        sheet: index, row: addr.row, col: addr.col, url,
                    }))).collect()
    }

    fn restore_hyperlinks_json(workbook: &mut Workbook, links: Vec<HyperlinkJSON>) -> Result<(), String> {
        let mut seen = HashSet::new();
        for link in links {
            if !seen.insert((link.sheet, link.row, link.col)) {
                return Err("Duplicate hyperlink cell in workbook file.".into());
            }
            let sheet = workbook.sheet_mut(link.sheet)
                .ok_or("The hyperlink worksheet no longer exists.")?;
            sheet.set_hyperlink(CellAddress::new(link.row, link.col), Some(&link.url))?;
        }
        Ok(())
    }

    /// 空内容仍可带链接；投影必须让 UI 能再次选中、修改和移除它。
    fn append_empty_hyperlink_cells(&self, sheet: usize, range: CellRange, out: &mut Vec<CellSnapshotJSON>) {
        let Some(target) = self.workbook.sheet(sheet) else { return };
        let present: HashSet<_> = out.iter().map(|cell| cell.addr.clone()).collect();
        for (addr, url) in target.hyperlinks_in_range(range) {
            let address = addr.to_string();
            if present.contains(&address) { continue; }
            out.push(CellSnapshotJSON { sheet, addr: address, display: String::new(),
                formatted_display: None, input_text: String::new(), cell_type: "null".into(),
                is_error: false, formula: String::new(), hyperlink: Some(url) });
        }
    }
}
