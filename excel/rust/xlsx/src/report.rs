//! XLSX ⇄ 原生工作簿转换中的丢弃项与降级项报告。
//! 既返回结构化计数（`items`），也返回可直接作为 UI 提示的英文摘要（`summary`）。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConversionReport {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<ReportItem>,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReportItem {
    pub kind: String,
    pub count: usize,
}

/// 收集导入或导出时被跳过/降级的内容。
#[derive(Debug, Default)]
pub struct ReportBuilder {
    counts: BTreeMap<&'static str, usize>,
}

const IMPORT_ORDER: &[(&str, &str)] = &[
    ("date1904", "1904 date system"),
    ("drawings", "images or drawings"),
    ("charts", "charts"),
    ("pivotTables", "pivot tables"),
    ("threadedComments", "threaded comments"),
    ("conditionalFormats", "unsupported conditional formats"),
    ("dataValidations", "unsupported data validations"),
    ("definedNames", "unsupported defined names"),
    ("hyperlinks", "unsupported hyperlinks"),
    ("richText", "rich text formatting"),
    ("tables", "table filters or totals"),
    ("sheetProtection", "sheet protection"),
    ("autoFilter", "auto filters"),
    ("outline", "outline grouping"),
    ("printSetup", "print settings"),
    ("themeFonts", "theme fonts"),
    ("externalLinks", "external links"),
    ("macros", "macros"),
];

const EXPORT_ORDER: &[(&str, &str)] = &[
    ("threadedCommentsAsNotes", "threaded comments exported as notes"),
    ("conditionalFormats", "unsupported conditional formats"),
    ("dataValidations", "unsupported data validations"),
    ("definedNames", "broken defined names"),
    ("tables", "unsupported tables"),
    ("rowColumnStyles", "row or column styles"),
    ("cellRotation", "text rotation"),
    ("sheetProtection", "sheet protection"),
    ("autoFilter", "filters"),
    ("outline", "outline grouping"),
    ("printSetup", "print settings"),
    ("customFormulas", "custom formulas"),
    ("sheetVisibilityOrColor", "sheet visibility or tab colors"),
];

impl ReportBuilder {
    pub fn add(&mut self, kind: &'static str, count: usize) {
        if count > 0 {
            *self.counts.entry(kind).or_insert(0) += count;
        }
    }

    pub fn has(&self, kind: &'static str) -> bool {
        self.counts.get(kind).is_some_and(|&c| c > 0)
    }

    pub fn finish_import(self) -> ConversionReport {
        self.finish(IMPORT_ORDER, "Opened Excel workbook. Skipped: ")
    }

    pub fn finish_export(self) -> ConversionReport {
        self.finish(EXPORT_ORDER, "Download requested. Not exported to Excel: ")
    }

    fn finish(self, order: &[(&'static str, &'static str)], prefix: &str) -> ConversionReport {
        let mut items = Vec::new();
        let mut labels = Vec::new();
        for &(kind, label) in order {
            if let Some(&count) = self.counts.get(kind).filter(|&&c| c > 0) {
                items.push(ReportItem { kind: kind.into(), count });
                labels.push(label);
            }
        }
        let summary = if labels.is_empty() {
            String::new()
        } else {
            format!("{prefix}{}.", labels.join(", "))
        };
        ConversionReport { items, summary }
    }
}
