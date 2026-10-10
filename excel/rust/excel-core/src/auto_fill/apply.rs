//! 填充的一次预检与原子应用；普通调用和历史入口共用同一计划。
use super::*;
use crate::{
    sheet::{border_plan_range, BorderPlan},
    workbook_history::WorkbookHistory,
    CellStyle, StyleScope,
};

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
        Ok(self.apply_fill_plan(request.sheet_idx, plan))
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
        Ok(FillPlan {
            cells,
            write_range,
            borders,
        })
    }

    fn apply_fill_plan(&mut self, sheet: usize, plan: FillPlan) -> AutoFillReport {
        let FillPlan {
            cells,
            write_range,
            borders,
        } = plan;
        if write_range.is_none() {
            return AutoFillReport {
                write_range,
                written: 0,
            };
        }
        let store = self.store.clone();
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
        });
        AutoFillReport {
            write_range,
            written: cells.len(),
        }
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
        if let Some(range) = border_plan_range(&plan.borders) {
            self.capture_extra_formats(
                workbook.sheet(request.sheet_idx).unwrap(),
                request.sheet_idx,
                range,
            );
        }
        Ok(workbook.apply_fill_plan(request.sheet_idx, plan))
    }
}
