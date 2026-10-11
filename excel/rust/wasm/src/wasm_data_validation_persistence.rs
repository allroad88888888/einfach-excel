// 验证配置随原 v1 快照保存；旧快照缺省为空，恢复失败不替换当前工作簿。
impl WasmWorkbook {
    fn data_validations_json(&self) -> Vec<SheetDataValidationJSON> {
        (0..self.workbook.sheet_count())
            .filter_map(|sheet| {
                let regions = self.workbook.sheet(sheet)?.data_validations();
                (!regions.is_empty()).then(|| SheetDataValidationJSON {
                    sheet,
                    regions: regions
                        .iter()
                        .map(|entry| DataValidationRegionJSON {
                            range: [
                                entry.range.start.row,
                                entry.range.start.col,
                                entry.range.end.row,
                                entry.range.end.col,
                            ],
                            rule: DataValidationRuleJSON::from_rule(&entry.rule),
                        })
                        .collect(),
                })
            })
            .collect()
    }

    fn restore_data_validations_json(
        workbook: &mut Workbook,
        entries: Vec<SheetDataValidationJSON>,
    ) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) {
                return Err("Duplicate sheet in persisted data validation.".into());
            }
            if entry.regions.len() > einfach_excel_core::data_validation::MAX_VALIDATION_REGIONS {
                return Err("Too many persisted data-validation regions.".into());
            }
            let sheet = workbook
                .sheet_mut(entry.sheet)
                .ok_or("Data validation references a missing sheet.")?;
            for region in entry.regions {
                let [r0, c0, r1, c1] = region.range;
                let range = CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1));
                // 快照表达最终配置，不是用户操作序列；禁止靠覆盖顺序掩盖损坏的重叠。
                if sheet
                    .data_validations()
                    .iter()
                    .any(|entry| entry.range.intersects(range))
                {
                    return Err("Persisted data-validation regions overlap.".into());
                }
                sheet.set_data_validation(range, Some(region.rule.into_rule()?))?;
            }
        }
        Ok(())
    }
}
