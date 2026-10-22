//! 结构历史只保留被位移的稀疏带及带外真正改写的公式，不复制无关工作表。
use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;
use crate::shift::{rewrite_parked_source, rewrite_qualified_source, ShiftEdit, SourceRewrite};

#[path = "workbook_structural_snapshot.rs"]
mod snapshot;
use snapshot::StructuralSnapshot;

#[derive(Debug)]
pub(crate) struct StructuralHistoryChange {
    pub(crate) edit: ShiftEdit,
    name: String,
    before: StructuralSnapshot,
    after: StructuralSnapshot,
    named_ranges: Vec<NamedRangeShift>,
    named_lambdas: Vec<FormulaLambdaChange>,
    templates: Vec<FormulaSourceChange>,
}

impl StructuralHistoryChange {
    pub(crate) fn mutation_ranges(&self) -> Vec<(usize, Option<CellRange>)> {
        self.before.cells.iter().zip(&self.after.cells)
            .flat_map(|((sheet, before), (_, after))|
                crate::host::changed_ranges(before, after).into_iter().map(|range| (*sheet, Some(range))))
            .chain(self.templates.iter().map(|change| (change.sheet, change.mutation_range())))
            .collect()
    }

    pub(crate) fn edit(
        workbook: &mut Workbook,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Result<Option<(Self, CellRange)>, &'static str> {
        workbook.validate_structural_edit(sheet, edit)?;
        let (at, count) = match edit {
            ShiftEdit::RowInsert { at, count }
            | ShiftEdit::RowDelete { at, count }
            | ShiftEdit::ColInsert { at, count }
            | ShiftEdit::ColDelete { at, count } => (at, count),
        };
        if count == 0 {
            return Ok(None);
        }
        let inherited = workbook.inserted_table_formulas(sheet, edit)?;
        let end = CellAddress::new(
            crate::sheet::EXCEL_MAX_ROWS - 1,
            crate::sheet::EXCEL_MAX_COLS - 1,
        );
        let start = if edit.is_row_edit() {
            CellAddress::new(at, 0)
        } else {
            CellAddress::new(0, at)
        };
        let tail = CellRange::new(start, end);
        let range = CellRange::new(
            start,
            if edit.is_row_edit() {
                CellAddress::new(at + count - 1, end.col)
            } else {
                CellAddress::new(end.row, at + count - 1)
            },
        );
        let name = workbook.name(sheet).unwrap().to_owned();
        let mut targets = vec![(sheet, tail)];
        // 在空表汇总行前插入时，原待输入行位于移动带上方；只补实际继承格的快照。
        targets.extend(
            inherited
                .iter()
                .filter(|cell| !tail.contains(cell.addr))
                .map(|cell| (sheet, CellRange::single(cell.addr))),
        );
        for (index, current) in workbook.sheets.iter().enumerate() {
            let mut addrs: Vec<_> = current
                .formula_addrs_in_range(CellRange::new(CellAddress::new(0, 0), end))
                .into_iter()
                .collect();
            addrs.sort_by_key(|addr| (addr.row, addr.col));
            for addr in addrs {
                if index == sheet && tail.contains(addr) {
                    continue;
                }
                let source = current.formula_text_at(addr).unwrap();
                let local_changed = index == sheet
                    && !matches!(
                        rewrite_parked_source(&source, edit),
                        SourceRewrite::Unchanged
                    );
                if local_changed || rewrite_qualified_source(&source, &name, edit).is_some() {
                    targets.push((index, CellRange::new(addr, addr)));
                }
            }
        }
        // 只捕获实际改变的目录；跨表引用不能只靠目标表的历史快照恢复。
        let rule_sheets: Vec<_> = workbook
            .conditional_formats
            .iter()
            .enumerate()
            .filter_map(|(owner, config)| {
                (config.rules != workbook.shifted_conditional_format_rules(owner, sheet, edit))
                    .then_some(owner)
            })
            .collect();
        let validation_sheets = workbook.validation_reference_sheets(sheet, edit);
        let before = StructuralSnapshot::capture(
            workbook,
            sheet,
            &targets,
            &rule_sheets,
            &validation_sheets,
        );
        let named_ranges = workbook.shifted_named_ranges(sheet, edit);
        if !inherited.is_empty() {
            let bytes = inherited
                .iter()
                .map(|cell| 96 + cell.formula.as_ref().unwrap().len())
                .sum::<usize>();
            if 2 * before.retained_bytes() + bytes > crate::workbook_history::MAX_BYTES {
                return Err("Table row inheritance exceeds the 32 MiB undo budget.");
            }
            // 拒绝也必须能恢复规则，不能把最后一次 revision 消耗在尚未验证的位移上。
            if rule_sheets
                .iter()
                .any(|owner| workbook.conditional_formats[*owner].revision >= u64::MAX - 1)
            {
                return Err("Conditional-format revision cannot support structural rollback.");
            }
        }
        let observers: Vec<_> = if inherited.is_empty() {
            Vec::new()
        } else {
            workbook
                .sheets
                .iter_mut()
                .map(Sheet::suspend_structure_notifications)
                .collect()
        };
        let store = workbook.store.clone();
        let mut outcome = None;
        let mut validation_range = range;
        store.batch(|_| {
            let (named_lambdas, templates) =
                workbook.apply_structural_shift_with_table_follow(sheet, edit);
            let mut arrays = Vec::new();
            let mut result = Ok(());
            if !inherited.is_empty() {
                let mut affected = range;
                for cell in &inherited {
                    affected.start.row = affected.start.row.min(cell.addr.row);
                    affected.end.row = affected.end.row.max(cell.addr.row);
                }
                validation_range = affected;
                arrays = workbook.array_dependents_for_range(sheet, affected);
                arrays
                    .extend(workbook.array_dependents_for_atoms(
                        &workbook.atom_context.table_dependent_atoms(),
                    ));
                result = workbook
                    .set_table_formulas(sheet, &inherited)
                    .and_then(|_| {
                        workbook.settle_validation_candidate(sheet, affected);
                        inherited.iter().try_for_each(|cell| {
                            let value = crate::sheet::collapse_array_for_eval(
                                workbook.sheets[sheet].peek_value(cell.addr),
                            );
                            workbook.validate_input_value(sheet, cell.addr, &value)
                        })
                    })
                    .and_then(|_| workbook.validate_inserted_table_arrays(sheet, edit));
            }
            let after = StructuralSnapshot::capture(
                workbook,
                sheet,
                &targets,
                &rule_sheets,
                &validation_sheets,
            );
            let change = Self {
                edit,
                name,
                before,
                after,
                named_ranges,
                named_lambdas,
                templates,
            };
            if !inherited.is_empty() && change.retained_bytes() > crate::workbook_history::MAX_BYTES
            {
                result = Err("Table row inheritance exceeds the 32 MiB undo budget.");
            }
            if result.is_err() {
                change
                    .apply(workbook, sheet, true)
                    .expect("structural preflight reserved rollback");
                if !inherited.is_empty() {
                    workbook.settle_validation_candidate(sheet, validation_range);
                }
            }
            outcome = Some((change, result, arrays));
        });
        let (change, result, arrays) = outcome.expect("structural batch ran");
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result?;
        Ok(Some((change, range)))
    }

