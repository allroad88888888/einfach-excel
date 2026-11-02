//! Named-entry and lambda cycle-detection helpers for `Workbook`.

use super::*;

impl Workbook {
    pub(super) fn collect_named_cycle_refs(
        &self,
        name: &str,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<(Option<u64>, String)>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let key = name.to_uppercase();
        if visiting_names.contains(&(Some(u64::MAX), key.clone())) {
            return false;
        }
        let Some((scope_idx, scope_key, entry)) = self.resolve_scoped_entry(current_idx, name)
        else {
            return false;
        };
        self.collect_resolved_named_cycle_refs(
            key,
            scope_idx,
            scope_key,
            entry,
            current_idx,
            target,
            out,
            visiting_names,
            detect_unbounded_target,
            overlay,
        )
    }

    pub(super) fn collect_sheet_named_cycle_refs(
        &self,
        sheet: &str,
        name: &str,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<(Option<u64>, String)>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let key = name.to_uppercase();
        let Ok(Some((scope_idx, scope_key, entry))) =
            self.resolve_sheet_qualified_entry(sheet, name)
        else {
            return false;
        };
        self.collect_resolved_named_cycle_refs(
            key,
            scope_idx,
            scope_key,
            entry,
            current_idx,
            target,
            out,
            visiting_names,
            detect_unbounded_target,
            overlay,
        )
    }

    fn collect_resolved_named_cycle_refs(
        &self,
        key: String,
        scope_idx: Option<usize>,
        scope_key: Option<u64>,
        entry: &NamedEntry,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<(Option<u64>, String)>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let visit_token = (scope_key, key);
        if !visiting_names.insert(visit_token.clone()) {
            return false;
        }
        let result = match &entry.definition {
            NamedDefinition::Range { sheet_key, range } => {
                if let Some(range) = range {
                    self.sheet_keys
                        .iter()
                        .position(|key| key == sheet_key)
                        .is_some_and(|index| {
                            self.collect_cycle_range_refs(
                                index,
                                *range,
                                RangeBounds::None,
                                target,
                                out,
                                detect_unbounded_target,
                                overlay,
                            )
                        })
                } else {
                    false
                }
            }
            NamedDefinition::Formula { expr, .. } => self.collect_workbook_cycle_refs(
                expr,
                scope_idx.unwrap_or(current_idx),
                target,
                out,
                visiting_names,
                detect_unbounded_target,
                overlay,
            ),
            NamedDefinition::Value(value) => self.collect_value_cycle_refs(
                value,
                current_idx,
                target,
                out,
                visiting_names,
                detect_unbounded_target,
                overlay,
            ),
            NamedDefinition::CustomFormula(definition) => {
                let lambda = definition.lambda_value(|name| {
                    matches!(
                        self.named_values.get(name),
                        Some(NamedEntry {
                            definition: NamedDefinition::CustomFormula(_),
                            ..
                        })
                    )
                });
                self.collect_value_cycle_refs(
                    &lambda,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                )
            }
        };
        visiting_names.remove(&visit_token);
        result
    }

    fn collect_value_cycle_refs(
        &self,
        value: &Value,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<(Option<u64>, String)>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let Value::Lambda(lambda) = value else {
            return false;
        };
        let Some(lambda) = lambda.as_any().downcast_ref::<ExcelLambda>() else {
            return false;
        };
        let mut scoped = visiting_names.clone();
        scoped.extend(
            lambda
                .params
                .iter()
                .map(|name| (Some(u64::MAX), name.to_uppercase())),
        );
        scoped.extend(
            lambda
                .captured
                .iter()
                .map(|(name, _)| (Some(u64::MAX), name.to_uppercase())),
        );
        if self.collect_workbook_cycle_refs(
            &lambda.body,
            current_idx,
            target,
            out,
            &mut scoped,
            detect_unbounded_target,
            overlay,
        ) {
            return true;
        }
        lambda.captured.iter().any(|(_, captured)| {
            self.collect_value_cycle_refs(
                captured,
                current_idx,
                target,
                out,
                visiting_names,
                detect_unbounded_target,
                overlay,
            )
        })
    }
}
