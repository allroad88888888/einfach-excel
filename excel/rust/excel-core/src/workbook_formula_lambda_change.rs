//! 已保存 LAMBDA 的公式改写；闭包捕获与参数继续按原词法作用域绑定。
use super::*;

#[derive(Debug)]
pub(crate) struct FormulaLambdaChange {
    key: String,
    before: NamedEntry,
    after: NamedEntry,
}

impl FormulaLambdaChange {
    /// 与单元格共用静态工作表引用改写；只保留真正变化的闭包。
    pub fn for_sheet_refs(workbook: &Workbook, old: &str, new: Option<&str>) -> Vec<Self> {
        Self::prepare(workbook, &|expr| {
            let before = expr.clone();
            super::workbook_sheet_refs::rewrite_sheet_refs(expr, old, new);
            *expr != before
        })
    }

    /// 保存的闭包没有所属单元格，只位移显式指向目标表的地址。
    pub fn for_structural_shift(
        workbook: &Workbook,
        sheet: &str,
        edit: crate::shift::ShiftEdit,
    ) -> Vec<Self> {
        Self::prepare(workbook, &|expr| {
            crate::shift::rewrite_structural_refs(expr, sheet, false, edit)
        })
    }

    pub fn prepare(workbook: &Workbook, rewrite: &impl Fn(&mut Expr) -> bool) -> Vec<Self> {
        let mut changes = Vec::new();
        for (key, entry) in &workbook.named_values {
            if let NamedDefinition::Value(value) = &entry.definition {
                if let Some(value) = rewrite_value(value, rewrite) {
                    changes.push(Self {
                        key: key.clone(),
                        before: entry.clone(),
                        after: NamedEntry {
                            canonical_name: entry.canonical_name.clone(),
                            definition: NamedDefinition::Value(value),
                        },
                    });
                }
            }
        }
        changes
    }

    pub fn validate(&self, workbook: &Workbook, undo: bool) -> Result<(), &'static str> {
        if workbook.named_values.get(&self.key)
            != Some(if undo { &self.after } else { &self.before })
        {
            return Err("A referring named lambda changed outside history.");
        }
        Ok(())
    }

    pub fn apply(&self, workbook: &mut Workbook, undo: bool) {
        workbook.named_values.insert(
            self.key.clone(),
            if undo { &self.before } else { &self.after }.clone(),
        );
    }
}

fn rewrite_value(value: &Value, rewrite: &impl Fn(&mut Expr) -> bool) -> Option<Value> {
    let Value::Lambda(value) = value else {
        return None;
    };
    let Some(lambda) = value.as_any().downcast_ref::<ExcelLambda>() else {
        return None;
    };
    let mut captured = lambda.captured.clone();
    let mut changed = false;
    for (_, value) in &mut captured {
        if let Some(next) = rewrite_value(value, rewrite) {
            *value = next;
            changed = true;
        }
    }
    // 临时 AST 只复用现有 alpha-renaming 算法，不重新求值闭包或捕获变量。
    // 捕获放前，形参放后：同名形参覆盖捕获，顺序与 apply_lambda 一致。
    let mut args: Vec<_> = captured
        .iter()
        .map(|(name, _)| Expr::Name(name.clone()))
        .chain(lambda.params.iter().cloned().map(Expr::Name))
        .collect();
    args.push(lambda.body.clone());
    let mut wrapper = Expr::FuncCall {
        name: "LAMBDA".into(),
        args,
    };
    changed |= rewrite(&mut wrapper);
    if !changed {
        return None;
    }
    let Expr::FuncCall { mut args, .. } = wrapper else {
        unreachable!()
    };
    let body = args.pop().expect("lambda body");
    let names: Vec<_> = args
        .into_iter()
        .map(|arg| {
            let Expr::Name(name) = arg else {
                unreachable!()
            };
            name
        })
        .collect();
    for ((name, _), next) in captured.iter_mut().zip(&names) {
        *name = next.clone();
    }
    Some(Value::Lambda(Arc::new(ExcelLambda {
        params: names[captured.len()..].to_vec(),
        body,
        captured,
    })))
}
