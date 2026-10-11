//! 已保存 LAMBDA 的自由名称改写；闭包捕获与参数继续按原词法作用域绑定。
use super::*;

#[derive(Debug)]
pub(super) struct NamedRangeLambdaChange {
    key: String,
    before: NamedEntry,
    after: NamedEntry,
}

impl NamedRangeLambdaChange {
    pub fn prepare(workbook: &Workbook, old: &str, new: &str) -> Vec<Self> {
        workbook
            .named_values
            .iter()
            .filter_map(|(key, entry)| {
                let NamedDefinition::Value(value) = &entry.definition else {
                    return None;
                };
                let value = rename_value(value, old, new)?;
                Some(Self {
                    key: key.clone(),
                    before: entry.clone(),
                    after: NamedEntry {
                        canonical_name: entry.canonical_name.clone(),
                        definition: NamedDefinition::Value(value),
                    },
                })
            })
            .collect()
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

fn rename_value(value: &Value, old: &str, new: &str) -> Option<Value> {
    let Value::Lambda(value) = value else {
        return None;
    };
    let lambda = value.as_any().downcast_ref::<ExcelLambda>()?;
    let mut captured = lambda.captured.clone();
    let mut changed = false;
    for (_, value) in &mut captured {
        if let Some(next) = rename_value(value, old, new) {
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
    changed |= crate::shift::rename_named_reference(&mut wrapper, old, new);
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
