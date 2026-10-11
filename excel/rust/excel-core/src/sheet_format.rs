//! 解析 cellStyle、rowStyle、columnStyle 得到最终显示格式。

use super::*;

impl Sheet {
    /// 将已有显式属性盖在 Table 默认样式上；不改变三层存储和最后一次写入规则。
    pub(crate) fn apply_base_style_at(&self, addr: CellAddress, style: &mut crate::CellStyle) {
        if let Some(column) = self.column_styles.get(&addr.col) { style.apply_patch(column); }
        if let Some(row) = self.row_styles.get(&addr.row) { style.apply_patch(&row.format); }
        if let Some(cell) = self.cell_styles.get(&addr) { style.apply_patch(cell); }
    }

    /// 样式元数据改变时只通知已订阅的可见格，不扫描 Table 的全部数据格。
    pub(crate) fn notify_format_range(&self, range: CellRange) {
        for addr in self.cell_subscriptions.keys().filter(|addr| range.contains(**addr)) {
            self.notify_address_subscribers(*addr);
        }
    }

    pub(crate) fn base_format_at(&self, addr: CellAddress) -> CellFormat {
        let mut format = CellFormat::default();
        if let Some(style) = self.column_styles.get(&addr.col) {
            style.apply_to(&mut format);
        }
        if let Some(style) = self.row_styles.get(&addr.row) {
            style.format.apply_to(&mut format);
        }
        if let Some(style) = self.cell_styles.get(&addr) {
            style.apply_to(&mut format);
        }
        format
    }

    /// 读取基础格式；不叠加条件格式。
    pub fn get_format(&self, addr_str: &str) -> CellFormat {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.base_format_at(addr)
    }

    /// 读取最终格式；条件格式最后覆盖基础格式。
    pub fn effective_format(&self, addr_str: &str) -> CellFormat {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        let base = self.base_format_at(addr);
        if self.conditional_rules.is_empty() {
            return base;
        }
        let value = self.peek_value(addr);
        apply_rules(&base, &self.conditional_rules, &value)
    }

    pub fn set_conditional_rules(&mut self, rules: Vec<ConditionalRule>) {
        self.conditional_rules = rules;
        let addrs: Vec<CellAddress> = self.cell_subscriptions.keys().copied().collect();
        for addr in addrs {
            self.notify_address_subscribers(addr);
        }
    }

    pub fn conditional_rules(&self) -> &[ConditionalRule] {
        &self.conditional_rules
    }

    pub fn formatted_display(&self, addr_str: &str) -> String {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        let value = collapse_array_for_eval(self.peek_value(addr));
        match &value {
            Value::Number(n) => self.effective_format(addr_str).format_number(*n),
            Value::Text(s) => s.clone(),
            Value::Boolean(b) => if *b { "TRUE" } else { "FALSE" }.into(),
            Value::Null => String::new(),
            Value::Error(e) => crate::error_display_token(e).into_owned(),
            Value::Array(_) | Value::Lambda(_) => String::new(),
        }
    }
}
