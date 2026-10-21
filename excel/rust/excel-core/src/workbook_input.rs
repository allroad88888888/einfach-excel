//! 将用户输入作为一次工作簿写入；自动数字格式也在同一命令内完成。
use super::*;
use crate::cell_input::{parse_formatted_input, CellInput};
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
        self.ensure_range_editable(sheet_idx, CellRange::single(addr))?;
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
        self.apply_validated_input(sheet_idx, addr, |book| {
            book.install_parsed_input(sheet_idx, addr, parsed)
        })
    }

    /// 普通输入及 Table 整行事务共用实际安装；后者必须在完整行落地后统一验证。
    pub(in crate::workbook) fn install_parsed_input(
        &mut self,
        sheet_idx: usize,
        addr: CellAddress,
        parsed: CellInput,
    ) -> Result<(), &'static str> {
        let address = addr.to_string();
        let formatted_number = match parsed {
            CellInput::Formula(source) => {
                // 提交草稿前预检，解析/静态循环失败不能先覆盖原格再要求用户重试。
                let expr = parse_formula(&source).ok_or("INVALID_FORMULA")?;
                if self.closes_workbook_cycle(sheet_idx, addr, &expr) {
                    return Err("FORMULA_CYCLE");
                }
                if !self
                    .try_set_formula(sheet_idx, &address, &source)
                    .map_err(input_write_error)?
                {
                    return Err("INVALID_FORMULA");
                }
                None
            }
            CellInput::Literal(value) => {
                self.try_set_cell(sheet_idx, &address, value)
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
            self.try_set_cell(sheet_idx, &address, Value::Number(value))
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
        self.validate_advanced_input_value(sheet, addr, value)
    }
}

fn input_write_error(error: SheetError) -> &'static str {
    match error {
        SheetError::InvalidAddress => "INVALID_ADDRESS",
        SheetError::ProtectedCell => crate::protection::PROTECTED_ERROR,
        SheetError::MutationDuringCustomCall => "MUTATION_DURING_CUSTOM_CALL",
        SheetError::SpillCellWrite { .. } => "SPILL_CELL_WRITE",
    }
}
