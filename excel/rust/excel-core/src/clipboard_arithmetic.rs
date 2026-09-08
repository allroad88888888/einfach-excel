//! 粘贴运算：目标在左、复制内容在右，复用公式运算规则，不冻结已有公式。
use super::{ClipboardError, ClipboardValue};
use crate::{eval::eval_expr, parse_formula, render_formula, BinOperator, Expr};
use einfach_core::Value;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ClipboardArithmetic {
    #[default]
    None,
    Add,
    Subtract,
    Multiply,
    Divide,
}

impl ClipboardArithmetic {
    pub(super) fn history_label(self) -> &'static str {
        match self {
            Self::None => "Paste cells",
            Self::Add => "Paste and add",
            Self::Subtract => "Paste and subtract",
            Self::Multiply => "Paste and multiply",
            Self::Divide => "Paste and divide",
        }
    }

    pub(super) fn combine(
        self,
        target: ClipboardValue,
        source: ClipboardValue,
    ) -> Result<ClipboardValue, ClipboardError> {
        let op = match self {
            Self::None => return Ok(source),
            Self::Add => BinOperator::Add,
            Self::Subtract => BinOperator::Sub,
            Self::Multiply => BinOperator::Mul,
            Self::Divide => BinOperator::Div,
        };
        let has_formula = matches!(target, ClipboardValue::Formula { .. })
            || matches!(source, ClipboardValue::Formula { .. });
        let expr = Expr::BinOp {
            op,
            left: Box::new(operand(target)?),
            right: Box::new(operand(source)?),
        };
        if has_formula {
            Ok(ClipboardValue::Formula {
                source: render_formula(&expr),
                evaluated: None,
            })
        } else {
            // 纯常量没有引用；沿用引擎的数字文字/布尔/空白转换及错误、溢出语义。
            Ok(ClipboardValue::Literal(eval_expr(
                &expr,
                &|_| Value::Null,
                &HashMap::new(),
            )))
        }
    }
}

fn operand(value: ClipboardValue) -> Result<Expr, ClipboardError> {
    match value {
        ClipboardValue::Formula { source, .. } => {
            parse_formula(&source).ok_or("CLIPBOARD_INVALID_FORMULA")
        }
        ClipboardValue::Literal(value) => Ok(match value {
            Value::Number(number) => Expr::Number(number),
            Value::Text(text) => Expr::Text(text),
            Value::Boolean(value) => Expr::Bool(value),
            Value::Null => Expr::Number(0.0),
            Value::Error(error) => Expr::Error(error),
            // spill 在粘贴预检中处理，不能把数组或函数悄悄转换成另一个值。
            _ => return Err("CLIPBOARD_UNSUPPORTED_ARITHMETIC"),
        }),
    }
}
