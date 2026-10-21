//! 高级验证通过真实输入/粘贴/填充事务，拒绝值不泄漏内容或历史。
use einfach_core::Value;
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook::advanced_validation::{
    AdvancedValidationOptions, ValidationErrorAlert, ValidationErrorStyle, ValidationMessage,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};

#[path = "advanced_validation/atomic.rs"]
mod atomic;
#[path = "advanced_validation/candidate_observers.rs"]
mod candidate_observers;
#[path = "advanced_validation/candidate_shape.rs"]
mod candidate_shape;
#[path = "advanced_validation/confirmation.rs"]
mod confirmation;
#[path = "advanced_validation/fill_history.rs"]
mod fill_history;
#[path = "advanced_validation/formulas.rs"]
mod formulas;
#[path = "advanced_validation/repeated_references.rs"]
mod repeated_references;
#[path = "advanced_validation/table_candidate_rows.rs"]
mod table_candidate_rows;
#[path = "advanced_validation/table_structure.rs"]
mod table_structure;
#[path = "advanced_validation/topology.rs"]
mod topology;

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}
fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end))
}
fn formula(source: &str, anchor: &str) -> DataValidationRule {
    DataValidationRule {
        kind: DataValidationKind::CustomFormula {
            formula: source.into(),
            anchor: addr(anchor),
        },
        ignore_blank: false,
        operator: Default::default(),
        options: Default::default(),
    }
}
fn alert(mut rule: DataValidationRule, style: ValidationErrorStyle) -> DataValidationRule {
    rule.options = AdvancedValidationOptions {
        error_alert: Some(ValidationErrorAlert {
            style,
            title: "Check quantity".into(),
            message: "请输入有效数量".into(),
        }),
        input_message: Some(ValidationMessage {
            title: "Quantity".into(),
            message: "Positive quantity".into(),
        }),
    };
    rule
}
fn install(book: &mut Workbook, target: CellRange, rule: DataValidationRule) {
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(target, Some(rule))
        .unwrap();
}
fn fill() -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: range("A1", "A1"),
        target_range: range("A1", "A3"),
        direction: AutoFillDirection::Down,
        series: AutoFillSeries::Copy,
        step: None,
        text_pattern: None,
        list: None,
    }
}
