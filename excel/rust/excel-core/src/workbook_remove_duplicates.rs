//! 删除重复项的只读计划：在 Rust 比较完整范围，只向视图返回有限样本。
use std::collections::HashMap;
use crate::{CellAddress, CellRange, Sheet, Workbook};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DuplicateComparison { Exact, IgnoreCase, Trim, TrimIgnoreCase }

#[derive(Clone, Debug)]
pub struct RemoveDuplicatesRequest {
    pub sheet: usize,
    pub range: CellRange,
    /// 工作表绝对列号；比较键的顺序不改变结果。
    pub columns: Vec<u32>,
    pub has_header: bool,
    pub comparison: DuplicateComparison,
    pub row_count: u32,
    pub col_count: u32,
}

#[derive(Debug, PartialEq, Eq)]
pub struct DuplicateSample {
    pub row: u32,
    pub first_row: u32,
    pub values: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct RemoveDuplicatesPreview {
    pub scanned_rows: usize,
    pub removed_rows: usize,
    pub unique_rows: usize,
    pub excluded_rows: usize,
    pub headers: Vec<String>,
    /// 重复记录列表中的偏移量，不是工作表行号。
    pub sample_offset: usize,
    pub sample: Vec<DuplicateSample>,
    pub sample_truncated: bool,
}

pub(crate) struct RemoveDuplicatesPlan {
    pub preview: RemoveDuplicatesPreview,
    pub slots: Vec<u32>,
    pub kept: Vec<u32>,
}

impl Workbook {
    pub fn preview_remove_duplicates(&self, request: &RemoveDuplicatesRequest)
        -> Result<RemoveDuplicatesPreview, &'static str> {
        self.preview_remove_duplicates_page(request, 0)
    }

    /// 每页最多 20 条；仍扫描完整数据域，首条保留记录不随页码变化。
    pub fn preview_remove_duplicates_page(&self, request: &RemoveDuplicatesRequest, offset: usize)
        -> Result<RemoveDuplicatesPreview, &'static str> {
        let result = self.plan_remove_duplicates(request, offset);
        self.store.settle_pending_reads();
        result.map(|plan| plan.preview)
    }

    pub(crate) fn plan_remove_duplicates(&self, request: &RemoveDuplicatesRequest, offset: usize)
        -> Result<RemoveDuplicatesPlan, &'static str> {
        if offset > 100_000 { return Err("Invalid preview page. Update the preview."); }
        let range = request.range;
        if request.row_count == 0 || request.row_count > EXCEL_MAX_ROWS || request.col_count == 0
            || request.col_count > EXCEL_MAX_COLS || range.start.row > range.end.row
            || range.start.col > range.end.col || range.end.row >= request.row_count
            || range.end.col >= request.col_count {
            return Err("Select a range within the worksheet.");
        }
        if range.rows() <= u32::from(request.has_header) {
            return Err("Select at least one data row.");
        }
        if range.rows() as usize * range.cols() as usize > 100_000 || range.cols() > 256 {
            return Err("Choose at most 100,000 cells and 256 columns.");
        }
        let mut columns = request.columns.clone();
        columns.sort_unstable();
        if columns.is_empty() || columns.windows(2).any(|pair| pair[0] == pair[1])
            || columns.iter().any(|col| *col < range.start.col || *col > range.end.col) {
            return Err("Choose different comparison columns inside the selected range.");
        }
        let sheet = self.sheet(request.sheet).ok_or("Worksheet no longer exists.")?;
        check_geometry(sheet, range)?;
        let mut truncated = false;
        let headers = (range.start.col..=range.end.col).map(|col| {
            if request.has_header {
                sample_text(sheet.formatted_display(&CellAddress::new(range.start.row, col).to_string()), &mut truncated)
            } else { String::new() }
        }).collect();
        let start = range.start.row + u32::from(request.has_header);
        let mut slots = Vec::new();
        let mut kept = Vec::new();
        let mut sample = Vec::new();
        let mut seen = HashMap::<Vec<String>, u32>::new();
        let mut bytes = 0usize;
        let mut excluded_rows = 0;
        for row in start..=range.end.row {
            // 只跳过原生筛掉行；手动隐藏并不改变数据域。
            if sheet.filter_hidden_set().is_some_and(|hidden| hidden.contains(&row)) {
                excluded_rows += 1;
                continue;
            }
            slots.push(row);
            let key: Vec<String> = columns.iter().map(|col| {
                let display = sheet.formatted_display(&CellAddress::new(row, *col).to_string());
                let text = match request.comparison {
                    DuplicateComparison::Trim | DuplicateComparison::TrimIgnoreCase => display.trim(),
                    _ => &display,
                };
                match request.comparison {
                    DuplicateComparison::IgnoreCase | DuplicateComparison::TrimIgnoreCase => text.to_lowercase(),
                    _ => text.to_owned(),
                }
            }).collect();
            bytes = bytes.saturating_add(key.iter().map(|text| text.len() + 24).sum::<usize>());
            if bytes > 32 * 1024 * 1024 { return Err("Comparison exceeds 32 MiB. Choose a smaller range."); }
            if let Some(&first_row) = seen.get(&key) {
                let duplicate_index = slots.len() - kept.len() - 1;
                if duplicate_index >= offset && sample.len() < 20 {
                    truncated |= range.cols() > 12;
                    let values = (range.start.col..=range.end.col).take(12).map(|col| {
                        sample_text(sheet.formatted_display(&CellAddress::new(row, col).to_string()), &mut truncated)
                    }).collect();
                    sample.push(DuplicateSample { row, first_row, values });
                } else { truncated = true; }
            } else {
                seen.insert(key, row);
                kept.push(row);
            }
        }
        // 读取惰性公式可能刚产生数组投影；写入前再检查一次最终几何。
        check_geometry(sheet, range)?;
        if offset > 0 && offset >= slots.len() - kept.len() {
            return Err("This preview page no longer exists. Update the preview.");
        }
        Ok(RemoveDuplicatesPlan {
            preview: RemoveDuplicatesPreview {
                scanned_rows: slots.len(), removed_rows: slots.len() - kept.len(),
                unique_rows: kept.len(), excluded_rows, headers, sample_offset: offset,
                sample, sample_truncated: truncated,
            }, slots, kept,
        })
    }
}

fn sample_text(text: String, truncated: &mut bool) -> String {
    let mut chars = text.chars();
    let value = chars.by_ref().take(120).collect();
    *truncated |= chars.next().is_some();
    value
}

fn check_geometry(sheet: &Sheet, range: CellRange) -> Result<(), &'static str> {
    if sheet.merged_ranges().iter().any(|merged| merged.intersects(range)) {
        return Err("Unmerge cells before removing duplicates.");
    }
    if sheet.spill_intersecting(range).is_some() {
        return Err("Cannot remove duplicates through a spilled array.");
    }
    Ok(())
}
