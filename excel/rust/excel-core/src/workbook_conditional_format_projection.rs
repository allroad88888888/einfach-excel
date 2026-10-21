//! 条件格式仅覆盖返回的显示快照；持久基础样式与格式刷快照保持原样。
use super::conditional_data_bar::DataBarDisplay;
use super::advanced_conditional_format::ConditionalIconDisplay;
use super::conditional_format_rule::{NativeRule, NativeRuleKind};
use super::*;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::FormatRangeSnapshot;

/// 显示快照不能用于格式恢复：数据条只存在于这个读结果，永不进入基础格式快照。
#[derive(Clone, Debug, PartialEq)]
pub struct DisplayFormatRangeSnapshot {
    pub formats: FormatRangeSnapshot,
    pub data_bars: Vec<(CellAddress, DataBarDisplay)>,
    pub conditional_icons: Vec<(CellAddress, ConditionalIconDisplay)>,
}
impl Workbook {
    pub fn snapshot_display_format_range(
        &self,
        sheet: usize,
        range: CellRange,
    ) -> Result<DisplayFormatRangeSnapshot, &'static str> {
        let range = range.normalize();
        if range.end.row >= EXCEL_MAX_ROWS
            || range.end.col >= EXCEL_MAX_COLS
            || u64::from(range.rows()) * u64::from(range.cols()) > 100_000
        {
            return Err("Display formatting reads are limited to a valid 100,000-cell window.");
        }
        let target = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        let mut snapshot = target.snapshot_format_range(range);
        self.project_table_styles(sheet, &mut snapshot);
        let mut rules: Vec<_> = self.conditional_formats[sheet]
            .rules
            .iter()
            .filter(|entry| entry.ranges().any(|area| area.intersects(range)))
            // 旧持久化允许不透明规则。未实现的种类保留原文，不交给 TS 猜着求值。
            .filter_map(|entry| {
                NativeRule::parse(&entry.rule_json)
                    .ok()
                    .filter(NativeRule::enabled)
                    .and_then(|mut rule| {
                        let statistic = rule
                            .statistic()
                            .map(|statistic| {
                                self.conditional_range_statistics(sheet, entry, statistic)
                            })
                            .unwrap_or(Value::Null);
                        rule.resolve(self, sheet, entry, &statistic).then_some((entry, rule, statistic))
                    })
            })
            .collect();
        if rules.is_empty() {
            return Ok(DisplayFormatRangeSnapshot {
                formats: snapshot,
                data_bars: Vec::new(),
                conditional_icons: Vec::new(),
            });
        }
        // 数字较小的优先级更高；同优先级时，列表中较前的规则优先。
        rules.sort_by_key(|(entry, _, _)| entry.priority);
        let mut styles: BTreeMap<_, _> = snapshot
            .cell_styles
            .into_iter()
            .map(|(addr, style)| ((addr.row, addr.col), style))
            .collect();
        let mut data_bars = BTreeMap::new();
        let mut conditional_icons = BTreeMap::new();
        for row in range.start.row..=range.end.row {
            for col in range.start.col..=range.end.col {
                if !rules.iter().any(|(entry, _, _)| entry.contains(row, col)) {
                    continue;
                }
                let value = target.peek_value(CellAddress::new(row, col));
                let scalar = match &value {
                    Value::Array(array) => array.get(0, 0),
                    _ => Some(&value),
                };
                // 先按优先级判断，命中 Stop 后不再求值低级规则；最后逆序合并补丁，
                // 保留既有的“不同属性叠加、相同属性高级优先”语义。
                let mut patches = Vec::new();
                for (entry, rule, statistic) in &rules {
                    if !entry.contains(row, col) {
                        continue;
                    }
                    let matched = match &rule.kind {
                        NativeRuleKind::Numeric(rule) => matches!(scalar,
                            Some(Value::Number(number)) if rule.matches(*number)),
                        NativeRuleKind::Rank(rule) => matches!(scalar,
                            Some(Value::Number(number)) if rule.matches(*number,
                                if let Value::Number(threshold) = statistic { Some(*threshold) } else { None })),
                        NativeRuleKind::Text(rule) => matches!(scalar,
                            Some(Value::Text(text)) if rule.matches(text)),
                        NativeRuleKind::Duplicates(rule) => {
                            scalar.is_some_and(|value| rule.matches(value, statistic,
                                &target.base_format_at(CellAddress::new(row, col))))
                        }
                        NativeRuleKind::Formula(rule) => rule.matches(
                            self,
                            sheet,
                            CellAddress::new(entry.row_start, entry.col_start),
                            CellAddress::new(row, col),
                        ),
                        NativeRuleKind::ColorScale(rule) => {
                            if let Some(Value::Number(number)) = scalar {
                                if number.is_finite() {
                                    patches.push(rule.style(*number));
                                }
                            }
                            false
                        }
                        NativeRuleKind::DataBar(rule) => {
                            if let Some(Value::Number(number)) = scalar {
                                if number.is_finite() {
                                    data_bars
                                        .entry((row, col))
                                        .or_insert_with(|| rule.display(*number));
                                }
                            }
                            false
                        }
                        NativeRuleKind::IconSet(rule) => {
                            if let Some(Value::Number(number)) = scalar {
                                if number.is_finite() {
                                    conditional_icons.entry((row, col)).or_insert_with(|| rule.display(*number));
                                }
                            }
                            false
                        }
                    };
                    if matched {
                        patches.push(rule.style().expect("matched highlight rule").clone());
                        if rule.stop_if_true {
                            break;
                        }
                    }
                }
                for patch in patches.iter().rev() {
                    styles.entry((row, col)).or_default().apply_patch(patch);
                }
            }
        }
        self.store.settle_pending_reads();
        snapshot.cell_styles = styles
            .into_iter()
            .map(|((row, col), style)| (CellAddress::new(row, col), style))
            .collect();
        Ok(DisplayFormatRangeSnapshot {
            formats: snapshot,
            data_bars: data_bars
                .into_iter()
                .map(|((row, col), bar)| (CellAddress::new(row, col), bar))
                .collect(),
            conditional_icons: conditional_icons.into_iter()
                .map(|((row, col), icon)| (CellAddress::new(row, col), icon)).collect(),
        })
    }
}
