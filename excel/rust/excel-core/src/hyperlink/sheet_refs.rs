//! 工作表重命名时自动改写内部跳转超链接的表名前缀，并支持精确撤销/重做恢复。
use crate::formula::parse_formula;
use crate::workbook::rewrite_sheet_refs;
use crate::{render_formula, CellAddress, Workbook};
use std::collections::BTreeSet;

pub type HyperlinkSheetSnapshot = Vec<(usize, CellAddress, String)>;

/// 将单个内部超链接中的旧表名改写为新表名；表删除时不改写为 `#REF!`，保留原串供提示目标不存在。
pub(crate) fn rewrite_hyperlink_sheet_ref(url: &str, old: &str, new: &str) -> Option<String> {
    let body = url.strip_prefix('#')?;
    if !body.contains('!') {
        return None;
    }
    let mut expr = parse_formula(&format!("={body}"))?;
    let original = expr.clone();
    rewrite_sheet_refs(&mut expr, old, Some(new));
    (expr != original).then(|| format!("#{}", &render_formula(&expr)[1..]))
}

impl Workbook {
    /// 若内部超链接引用的工作表已存在（忽略大小写），统一规范为当前工作表的精确表名大小写。
    pub(crate) fn canonicalize_hyperlink_sheet_case(&self, url: &str) -> String {
        let Some(body) = url.strip_prefix('#') else {
            return url.to_owned();
        };
        if !body.contains('!') {
            return url.to_owned();
        }
        let Some(mut expr) = parse_formula(&format!("={body}")) else {
            return url.to_owned();
        };
        for actual in &self.names {
            rewrite_sheet_refs(&mut expr, actual, Some(actual));
        }
        format!("#{}", &render_formula(&expr)[1..])
    }

    pub(crate) fn hyperlink_sheet_ref_rewrites(
        &self,
        old: &str,
        new: &str,
    ) -> HyperlinkSheetSnapshot {
        let mut writes = Vec::new();
        for (idx, sheet) in self.sheets.iter().enumerate() {
            let mut entries: Vec<_> = sheet
                .hyperlinks
                .iter()
                .filter_map(|(&addr, url)| {
                    rewrite_hyperlink_sheet_ref(url, old, new).map(|next| (idx, addr, next))
                })
                .collect();
            entries.sort_by_key(|(_, addr, _)| (addr.row, addr.col));
            writes.extend(entries);
        }
        writes
    }

    pub(crate) fn capture_hyperlink_sheet_refs(
        &self,
        before: &str,
        after: &str,
    ) -> BTreeSet<(usize, u32, u32)> {
        self.hyperlink_sheet_ref_rewrites(before, after)
            .into_iter()
            .chain(self.hyperlink_sheet_ref_rewrites(after, before))
            .map(|(sheet, addr, _)| (sheet, addr.row, addr.col))
            .collect()
    }

    pub(crate) fn snapshot_hyperlinks_at(
        &self,
        coords: &BTreeSet<(usize, u32, u32)>,
    ) -> HyperlinkSheetSnapshot {
        coords
            .iter()
            .filter_map(|&(sheet, row, col)| {
                let addr = CellAddress::new(row, col);
                let url = self.sheets.get(sheet)?.hyperlink(addr)?;
                Some((sheet, addr, url.to_owned()))
            })
            .collect()
    }

    pub(crate) fn apply_hyperlink_sheet_snapshot(&mut self, snapshot: &[(usize, CellAddress, String)]) {
        for (sheet, addr, url) in snapshot {
            if let Some(target) = self.sheets.get_mut(*sheet) {
                target.hyperlinks.insert(*addr, url.clone());
            }
        }
    }
}
