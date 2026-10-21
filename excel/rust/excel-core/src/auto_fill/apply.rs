//! 填充的一次预检与原子应用；普通调用和历史入口共用同一计划。
use super::*;
use crate::{
    sheet::{border_plan_ranges, BorderPlan},
    workbook_history::WorkbookHistory,
    CellStyle, StyleScope,
};

mod inferred;

#[derive(Default)]
struct FillPlan {
    cells: Vec<PlannedCell>,
    write_range: Option<CellRange>,
    borders: BorderPlan,
}

impl Workbook {
    /// 所有源样本、目标约束和公式先验证；失败时不修改工作簿。
    pub fn apply_auto_fill(
        &mut self,
        request: &AutoFillRequest,
    ) -> Result<AutoFillReport, AutoFillError> {
        let plan = self.plan_auto_fill(request)?;
        self.apply_fill_plan(request.sheet_idx, plan)
    }

    fn plan_auto_fill(&self, request: &AutoFillRequest) -> Result<FillPlan, AutoFillError> {
        validate_geometry(request)?;
        let write_range = fill_write_range(request);
        if self.is_inside_custom_call() {
            return Err(AutoFillError::MutationDuringCustomCall);
        }
        let sheet = self
            .sheet(request.sheet_idx)
            .ok_or(AutoFillError::SheetOutOfRange)?;
        // 无扩展复制是空操作；序列仍须验证原有 witness 合同。
        if write_range.is_none() && request.series == AutoFillSeries::Copy {
            return Ok(FillPlan::default());
        }
        if sheet
            .merged_ranges()
            .iter()
            .any(|range| range.intersects(request.target_range))
        {
            return Err(AutoFillError::InvalidGeometry(
                "unmerge cells before filling this range",
            ));
        }
        let cells = match request.series {
            AutoFillSeries::Copy => plan_copy(sheet, request, write_range.unwrap())?,
            AutoFillSeries::IntegerStep | AutoFillSeries::DecimalStep => {
                plan_numeric_series(sheet, request, write_range)?
            }
            AutoFillSeries::LinearTrend => plan_linear_trend(sheet, request, write_range)?,
            AutoFillSeries::DateDay | AutoFillSeries::DateWeek | AutoFillSeries::DateMonth => {
                plan_date_series(sheet, request, write_range)?
            }
            AutoFillSeries::TextNumber => plan_text_number_series(sheet, request, write_range)?,
            AutoFillSeries::WeekdayName
            | AutoFillSeries::MonthName
            | AutoFillSeries::CustomList => plan_named_series(sheet, request, write_range)?,
        };
        if write_range.is_none() {
            return Ok(FillPlan::default());
        }
        let borders = sheet.plan_replacement_borders(
            cells
                .iter()
                .map(|cell| (cell.addr, cell.format.borders.clone())),
            sheet.merged_ranges(),
        );
        self.ensure_fill_protection(request.sheet_idx, &cells, &borders)?;
        Ok(FillPlan {
            cells,
            write_range,
            borders,
        })
    }

    /// Bulk loaders are intentionally raw; the complete fill plan is checked before using one.
    fn ensure_fill_protection(
        &self,
        sheet: usize,
        cells: &[PlannedCell],
        borders: &BorderPlan,
    ) -> Result<(), AutoFillError> {
        for addr in cells
            .iter()
            .map(|cell| cell.addr)
            .chain(borders.keys().copied())
        {
            self.ensure_range_editable(sheet, CellRange::single(addr))
                .map_err(AutoFillError::InvalidGeometry)?;
        }
        if !self
            .insert_rows_for_writes(cells.iter().map(|cell| (sheet, cell.addr)))
            .is_empty()
        {
            self.ensure_workbook_unprotected()
                .map_err(AutoFillError::InvalidGeometry)?;
        }
        Ok(())
    }

