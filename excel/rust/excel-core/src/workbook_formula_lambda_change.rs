//! 已保存 LAMBDA 的公式改写；闭包捕获与参数继续按原词法作用域绑定。
use super::*;

#[derive(Debug)]
pub(crate) struct FormulaLambdaChange {
    scope_sheet_key: Option<u64>,
    key: String,
    before: NamedEntry,
    after: NamedEntry,
}

impl FormulaLambdaChange {
    /// 与单元格共用静态工作表引用改写；只保留真正变化的闭包与命名公式。
    pub fn for_sheet_refs(workbook: &Workbook, old: &str, new: Option<&str>) -> Vec<Self> {
        let deleted_key = new
            .is_none()
            .then(|| {
                workbook
                    .resolve_sheet_index_ci(old)
                    .and_then(|idx| workbook.sheet_key(idx))
            })
            .flatten();
        Self::prepare_with_context(workbook, &|scope_key, _, expr| {
            if deleted_key.is_some() && scope_key == deleted_key {
                return false;
            }
            let before = expr.clone();
            super::workbook_sheet_refs::rewrite_sheet_refs(expr, old, new);
            *expr != before
        })
    }

    /// 保存的闭包没有所属单元格，只位移显式指向目标表的地址；命名公式额外跟随所属表位移裸引用。
    pub fn for_structural_shift(
        workbook: &Workbook,
        sheet: &str,
        edit: crate::shift::ShiftEdit,
    ) -> Vec<Self> {
        let target_idx = workbook.resolve_sheet_index_ci(sheet);
        let target_key = target_idx.and_then(|idx| workbook.sheet_key(idx));
        Self::prepare_with_context(workbook, &|scope_key, is_formula, expr| {
            let local = is_formula
                && match scope_key {
                    Some(sk) => Some(sk) == target_key,
                    None => target_idx == Some(0),
                };
            crate::shift::rewrite_structural_refs(expr, sheet, local, edit)
        })
    }

    pub fn prepare(workbook: &Workbook, rewrite: &impl Fn(&mut Expr) -> bool) -> Vec<Self> {
        Self::prepare_with_context(workbook, &|_, _, expr| rewrite(expr))
    }

    pub fn prepare_scoped(
        workbook: &Workbook,
        rewrite: &impl Fn(Option<u64>, &mut Expr) -> bool,
    ) -> Vec<Self> {
        Self::prepare_with_context(workbook, &|scope_key, _, expr| rewrite(scope_key, expr))
    }

    pub fn prepare_with_context(
        workbook: &Workbook,
        rewrite: &impl Fn(Option<u64>, bool, &mut Expr) -> bool,
    ) -> Vec<Self> {
        let mut changes = Vec::new();
        let all_entries = workbook
            .named_values
            .iter()
            .map(|(key, entry)| (None, key, entry))
            .chain(
                workbook
                    .sheet_named_values
                    .iter()
                    .map(|((sk, key), entry)| (Some(*sk), key, entry)),
            );
        for (scope_sheet_key, key, entry) in all_entries {
            match &entry.definition {
                NamedDefinition::Value(value) => {
                    if let Some(value) =
                        rewrite_value(value, &|expr| rewrite(scope_sheet_key, false, expr))
                    {
                        changes.push(Self {
                            scope_sheet_key,
                            key: key.clone(),
                            before: entry.clone(),
                            after: NamedEntry {
                                canonical_name: entry.canonical_name.clone(),
                                definition: NamedDefinition::Value(value),
                            },
                        });
                    }
                }
                NamedDefinition::Formula { expr, .. } => {
                    let mut next_expr = (**expr).clone();
                    if rewrite(scope_sheet_key, true, &mut next_expr) {
                        let next_source = crate::render_formula(&next_expr);
                        changes.push(Self {
                            scope_sheet_key,
                            key: key.clone(),
                            before: entry.clone(),
                            after: NamedEntry {
                                canonical_name: entry.canonical_name.clone(),
                                definition: NamedDefinition::Formula {
                                    source: next_source,
                                    expr: Rc::new(next_expr),
                                },
                            },
                        });
                    }
                }
                NamedDefinition::Range { .. } | NamedDefinition::CustomFormula(_) => {}
            }
        }
        changes
    }

    pub fn validate(&self, workbook: &Workbook, undo: bool) -> Result<(), &'static str> {
        if workbook.get_scoped_entry(self.scope_sheet_key, &self.key)
            != Some(if undo { &self.after } else { &self.before })
        {
            return Err("A referring named lambda changed outside history.");
        }
        Ok(())
    }

    pub fn apply(&self, workbook: &mut Workbook, undo: bool) {
        workbook.insert_scoped_entry(
            self.scope_sheet_key,
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
