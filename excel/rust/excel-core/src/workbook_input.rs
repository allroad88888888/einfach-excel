//! 将用户原始输入作为一次工作簿写入；自动百分比格式也在同一命令内完成。
use super::*;
use crate::cell_input::{parse_cell_input, CellInput};
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
        match parse_cell_input(input, true) {
            CellInput::Formula(source) => {
                // 提交草稿前预检，解析/静态循环失败不能先覆盖原格再要求用户重试。
                let expr = parse_formula(&source).ok_or("INVALID_FORMULA")?;
                if self.closes_workbook_cycle(sheet_idx, addr, &expr) {
                    return Err("FORMULA_CYCLE");
                }
                let installed = self
                    .try_set_formula(sheet_idx, address, &source)
                    .map_err(input_write_error)?;
                if !installed {
                    return Err("INVALID_FORMULA");
                }
            }
            CellInput::Literal(value) => self
                .try_set_cell(sheet_idx, address, value)
                .map_err(input_write_error)?,
            CellInput::Percentage { value, digits } => {
                self.try_set_cell(sheet_idx, address, Value::Number(value))
                    .map_err(input_write_error)?;
                self.sheet_mut(sheet_idx).unwrap().patch_format_range(
                    CellRange::single(addr),
                    StyleScope::Cell,
                    CellStyle {
                        number_format: Some(NumberFormat::Percent { digits }),
                        ..Default::default()
                    },
                );
            }
        }
        Ok(())
    }
}

fn input_write_error(error: SheetError) -> &'static str {
    match error {
        SheetError::InvalidAddress => "INVALID_ADDRESS",
        SheetError::MutationDuringCustomCall => "MUTATION_DURING_CUSTOM_CALL",
        SheetError::SpillCellWrite { .. } => "SPILL_CELL_WRITE",
    }
}
