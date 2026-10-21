//! 插入、修改、移除共享一个原生事务；地址不参与字体/颜色的层级继承。
use super::*;
use crate::CellAddress;
use einfach_core::Value;

impl WorkbookHistory {
    pub fn change_hyperlink(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        addr: CellAddress,
        url: Option<&str>,
        text: Option<&str>,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let range = CellRange::single(addr);
        validate_target(workbook, sheet, range)?;
        let url = url.map(crate::hyperlink::normalize_url).transpose()?;
        let target = workbook.sheet(sheet).unwrap();
        if target
            .spill_anchor_for(addr)
            .is_some_and(|anchor| anchor != addr)
            || target
                .merged_range_at(addr)
                .is_some_and(|range| range.start != addr)
        {
            return Err("Select the anchor cell before changing its hyperlink.");
        }
        let text = if url.is_some() { text } else { None };
        if text.is_some_and(|text| text.len() > 32767 || text.contains('\0')) {
            return Err("The hyperlink display text is too long or invalid.");
        }
        let value = text.map(|text| Value::Text(text.to_owned()));
        if value.is_some() {
            // Table 表头/计算列的语义入口不同，不绕过它们直接改原始内容。
            if workbook.list_tables().iter().any(|entry| {
                Some(entry.sheet_name()) == workbook.name(sheet) && entry.range().contains(addr)
            }) {
                return Err("Edit the table cell text before changing its hyperlink.");
            }
        }
        let same_text = value.as_ref().is_none_or(|value| {
            target.formula_text_at(addr).is_none() && target.peek_value(addr) == *value
        });
        if target.hyperlink(addr) == url.as_deref() && same_text {
            return Ok(false);
        }
        let label = if url.is_none() {
            "Remove hyperlink"
        } else if target.hyperlink(addr).is_some() {
            "Edit hyperlink"
        } else {
            "Insert hyperlink"
        };
        self.begin(workbook, sheet, range, label, true)?;
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = (|| {
                if let Some(value) = value {
                    workbook.apply_validated_input(sheet, addr, |book| {
                        book.try_set_cell(sheet, &addr.to_string(), value)
                            .map_err(|_| "Could not update the hyperlink display text.")
                    })?;
                }
                workbook
                    .sheet_mut(sheet)
                    .unwrap()
                    .set_hyperlink(addr, url.as_deref())?;
                Ok(())
            })();
            if let Err(error) = self.finish(workbook, result.is_ok()) {
                result = Err(error);
            }
        });
        result.map(|()| true)
    }
}
