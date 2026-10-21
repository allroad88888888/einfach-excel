//! 自定义验证与显式继续复用真实输入事务；没有历史/内容的第二份镜像。
use super::*;
use crate::data_validation::DataValidationKind;

mod formula;
mod input_transaction;
pub mod options;
mod references;
mod sources;
pub use options::{
    AdvancedValidationOptions, ValidationErrorAlert, ValidationErrorStyle, ValidationMessage,
};
pub(crate) use sources::ValidationRuleSources;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationFailure {
    pub sheet: usize,
    pub row: u32,
    pub col: u32,
    pub style: ValidationErrorStyle,
    pub title: String,
    pub message: String,
}

struct ConfirmationScope {
    state: Rc<Cell<bool>>,
    previous: bool,
}
impl Drop for ConfirmationScope {
    fn drop(&mut self) {
        self.state.set(self.previous);
    }
}

impl Workbook {
    /// 错误详情被消费一次；后续失败不能借用旧单元格的提示文字。
    pub fn take_validation_failure(&self) -> Option<ValidationFailure> {
        self.validation_failure.borrow_mut().take()
    }
    /// 只有显式 Continue 的原生入口调用本方法；既有写入仍完整重跑所有检查。
    /// RAII 在错误/提前返回/展开 panic 时恢复，不能泄漏为后续输入的全局旁路。
    pub fn with_validation_confirmation<T>(
        &mut self,
        confirmed: bool,
        apply: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let previous = self.validation_confirmation.replace(confirmed);
        let _scope = ConfirmationScope {
            state: Rc::clone(&self.validation_confirmation),
            previous,
        };
        apply(self)
    }

    pub(crate) fn validate_advanced_input_value(
        &self,
        sheet: usize,
        addr: CellAddress,
        value: &Value,
    ) -> Result<(), &'static str> {
        let target = self.sheet(sheet).ok_or("INVALID_SHEET")?;
        let Some(rule) = target.data_validation_at(addr) else {
            return Ok(());
        };
        let blank =
            matches!(value, Value::Null) || matches!(value, Value::Text(text) if text.is_empty());
        let accepted = match &rule.kind {
            DataValidationKind::CustomFormula { formula, anchor } => {
                (blank && rule.ignore_blank)
                    || formula::accepts(self, sheet, addr, *anchor, formula)
            }
            _ => rule.accepts(value),
        };
        if accepted {
            return Ok(());
        }
        let style = rule
            .options
            .error_alert
            .as_ref()
            .map(|alert| alert.style)
            .unwrap_or_default();
        let result = match style {
            ValidationErrorStyle::Stop => Err("DATA_VALIDATION_FAILED"),
            ValidationErrorStyle::Warning if !self.validation_confirmation.get() => {
                Err("DATA_VALIDATION_WARNING")
            }
            ValidationErrorStyle::Information if !self.validation_confirmation.get() => {
                Err("DATA_VALIDATION_INFORMATION")
            }
            _ => Ok(()),
        };
        if result.is_err() {
            let alert = rule.options.error_alert.as_ref();
            *self.validation_failure.borrow_mut() = Some(ValidationFailure {
                sheet,
                row: addr.row,
                col: addr.col,
                style,
                title: alert.map(|value| value.title.clone()).unwrap_or_default(),
                message: alert.map(|value| value.message.clone()).unwrap_or_default(),
            });
        }
        result
    }
}
