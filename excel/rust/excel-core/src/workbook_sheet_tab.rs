//! 页签隐藏与颜色：工作表元数据，由 Rust 校验，随 Sheet 移动、归档与持久化。
use super::*;

pub const SHEET_TAB_LAST_VISIBLE: &str = "Keep at least one worksheet visible.";
const SHEET_TAB_BAD_COLOR: &str = "Tab color must be #RRGGBB.";

/// 规范化为大写 `#RRGGBB`；其它写法一律拒绝，避免把任意字符串带进文件和样式。
pub fn normalize_tab_color(color: &str) -> Result<String, &'static str> {
    let bytes = color.as_bytes();
    if bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        Ok(color.to_ascii_uppercase())
    } else {
        Err(SHEET_TAB_BAD_COLOR)
    }
}

impl Workbook {
    pub fn sheet_hidden(&self, index: usize) -> bool {
        self.sheets.get(index).is_some_and(|sheet| sheet.tab_hidden)
    }

    pub fn sheet_tab_color(&self, index: usize) -> Option<&str> {
        self.sheets.get(index)?.tab_color.as_deref()
    }

    pub fn visible_sheet_count(&self) -> usize {
        self.sheets.iter().filter(|sheet| !sheet.tab_hidden).count()
    }

    /// 返回是否发生变化；最后一张可见表永远不能被隐藏。
    pub(crate) fn apply_sheet_hidden(
        &mut self,
        index: usize,
        hidden: bool,
    ) -> Result<bool, &'static str> {
        self.ensure_tab_editable(index)?;
        if self.sheets[index].tab_hidden == hidden {
            return Ok(false);
        }
        if hidden && self.visible_sheet_count() <= 1 {
            return Err(SHEET_TAB_LAST_VISIBLE);
        }
        self.sheets[index].tab_hidden = hidden;
        Ok(true)
    }

    pub(crate) fn apply_sheet_tab_color(
        &mut self,
        index: usize,
        color: Option<&str>,
    ) -> Result<bool, &'static str> {
        self.ensure_tab_editable(index)?;
        let color = color.map(normalize_tab_color).transpose()?;
        if self.sheets[index].tab_color == color {
            return Ok(false);
        }
        self.sheets[index].tab_color = color;
        Ok(true)
    }

    /// 持久化恢复：逐表写入后由调用者再确认至少一张可见。
    pub fn restore_sheet_tab(
        &mut self,
        index: usize,
        hidden: bool,
        color: Option<&str>,
    ) -> Result<(), &'static str> {
        let color = color.map(normalize_tab_color).transpose()?;
        let sheet = self.sheets.get_mut(index).ok_or("The worksheet no longer exists.")?;
        sheet.tab_hidden = hidden;
        sheet.tab_color = color;
        Ok(())
    }

    fn ensure_tab_editable(&self, index: usize) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("Cannot change sheets during a custom formula call.");
        }
        self.ensure_workbook_unprotected()?;
        if index >= self.sheets.len() {
            return Err("The worksheet no longer exists.");
        }
        Ok(())
    }
}
