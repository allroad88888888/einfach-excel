//! Compile worksheet criteria rows into an OR of AND clauses for one scan.
use super::range_predicate::Predicate;
use super::WorkbookEvalProvider;
use crate::advanced_filter::range_contract::{
    validate_data_range, FilterRangeRef, MAX_CRITERIA_CELLS,
};
use crate::eval::eval_expr_with_provider;
use crate::formula::Expr;
use crate::sheet::collapse_array_for_eval;
use crate::shift::shift_copy_formula;
use crate::{parse_formula, value_to_display, CellAddress, FilterError, Workbook};
use einfach_core::Value;
use std::cell::Cell;
use std::collections::HashMap;

enum Criterion {
    Field { index: usize, test: Predicate },
    Formula(Expr),
}

pub(super) struct CriteriaRows {
    sheet: usize,
    clauses: Vec<Vec<Criterion>>,
    pub(super) condition_count: usize,
}

impl CriteriaRows {
    pub(super) fn compile(
        workbook: &Workbook,
        reference: FilterRangeRef,
        source_columns: &HashMap<String, usize>,
    ) -> Result<Self, FilterError> {
        let range = reference.range;
        validate_data_range(range, MAX_CRITERIA_CELLS)?;
        let sheet = workbook
            .sheet(reference.sheet)
            .ok_or(FilterError::InvalidSheet)?;
        let fields: Vec<_> = (range.start.col..=range.end.col)
            .map(|column| {
                let value = collapse_array_for_eval(
                    sheet.peek_value(CellAddress::new(range.start.row, column)),
                );
                source_columns
                    .get(&value_to_display(&value).to_lowercase())
                    .copied()
            })
            .collect();
        let mut clauses = Vec::new();
        let mut condition_count = 0;
        for row in range.start.row + 1..=range.end.row {
            let mut clause = Vec::new();
            for (offset, field) in fields.iter().enumerate() {
                let address = CellAddress::new(row, range.start.col + offset as u32);
                let criterion = if let Some(index) = field {
                    let value = collapse_array_for_eval(sheet.peek_value(address));
                    Predicate::compile(&value)
                        .map_err(FilterError::InvalidCriteria)?
                        .map(|test| Criterion::Field {
                            index: *index,
                            test,
                        })
                } else if let Some(source) = sheet.formula_text_at(address) {
                    let expression = parse_formula(&source).ok_or(FilterError::InvalidCriteria(
                        "Enter a valid formula in the criteria range.",
                    ))?;
                    Some(Criterion::Formula(expression))
                } else {
                    let value = collapse_array_for_eval(sheet.peek_value(address));
                    if !matches!(value, Value::Null) && value.as_text() != Some("") {
                        return Err(FilterError::InvalidCriteria(
                            "Match each criteria heading to a source field or use a formula under it.",
                        ));
                    }
                    None
                };
                clause.extend(criterion);
            }
            condition_count += clause.len();
            // A blank criteria line has no restrictions, so it is an OR branch that matches all rows.
            clauses.push(clause);
        }
        Ok(Self {
            sheet: reference.sheet,
            clauses,
            condition_count,
        })
    }

    pub(super) fn matches(
        &self,
        workbook: &Workbook,
        first_data_row: u32,
        row_address: CellAddress,
        record: &[Value],
    ) -> bool {
        let provider = WorkbookEvalProvider {
            wb: workbook,
            current: Cell::new(self.sheet),
            current_cell: Cell::new(Some(row_address)),
        };
        let delta = i64::from(row_address.row - first_data_row);
        self.clauses.iter().any(|clause| {
            clause.iter().all(|condition| match condition {
                Criterion::Field { index, test } => test.matches(&record[*index]),
                Criterion::Formula(expression) => shift_copy_formula(expression, delta, 0)
                    .ok()
                    .is_some_and(|expression| {
                        matches!(
                            collapse_array_for_eval(eval_expr_with_provider(
                                &expression,
                                &provider
                            )),
                            Value::Boolean(true)
                        )
                    }),
            })
        })
    }
}
