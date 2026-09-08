//! 用户工作表命令进入同一条历史栈；校验失败或无变化不消耗 redo。
use super::*;
use crate::CellAddress;

impl WorkbookHistory {
    pub fn edit_sheet(
        &mut self,
        workbook: &mut Workbook,
        index: Option<usize>,
        name: &str,
    ) -> Result<usize, &'static str> {
        self.require_idle()?;
        let (index, change) = SheetHistoryChange::edit(workbook, index, name)?;
        if let Some(change) = change {
            self.push_sheet(
                workbook,
                index,
                workbook.sheet_key(index).unwrap(),
                workbook.name(index).unwrap().to_owned(),
                if matches!(change, SheetHistoryChange::Rename { .. }) {
                    "Rename worksheet"
                } else {
                    "Add worksheet"
                },
                change,
            );
        }
        Ok(index)
    }

    pub fn remove_sheet(
        &mut self,
        workbook: &mut Workbook,
        index: usize,
    ) -> Result<(), &'static str> {
        self.require_idle()?;
        let key = workbook
            .sheet_key(index)
            .ok_or("The worksheet no longer exists.")?;
        let name = workbook.name(index).unwrap().to_owned();
        let change = SheetHistoryChange::remove(workbook, index)?;
        self.push_sheet(workbook, index, key, name, "Delete worksheet", change);
        Ok(())
    }

    pub fn move_sheet(
        &mut self,
        workbook: &mut Workbook,
        from: usize,
        to: usize,
    ) -> Result<(), &'static str> {
        self.require_idle()?;
        if let Some(change) = SheetHistoryChange::move_to(workbook, from, to)? {
            self.push_sheet(
                workbook,
                to,
                workbook.sheet_key(to).unwrap(),
                workbook.name(to).unwrap().to_owned(),
                "Move worksheet",
                change,
            );
        }
        Ok(())
    }

    fn require_idle(&self) -> Result<(), &'static str> {
        if self.pending.is_some() {
            Err("Another history command is pending.")
        } else {
            Ok(())
        }
    }

    fn push_sheet(
        &mut self,
        workbook: &Workbook,
        index: usize,
        key: u64,
        name: String,
        label: &str,
        change: SheetHistoryChange,
    ) {
        // 结构变化影响引用和拓扑：权限检查覆盖当前工作簿及归档表身份。
        let mut affected_keys: Vec<_> = (0..workbook.sheet_count())
            .filter_map(|i| workbook.sheet_key(i))
            .collect();
        if !affected_keys.contains(&key) {
            affected_keys.push(key);
        }
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet: index,
            sheet_key: key,
            sheet_name: name,
            range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 0)),
            affected_indices: (0..workbook.sheet_count()).collect(),
            affected_keys,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Sheet(Box::new(change)),
        });
    }
}
