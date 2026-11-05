//! 工作表视图选项：网格线与行列标题的显示。随 Sheet 移动、复制、归档与持久化，不进入撤销历史。
use super::*;

/// 默认全部显示；字段记"隐藏"，旧文件与普通表缺省即为显示。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SheetViewOptions {
    pub hide_gridlines: bool,
    pub hide_headings: bool,
}

impl Workbook {
    pub fn sheet_view_options(&self, index: usize) -> SheetViewOptions {
        self.sheets.get(index).map(|sheet| sheet.view).unwrap_or_default()
    }

    /// 返回是否发生变化；自定义函数求值期间不能改工作表。
    pub fn set_sheet_view_options(
        &mut self,
        index: usize,
        options: SheetViewOptions,
    ) -> Result<bool, &'static str> {
        if self.is_inside_custom_call() {
            return Err("Cannot change sheets during a custom formula call.");
        }
        let sheet = self.sheets.get_mut(index).ok_or("The worksheet no longer exists.")?;
        if sheet.view == options {
            return Ok(false);
        }
        sheet.view = options;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_options_default_to_visible_and_report_changes_once() {
        let mut workbook = Workbook::new();
        assert_eq!(workbook.sheet_view_options(0), SheetViewOptions::default());
        let hidden = SheetViewOptions { hide_gridlines: true, hide_headings: false };
        assert_eq!(workbook.set_sheet_view_options(0, hidden), Ok(true));
        assert_eq!(workbook.set_sheet_view_options(0, hidden), Ok(false));
        assert_eq!(workbook.sheet_view_options(0), hidden);
        assert!(workbook.set_sheet_view_options(9, hidden).is_err());
    }

    #[test]
    fn duplicated_sheets_keep_their_view_options() {
        let mut workbook = Workbook::new();
        let hidden = SheetViewOptions { hide_gridlines: true, hide_headings: true };
        workbook.set_sheet_view_options(0, hidden).unwrap();
        let mut history = crate::workbook_history::WorkbookHistory::default();
        let copy = history.duplicate_sheet(&mut workbook, 0).unwrap();
        assert_eq!(workbook.sheet_view_options(copy), hidden);
    }
}