    fn apply_fill_plan(
        &mut self,
        sheet: usize,
        plan: FillPlan,
    ) -> Result<AutoFillReport, AutoFillError> {
        let FillPlan {
            cells,
            write_range,
            borders,
        } = plan;
        if write_range.is_none() {
            return Ok(AutoFillReport {
                write_range,
                written: 0,
            });
        }
        let validations: Vec<_> = cells
            .iter()
            .filter_map(|cell| {
                self.sheets[sheet]
                    .data_validation_at(cell.addr)
                    .map(|_| cell.addr)
            })
            .collect();
        // 公式与跨格条件必须读取整批新值；私有回滚事务不会成为用户的额外一条历史。
        let mut rollback = WorkbookHistory::default();
        if !validations.is_empty() {
            rollback
                .begin(self, sheet, write_range.unwrap(), "Validate fill", true)
                .map_err(AutoFillError::InvalidGeometry)?;
            for range in border_plan_ranges(&borders) {
                rollback.capture_extra_formats(self.sheet(sheet).unwrap(), sheet, range);
            }
        }
        let observers: Vec<_> = if validations.is_empty() {
            Vec::new()
        } else {
            self.sheets
                .iter_mut()
                .map(|sheet| sheet.suspend_structure_notifications())
                .collect()
        };
        let store = self.store.clone();
        let mut result = Ok(());
        // 内容、格式与邻格共边在一个 batch 内发布，观察者不看到中间状态。
        store.batch(|_| {
            self.bulk_load(|loader| {
                for cell in &cells {
                    match &cell.value {
                        PlannedValue::Primitive(Value::Null) => {
                            loader.clear_cell_at(sheet, cell.addr)
                        }
                        PlannedValue::Primitive(value) => {
                            loader.set_cell_at(sheet, cell.addr, value.clone())
                        }
                        // 保留既有公式安装路径：循环引用作为 #CYCLE! 落地，而非拒绝整次填充。
                        PlannedValue::Formula(source) => {
                            loader.set_formula_at(sheet, cell.addr, source);
                        }
                    }
                }
            });
            let target = self
                .sheet_mut(sheet)
                .expect("preflighted auto-fill sheet disappeared");
            for cell in &cells {
                target.patch_format_range(
                    CellRange::single(cell.addr),
                    StyleScope::Cell,
                    CellStyle::from_format(cell.format.clone()),
                );
            }
            target.apply_border_plan(borders);
            if !validations.is_empty() {
                self.settle_validation_candidate(sheet, write_range.unwrap());
            }
            result = validations.iter().try_for_each(|addr| {
                let value =
                    crate::sheet::collapse_array_for_eval(self.sheets[sheet].peek_value(*addr));
                self.validate_input_value(sheet, *addr, &value)
            });
            if !validations.is_empty() {
                let valid = result.is_ok();
                if let Err(error) = rollback.finish(self, valid) {
                    result = Err(error);
                }
                if !valid {
                    self.settle_validation_candidate(sheet, write_range.unwrap());
                }
            }
        });
        for (sheet, observer) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result.map_err(AutoFillError::InvalidGeometry)?;
        Ok(AutoFillReport {
            write_range,
            written: cells.len(),
        })
    }
}

impl WorkbookHistory {
    /// 加入现有填充事务，只补实际受影响的样式地址，不把邻格内容纳入回放。
    pub fn apply_auto_fill(
        &mut self,
        workbook: &mut Workbook,
        request: &AutoFillRequest,
    ) -> Result<AutoFillReport, AutoFillError> {
        let plan = workbook.plan_auto_fill(request)?;
        self.apply_planned_fill(workbook, request.sheet_idx, plan)
    }

    // 两种填充入口共用共边快照和最终 batch；多条序列仍只有一次历史。
    fn apply_planned_fill(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        plan: FillPlan,
    ) -> Result<AutoFillReport, AutoFillError> {
        for range in border_plan_ranges(&plan.borders) {
            self.capture_extra_formats(workbook.sheet(sheet).unwrap(), sheet, range);
        }
        workbook.apply_fill_plan(sheet, plan)
    }
}
