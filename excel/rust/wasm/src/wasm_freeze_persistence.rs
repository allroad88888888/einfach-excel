/// 冻结配置作为可选工作表元数据保留；旧快照缺省为不冻结。
#[derive(Clone, Debug, Serialize, Deserialize)]
struct SheetFreezeJSON {
    sheet: usize,
    rows: u32,
    cols: u32,
}

impl WasmWorkbook {
    fn freeze_json(&self) -> Vec<SheetFreezeJSON> {
        (0..self.workbook.sheet_count())
            .filter_map(|sheet| {
                let freeze = self.workbook.sheet(sheet)?.frozen_panes();
                (freeze.rows != 0 || freeze.cols != 0).then_some(SheetFreezeJSON {
                    sheet,
                    rows: freeze.rows,
                    cols: freeze.cols,
                })
            })
            .collect()
    }

    fn restore_freeze_json(
        workbook: &mut Workbook,
        entries: Vec<SheetFreezeJSON>,
    ) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) {
                return Err("Duplicate sheet in persisted freeze.".into());
            }
            workbook
                .sheet_mut(entry.sheet)
                .ok_or_else(|| "Persisted freeze references a missing sheet.".to_string())?
                .set_frozen_panes(einfach_excel_core::FrozenPanes {
                    rows: entry.rows,
                    cols: entry.cols,
                })
                .map_err(str::to_string)?;
        }
        Ok(())
    }
}
