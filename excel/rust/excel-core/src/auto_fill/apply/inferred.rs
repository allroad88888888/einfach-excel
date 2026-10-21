//! 每条行／列独立推断，全部预检通过才统一写入；不把多条序列拆成多次事务。
use super::*;

impl Workbook {
    pub fn apply_inferred_auto_fill(
        &mut self,
        request: &AutoFillRequest,
    ) -> Result<AutoFillReport, AutoFillError> {
        let plan = self.plan_inferred_auto_fill(request)?;
        self.apply_fill_plan(request.sheet_idx, plan)
    }

    fn plan_inferred_auto_fill(
        &self,
        request: &AutoFillRequest,
    ) -> Result<FillPlan, AutoFillError> {
        // 整体预算先于拆条；不能用许多合法小范围绕过单次填充上限。
        validate_geometry(request)?;
        let vertical = matches!(
            request.direction,
            AutoFillDirection::Up | AutoFillDirection::Down
        );
        let source = request.source_range;
        let (start, end) = if vertical {
            (source.start.col, source.end.col)
        } else {
            (source.start.row, source.end.row)
        };
        let mut cells = Vec::new();
        for index in start..=end {
            let mut lane = request.clone();
            if vertical {
                lane.source_range.start.col = index;
                lane.source_range.end.col = index;
                lane.target_range.start.col = index;
                lane.target_range.end.col = index;
            } else {
                lane.source_range.start.row = index;
                lane.source_range.end.row = index;
                lane.target_range.start.row = index;
                lane.target_range.end.row = index;
            }
            // 未识别的单条回落复制；已识别的溢出必须拒绝整批，不能吞错。
            let lane = self.infer_auto_fill_request(lane)?;
            cells.extend(self.plan_auto_fill(&lane)?.cells);
        }
        // 相邻条的边框必须一起计划，否则某一条会覆盖另一条的共边结果。
        let sheet = self
            .sheet(request.sheet_idx)
            .ok_or(AutoFillError::SheetOutOfRange)?;
        let borders = sheet.plan_replacement_borders(
            cells
                .iter()
                .map(|cell| (cell.addr, cell.format.borders.clone())),
            sheet.merged_ranges(),
        );
        self.ensure_fill_protection(request.sheet_idx, &cells, &borders)?;
        Ok(FillPlan {
            cells,
            write_range: fill_write_range(request),
            borders,
        })
    }
}

impl WorkbookHistory {
    pub fn apply_inferred_auto_fill(
        &mut self,
        workbook: &mut Workbook,
        request: &AutoFillRequest,
    ) -> Result<AutoFillReport, AutoFillError> {
        let plan = workbook.plan_inferred_auto_fill(request)?;
        self.apply_planned_fill(workbook, request.sheet_idx, plan)
    }
}
