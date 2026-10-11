//! 一次工作表结构变化的原生逆操作；改名只保留引用源，增删持有原 Sheet。
use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;

type FormulaSources = Vec<(usize, CellAddress, String)>;

#[derive(Debug)]
pub(crate) enum SheetHistoryChange {
    Rename {
        index: usize,
        key: u64,
        before: String,
        after: String,
        before_refs: FormulaSources,
        after_refs: FormulaSources,
        before_rules: ConditionalRuleSources,
        after_rules: ConditionalRuleSources,
        lambdas: Vec<FormulaLambdaChange>,
        templates: Vec<FormulaSourceChange>,
    },
    Move {
        key: u64,
        from: usize,
        to: usize,
    },
    Presence {
        index: usize,
        key: u64,
        created: bool,
        archive: Option<ArchivedWorksheet>,
        bytes: usize,
    },
}

impl SheetHistoryChange {
    pub(crate) fn edit(
        workbook: &mut Workbook,
        index: Option<usize>,
        name: &str,
    ) -> Result<(usize, Option<Self>), &'static str> {
        if let Some(index) = index {
            let before = workbook
                .name(index)
                .ok_or("The worksheet no longer exists.")?
                .to_owned();
            let after = name.trim().to_owned();
            // 同名仍走统一命名校验，但不增加历史或丢弃 redo。
            if before == after {
                return workbook.edit_sheet(Some(index), name).map(|i| (i, None));
            }
            // 逆向改名也会碰到原先悬空的新表名引用；两边的原始源都必须保留。
            let addresses: BTreeSet<_> = workbook
                .sheet_ref_rewrites(&before, Some(&after))
                .into_iter()
                .chain(workbook.sheet_ref_rewrites(&after, Some(&before)))
                .map(|(sheet, addr, _)| (sheet, addr.row, addr.col))
                .collect();
            let capture = |workbook: &Workbook| {
                addresses
                    .iter()
                    .map(|&(sheet, row, col)| {
                        let addr = CellAddress::new(row, col);
                        (
                            sheet,
                            addr,
                            workbook.sheets[sheet].formula_text_at(addr).unwrap(),
                        )
                    })
                    .collect()
            };
            let before_refs = capture(workbook);
            let rule_keys = workbook
                .conditional_sheet_ref_rewrites(&before, Some(&after))
                .into_iter()
                .chain(workbook.conditional_sheet_ref_rewrites(&after, Some(&before)))
                .map(|(key, _)| key)
                .collect();
            let before_rules = workbook.capture_conditional_rule_sources(&rule_keys);
            workbook.validate_sheet_name(Some(index), name)?;
            let lambdas = FormulaLambdaChange::for_sheet_refs(workbook, &before, Some(&after));
            let templates = FormulaSourceChange::for_sheet_templates(workbook, &before, Some(&after));
            if !workbook.rename_sheet_with_formula_consumers(
                index,
                &after,
                None,
                Some((&lambdas, false)),
                Some((&templates, false)),
            ) {
                return Err("Could not rename the worksheet.");
            }
            let after_refs = capture(workbook);
            let after_rules = workbook.capture_conditional_rule_sources(&rule_keys);
            Ok((
                index,
                Some(Self::Rename {
                    index,
                    key: workbook.sheet_key(index).unwrap(),
                    before,
                    after,
                    before_refs,
                    after_refs,
                    before_rules,
                    after_rules,
                    lambdas,
                    templates,
                }),
            ))
        } else {
            let index = workbook.edit_sheet(None, name)?;
            Ok((
                index,
                Some(Self::Presence {
                    index,
                    key: workbook.sheet_key(index).unwrap(),
                    created: true,
                    archive: None,
                    bytes: 0,
                }),
            ))
        }
    }

    pub(crate) fn remove(workbook: &mut Workbook, index: usize) -> Result<Self, &'static str> {
        let archive = workbook
            .archive_sheet(index)
            .ok_or("Could not delete the worksheet.")?;
        let bytes = archive.retained_bytes();
        Ok(Self::Presence {
            index,
            key: archive.key(),
            created: false,
            archive: Some(archive),
            bytes,
        })
    }

    pub(crate) fn move_to(
        workbook: &mut Workbook,
        from: usize,
        to: usize,
    ) -> Result<Option<Self>, &'static str> {
        let key = workbook
            .sheet_key(from)
            .ok_or("The worksheet no longer exists.")?;
        if !workbook.move_sheet(from, to) {
            return Err("Could not move the worksheet.");
        }
        Ok((from != to).then_some(Self::Move { key, from, to }))
    }

    pub(crate) fn apply(
        &mut self,
        workbook: &mut Workbook,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot change sheets during a custom formula call.");
        }
        match self {
            Self::Rename {
                index,
                key,
                before,
                after,
                before_refs,
                after_refs,
                before_rules,
                after_rules,
                lambdas,
                templates,
            } => {
                require_key(workbook, *index, *key)?;
                let (expected, next, sources) = if undo {
                    (after, before, before_refs)
                } else {
                    (before, after, after_refs)
                };
                if workbook.name(*index) != Some(expected.as_str()) {
                    return Err("The worksheet changed outside history.");
                }
                let rules = if undo { before_rules } else { after_rules };
                workbook.validate_sheet_name(Some(*index), next)?;
                workbook.validate_conditional_rule_sources(rules)?;
                let store = workbook.store.clone();
                let mut result = Ok(());
                store.batch(|_| {
                    result = workbook
                        .rename_sheet_with_formula_consumers(
                            *index,
                            next,
                            Some(rules),
                            Some((lambdas, undo)),
                            Some((templates, undo)),
                        )
                        .then_some(())
                        .ok_or("Could not rename the worksheet.")
                        .map(|_| {
                            for (sheet, addr, source) in sources {
                                workbook.set_formula(*sheet, &addr.to_string_repr(), source);
                            }
                        });
                });
                result
            }
            Self::Move { key, from, to } => {
                let (source, target) = if undo { (*to, *from) } else { (*from, *to) };
                require_key(workbook, source, *key)?;
                workbook
                    .move_sheet(source, target)
                    .then_some(())
                    .ok_or("Could not move the worksheet.")
            }
            Self::Presence {
                index,
                key,
                created,
                archive,
                bytes,
            } => {
                let remove = *created == undo;
                if remove {
                    require_key(workbook, *index, *key)?;
                    let store = workbook.store.clone();
                    let mut saved = None;
                    store.batch(|_| {
                        saved = workbook.archive_sheet_with_conditional_refs(*index, *created);
                        if let Some(saved) = saved.as_ref().filter(|_| *created) {
                            saved.restore_missing_reference_sources(workbook);
                        }
                    });
                    let saved = saved.ok_or("Could not delete the worksheet.")?;
                    *bytes = saved.retained_bytes();
                    *archive = Some(saved);
                    Ok(())
                } else {
                    let saved = archive
                        .take()
                        .ok_or("The archived worksheet is unavailable.")?;
                    match saved.restore(workbook) {
                        Ok(_) => Ok(()),
                        Err(saved) => {
                            *archive = Some(saved);
                            Err("The workbook changed outside history; the worksheet cannot be restored.")
                        }
                    }
                }
            }
        }
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        match self {
            Self::Rename {
                before,
                after,
                before_refs,
                after_refs,
                before_rules,
                after_rules,
                lambdas,
                templates,
                ..
            } => {
                before.len()
                    + after.len()
                    + crate::sheet::metadata_bytes(before_rules)
                    + crate::sheet::metadata_bytes(after_rules)
                    + crate::sheet::metadata_bytes(lambdas)
                    + templates.iter().map(FormulaSourceChange::retained_bytes).sum::<usize>()
                    + before_refs
                        .iter()
                        .chain(after_refs)
                        .map(|(_, _, source)| 32 + source.len())
                        .sum::<usize>()
            }
            Self::Move { .. } => 32,
            // 恢复进工作簿后也预留归档预算，下一次 redo 不会绕过上限。
            Self::Presence { bytes, .. } => *bytes,
        }
    }
}

fn require_key(workbook: &Workbook, index: usize, key: u64) -> Result<(), &'static str> {
    (workbook.sheet_key(index) == Some(key))
        .then_some(())
        .ok_or("The worksheet changed outside history.")
}