    pub(crate) fn affected_sheets(&self) -> Vec<usize> {
        self.before
            .cells
            .iter()
            .map(|(sheet, _)| *sheet)
            .chain(self.templates.iter().map(|change| change.sheet))
            .chain(
                self.before
                    .referenced_validations
                    .iter()
                    .map(|(sheet, _)| *sheet),
            )
            .chain(
                self.before
                    .conditional_formats
                    .iter()
                    .map(|(sheet, _)| *sheet),
            )
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }

    pub(crate) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() || workbook.name(sheet) != Some(self.name.as_str()) {
            return Err("The worksheet changed outside history.");
        }
        let snapshot = if undo { &self.before } else { &self.after };
        workbook.validate_named_range_restore(sheet, &self.named_ranges, undo)?;
        for lambda in &self.named_lambdas {
            lambda.validate(workbook, undo)?;
        }
        for template in &self.templates {
            template.validate(workbook, undo)?;
        }
        for (owner, rules) in &snapshot.conditional_formats {
            let config = &workbook.conditional_formats[*owner];
            if config.rules != *rules && config.revision == u64::MAX {
                return Err("Conditional-format revision is exhausted.");
            }
        }
        if snapshot.tables.iter().any(|table| {
            workbook
                .tables
                .get(&table.name().to_ascii_uppercase())
                .is_some_and(|current| current.sheet_name != self.name)
        }) {
            return Err("A table name is already used by another worksheet.");
        }
        // 身份检查由 HistoryEntry 在进入这里之前完成，之后恢复原生快照没有可失败的写入分支。
        let indices = self.affected_sheets();
        let tables_changed = workbook
            .tables
            .values()
            .filter(|table| table.sheet_name == self.name)
            .count()
            != snapshot.tables.len()
            || snapshot.tables.iter().any(|table| {
                workbook.tables.get(&table.name().to_ascii_uppercase()) != Some(table)
            });
        let mut arrays = if tables_changed {
            workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms())
        } else {
            Vec::new()
        };
        for (owner, cells) in &snapshot.cells {
            arrays.extend(workbook.array_dependents_for_range(*owner, cells.range));
        }
        // Table 数组消费者可能没有源码变化，不能只暂停快照所属表的直接监听。
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = workbook.store.clone();
        store.batch(|_| {
            let mut anchors = Vec::new();
            for index in &indices {
                let cells: Vec<_> = snapshot
                    .cells
                    .iter()
                    .filter(|(s, _)| s == index)
                    .map(|(_, snapshot)| snapshot)
                    .collect();
                // 只有模板/规则变化的表不恢复单元格，也不拆装无关数组或增加求值。
                if cells.is_empty() {
                    continue;
                }
                anchors.push((
                    *index,
                    workbook.sheets[*index].restore_structure_content(&cells),
                ));
            }
            workbook.sheets[sheet].outline.clone_from(&snapshot.outline);
            workbook
                .restore_sheet_visibility(sheet, &snapshot.visibility)
                .expect("preflight checked workbook state");
            workbook.sheets[sheet].commit_filter_state(snapshot.filter.clone());
            workbook.sheets[sheet]
                .merged_ranges
                .clone_from(&snapshot.merges);
            workbook.sheets[sheet].frozen_panes = snapshot.freeze;
            workbook.sheets[sheet]
                .data_validations
                .clone_from(&snapshot.data_validations);
            for (owner, rules) in &snapshot.referenced_validations {
                workbook.sheets[*owner].data_validations.clone_from(rules);
            }
            // 权限不进入内容历史；只让当前配置随本次回放的几何移动。
            let edit = if undo {
                match self.edit {
                    ShiftEdit::RowInsert { at, count } => ShiftEdit::RowDelete { at, count },
                    ShiftEdit::RowDelete { at, count } => ShiftEdit::RowInsert { at, count },
                    ShiftEdit::ColInsert { at, count } => ShiftEdit::ColDelete { at, count },
                    ShiftEdit::ColDelete { at, count } => ShiftEdit::ColInsert { at, count },
                }
            } else {
                self.edit
            };
            workbook.shift_protection_ranges(sheet, edit);
            for (owner, rules) in &snapshot.conditional_formats {
                workbook
                    .replace_conditional_format_rules(*owner, rules.clone())
                    .expect("history preflight checked conditional-format revision");
            }
            if tables_changed {
                workbook
                    .tables
                    .retain(|_, table| table.sheet_name != self.name);
                for table in &snapshot.tables {
                    workbook
                        .tables
                        .insert(table.name().to_ascii_uppercase(), table.clone());
                }
                workbook.bump_tables_epoch();
            }
            // 普通区域与 Table 的前后像全部就位后，再发布合并可见性。
            workbook.republish_hidden(sheet);
            for lambda in &self.named_lambdas {
                lambda.apply(workbook, undo);
            }
            for template in &self.templates {
                template.apply(workbook, undo);
            }
            workbook.restore_named_range_coordinates(&self.named_ranges, undo);
            if self.named_ranges.is_empty() && !self.named_lambdas.is_empty() {
                workbook.sync_atom_names();
            }
            for (index, candidates) in anchors {
                workbook.sheets[index].project_bulk_spill_anchors(candidates);
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observers) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observers);
        }
        Ok(())
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.name.len()
            + self.before.retained_bytes()
            + self.after.retained_bytes()
            + crate::sheet::metadata_bytes(&self.named_lambdas)
            + self
                .templates
                .iter()
                .map(FormulaSourceChange::retained_bytes)
                .sum::<usize>()
            + self
                .named_ranges
                .iter()
                .map(NamedRangeShift::retained_bytes)
                .sum::<usize>()
    }
}
