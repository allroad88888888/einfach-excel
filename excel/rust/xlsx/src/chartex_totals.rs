//! 瀑布图哪些类别是汇总柱：与插件 `plugins/plugin-chart/src/core/convert/waterfall.ts` 的 `TOTAL_NAME` 一致。
//! 导出时据此写 `cx:subtotals`；导入时用它核对 Excel 的汇总下标。

const NAMES: [&str; 8] = ["total", "subtotal", "sum", "合计", "总计", "小计", "总额", "汇总"];

/// 去掉首尾空白后整词等于汇总名（英文不分大小写）。
pub fn is_total_name(name: &str) -> bool {
    let name = name.trim().to_lowercase();
    NAMES.contains(&name.as_str())
}

/// 类别名里汇总柱的下标（升序）。
pub fn total_indices<'a>(names: impl IntoIterator<Item = Option<&'a str>>) -> Vec<usize> {
    names.into_iter().enumerate().filter(|(_, name)| name.is_some_and(is_total_name)).map(|(index, _)| index).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_plugin_total_names() {
        for name in ["Total", " subtotal ", "SUM", "合计", "总计", "小计", "总额", "汇总"] {
            assert!(is_total_name(name), "{name}");
        }
        for name in ["Totals", "Q1 total", "", "Start"] {
            assert!(!is_total_name(name), "{name}");
        }
        assert_eq!(total_indices([Some("a"), Some("Total"), None, Some("合计")]), vec![1, 3]);
    }
}
