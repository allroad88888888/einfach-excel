/// 持久化的稀疏合并矩形，坐标顺序为 [startRow, startCol, endRow, endCol]。
#[derive(Clone, Debug, Serialize, Deserialize)]
struct SheetMergesJSON {
    sheet: usize,
    ranges: Vec<[u32; 4]>,
}

impl WasmWorkbook {
    fn merges_json(&self) -> Vec<SheetMergesJSON> {
        (0..self.workbook.sheet_count())
            .filter_map(|sheet| {
                let ranges = self.workbook.sheet(sheet)?.merged_ranges();
                (!ranges.is_empty()).then(|| SheetMergesJSON {
                    sheet,
                    ranges: ranges
                        .iter()
                        .map(|range| {
                            [
                                range.start.row,
                                range.start.col,
                                range.end.row,
                                range.end.col,
                            ]
                        })
                        .collect(),
                })
            })
            .collect()
    }

    /// 只转换传输结构；重叠、覆盖内容等规则由 Rust Sheet 统一校验。
    fn restore_merges_json(
        workbook: &mut Workbook,
        entries: Vec<SheetMergesJSON>,
    ) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) {
                return Err("Duplicate sheet in persisted merges.".into());
            }
            let sheet = workbook
                .sheet_mut(entry.sheet)
                .ok_or_else(|| "Persisted merges reference a missing sheet.".to_string())?;
            let ranges = entry
                .ranges
                .into_iter()
                .map(|[r0, c0, r1, c1]| CellRange {
                    // 保留原始起终点，非法输入交给引擎拒绝，不在传输层纠正。
                    start: CellAddress::new(r0, c0),
                    end: CellAddress::new(r1, c1),
                })
                .collect();
            sheet
                .restore_merged_ranges(ranges)
                .map_err(str::to_string)?;
        }
        Ok(())
    }
}
