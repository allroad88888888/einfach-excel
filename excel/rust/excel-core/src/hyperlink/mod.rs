//! 超链接只保存地址；显示文字仍是原有单元格值，不建立第二份内容模型。
use crate::{CellAddress, CellRange, Sheet};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod clipboard_tests;

pub const MAX_HYPERLINK_BYTES: usize = 8192;

/// 统一用于用户写入和文件恢复；禁止脚本、相对地址及含身份凭据的链接。
pub fn normalize_url(input: &str) -> Result<String, &'static str> {
    let input = input.trim();
    if input.is_empty() || input.len() > MAX_HYPERLINK_BYTES
        || input.chars().any(|c| c.is_control()) || input.contains('\\') {
        return Err("Enter a valid http:// or https:// address.");
    }
    let url = url::Url::parse(input)
        .map_err(|_| "Enter a valid http:// or https:// address.")?;
    if !matches!(url.scheme(), "http" | "https") || !url.has_host()
        || !url.username().is_empty() || url.password().is_some()
        || url.as_str().len() > MAX_HYPERLINK_BYTES {
        return Err("Enter a valid http:// or https:// address.");
    }
    Ok(url.into())
}

impl Sheet {
    pub fn hyperlink(&self, addr: CellAddress) -> Option<&str> {
        self.hyperlinks.get(&addr).map(String::as_str)
    }

    /// 单格读只查当前格；大范围快照只枚举已有链接，不遍历空画布。
    pub fn hyperlinks_in_range(&self, range: CellRange) -> Vec<(CellAddress, String)> {
        if range.start == range.end {
            return self.hyperlinks.get(&range.start)
                .map(|url| vec![(range.start, url.clone())]).unwrap_or_default();
        }
        let mut links: Vec<_> = self.hyperlinks.iter()
            .filter(|(addr, _)| range.contains(**addr))
            .map(|(addr, url)| (*addr, url.clone())).collect();
        links.sort_by_key(|(addr, _)| (addr.row, addr.col));
        links
    }

    /// 初始化、恢复也走同一校验；调用者负责用户操作的历史边界。
    pub fn set_hyperlink(&mut self, addr: CellAddress, url: Option<&str>) -> Result<bool, &'static str> {
        if addr.row >= crate::sheet::EXCEL_MAX_ROWS || addr.col >= crate::sheet::EXCEL_MAX_COLS {
            return Err("The hyperlink cell is outside the worksheet.");
        }
        let next = url.map(normalize_url).transpose()?;
        if self.hyperlink(addr) == next.as_deref() { return Ok(false); }
        if let Some(url) = next { self.hyperlinks.insert(addr, url); }
        else { self.hyperlinks.remove(&addr); }
        Ok(true)
    }

    pub(crate) fn restore_hyperlinks(&mut self, range: CellRange, links: &[(CellAddress, String)]) {
        if range.start == range.end { self.hyperlinks.remove(&range.start); }
        else { self.hyperlinks.retain(|addr, _| !range.contains(*addr)); }
        self.hyperlinks.extend(links.iter().cloned());
    }
}
