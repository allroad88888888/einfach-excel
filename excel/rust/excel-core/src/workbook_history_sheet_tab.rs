//! 隐藏/取消隐藏与页签颜色各占一条原生历史，只保存前后两个元数据值。
use super::*;
use crate::CellAddress;

type TabState = (bool, Option<String>);

#[derive(Debug)]
pub(super) struct SheetTabChange {
    before: TabState,
    after: TabState,
}

impl SheetTabChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        key: u64,
        undo: bool,
    ) -> Result<(), &'static str> {
        workbook.ensure_workbook_unprotected()?;
        if workbook.is_inside_custom_call() || workbook.sheet_key(sheet) != Some(key) {
            return Err("The worksheet changed outside history.");
        }
        let (hidden, color) = if undo { &self.before } else { &self.after };
        workbook.apply_sheet_hidden(sheet, *hidden)?;
        workbook.apply_sheet_tab_color(sheet, color.as_deref())?;
        Ok(())
    }
}

impl WorkbookHistory {
    /// 隐藏最后一张可见表、重复设置同值都不进入历史。
    pub fn set_sheet_hidden(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        hidden: bool,
    ) -> Result<bool, &'static str> {
        self.require_tab_idle(workbook)?;
        let before = tab_state(workbook, sheet)?;
        if !workbook.apply_sheet_hidden(sheet, hidden)? {
            return Ok(false);
        }
        let label = if hidden { "Hide worksheet" } else { "Unhide worksheet" };
        self.push_tab(workbook, sheet, label, before);
        Ok(true)
    }

    pub fn set_sheet_tab_color(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        color: Option<&str>,
    ) -> Result<bool, &'static str> {
        self.require_tab_idle(workbook)?;
        let before = tab_state(workbook, sheet)?;
        if !workbook.apply_sheet_tab_color(sheet, color)? {
            return Ok(false);
        }
        self.push_tab(workbook, sheet, "Set tab color", before);
        Ok(true)
    }

    fn require_tab_idle(&self, workbook: &Workbook) -> Result<(), &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        Ok(())
    }

    fn push_tab(&mut self, workbook: &Workbook, sheet: usize, label: &str, before: TabState) {
        let key = workbook.sheet_key(sheet).unwrap();
        let after = tab_state(workbook, sheet).unwrap();
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet,
            range: CellRange::single(CellAddress::new(0, 0)),
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::SheetTab(SheetTabChange { before, after }),
        });
    }
}

fn tab_state(workbook: &Workbook, sheet: usize) -> Result<TabState, &'static str> {
    workbook.name(sheet).ok_or("The worksheet no longer exists.")?;
    Ok((workbook.sheet_hidden(sheet), workbook.sheet_tab_color(sheet).map(str::to_owned)))
}
