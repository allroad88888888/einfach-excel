//! 用户工作表命令：命名校验由 Rust 统一执行，失败时不改变拓扑。
use super::*;

impl Workbook {
    pub fn edit_sheet(&mut self, index: Option<usize>, name: &str) -> Result<usize, &'static str> {
        if self.is_inside_custom_call() {
            return Err("Cannot change sheets during a custom formula call.");
        }
        if index.is_some_and(|idx| idx >= self.sheet_count()) {
            return Err("The worksheet no longer exists.");
        }
        let name = name.trim();
        if name.eq_ignore_ascii_case("History") {
            return Err("History is a reserved worksheet name.");
        }
        if name.is_empty() || name.encode_utf16().count() > 31 {
            return Err("Sheet names must contain 1 to 31 characters.");
        }
        if name
            .chars()
            .any(|c| c.is_control() || "[]:*?/\\".contains(c))
            || name.starts_with('\'')
            || name.ends_with('\'')
        {
            return Err("Sheet names cannot contain []:*?/\\ or begin/end with an apostrophe.");
        }
        if self.names.iter().enumerate().any(|(idx, current)| {
            Some(idx) != index && current.to_lowercase() == name.to_lowercase()
        }) {
            return Err("A worksheet with this name already exists.");
        }
        match index {
            Some(idx) => {
                if self.name(idx) != Some(name) && !self.rename_sheet(idx, name) {
                    return Err("Could not rename the worksheet.");
                }
                Ok(idx)
            }
            None => Ok(self.add_sheet(name)),
        }
    }
}
