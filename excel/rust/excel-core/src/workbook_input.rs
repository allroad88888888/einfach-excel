//! 将用户输入作为一次工作簿写入；自动数字格式也在同一命令内完成。
use super::*;
use crate::cell_input::{parse_formatted_input, CellInput};
use crate::history_snapshot::HistorySnapshot;
use crate::{CellStyle, NumberFormat, StyleScope};

impl Workbook {
    pub fn set_cell_input(
        &mut self,
        sheet_idx: usize,
        address: &str,
        input: &str,
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        let addr = CellAddress::parse(address).ok_or("INVALID_ADDRESS")?;
        if self.sheet(sheet_idx).is_none() {
            return Err("INVALID_SHEET");
        }
        // UI 应定位到合并锚点；底层拒绝覆盖格输入，不能产生看不见的新数据。
        if self.sheets[sheet_idx]
            .merged_range_at(addr)
            .is_some_and(|range| range.start != addr)
        {
            return Err("MERGED_CELL_WRITE");
        }
        // 读取最终生效的行／列／格格式；Text 只影响新输入，不回写已有值。
        let parsed = parse_formatted_input(
            input,
            true,
            &self.sheets[sheet_idx].get_format(address).number_format,
        );
        let formatted_number = match parsed {
            CellInput::Formula(source) => {
                // 提交草稿前预检，解析/静态循环失败不能先覆盖原格再要求用户重试。
                let expr = parse_formula(&source).ok_or("INVALID_FORMULA")?;
                if self.closes_workbook_cycle(sheet_idx, addr, &expr) {
                    return Err("FORMULA_CYCLE");
                }
                self.set_input_formula(sheet_idx, addr, &source)?;
                None
            }
            CellInput::Literal(value) => {
                self.validate_input_value(sheet_idx, addr, &value)?;
                self.try_set_cell(sheet_idx, address, value)
                    .map_err(input_write_error)?;
                None
            }
            CellInput::Percentage { value, digits } => {
                Some((value, NumberFormat::Percent { digits }))
            }
            CellInput::Date(value) => Some((value, NumberFormat::Date("yyyy-mm-dd".into()))),
            CellInput::Time { value, pattern } => Some((value, NumberFormat::Time(pattern.into()))),
            CellInput::Fraction { value, denominator } => Some((
                value,
                NumberFormat::Fraction {
                    denominator: crate::FractionDenominator::Fixed(denominator),
                },
            )),
        };
        if let Some((value, format)) = formatted_number {
            self.validate_input_value(sheet_idx, addr, &Value::Number(value))?;
            self.try_set_cell(sheet_idx, address, Value::Number(value))
                .map_err(input_write_error)?;
            self.sheet_mut(sheet_idx).unwrap().patch_format_range(
                CellRange::single(addr),
                StyleScope::Cell,
                CellStyle {
                    number_format: Some(format),
                    ..Default::default()
                },
            );
        }
        Ok(())
    }

    pub(crate) fn validate_input_value(
        &self,
        sheet: usize,
        addr: CellAddress,
        value: &Value,
    ) -> Result<(), &'static str> {
        if self.sheets[sheet]
            .data_validation_at(addr)
            .is_some_and(|rule| !rule.accepts(value))
        {
            Err("DATA_VALIDATION_FAILED")
        } else {
            Ok(())
        }
    }

    /// 只为受验证约束的公式开启可撤回写入；导入/重算继续走原始 set_formula。
    /// 校验已安装公式的同一个结果，不另算一遍 RAND/自定义函数作为替身。
    fn set_input_formula(
        &mut self,
        sheet: usize,
        addr: CellAddress,
        source: &str,
    ) -> Result<(), &'static str> {
        let install = |book: &mut Self| {
            if book
                .try_set_formula(sheet, &addr.to_string(), source)
                .map_err(input_write_error)?
            {
                Ok(())
            } else {
                Err("INVALID_FORMULA")
            }
        };
        if self.sheets[sheet].data_validation_at(addr).is_none() {
            return install(self);
        }
        let before = HistorySnapshot::capture(&self.sheets[sheet], CellRange::single(addr), true);
        // 复用已有的通知延后机制，仅遍历已注册监听；拒绝值不能泄露给跨表订阅。
        let observers: Vec<_> = self
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = self.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = install(self).and_then(|_| {
                let value =
                    crate::sheet::collapse_array_for_eval(self.sheets[sheet].peek_value(addr));
                self.validate_input_value(sheet, addr, &value)
            });
            if result.is_err() {
                before
                    .restore(self, sheet)
                    .expect("the input transaction keeps its original worksheet");
            }
        });
        for (sheet, observer) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }
}

fn input_write_error(error: SheetError) -> &'static str {
    match error {
        SheetError::InvalidAddress => "INVALID_ADDRESS",
        SheetError::MutationDuringCustomCall => "MUTATION_DURING_CUSTOM_CALL",
        SheetError::SpillCellWrite { .. } => "SPILL_CELL_WRITE",
    }
}
