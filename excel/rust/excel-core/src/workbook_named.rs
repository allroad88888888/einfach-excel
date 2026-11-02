//! Defined-name registry types and name-validation constants.

use super::*;

pub(super) type FormulaOverlay<'a> = HashMap<(usize, CellAddress), Option<&'a Expr>>;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NamedEntry {
    pub(crate) canonical_name: String,
    pub(crate) definition: NamedDefinition,
}

/// 名称只有一份定义。范围保存稳定表身份，不保存当时读到的单元格值。
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum NamedDefinition {
    Value(Value),
    CustomFormula(crate::custom_formulas::CustomFormulaDefinition),
    Range {
        sheet_key: u64,
        range: Option<CellRange>,
    },
    Formula {
        source: String,
        expr: Rc<Expr>,
    },
}

impl Workbook {
    pub(crate) fn is_user_defined_name(definition: &NamedDefinition) -> bool {
        matches!(
            definition,
            NamedDefinition::Range { .. } | NamedDefinition::Formula { .. }
        )
    }

    pub(crate) fn has_sheet_scoped_name(&self, upper_key: &str) -> bool {
        self.sheet_named_values
            .keys()
            .any(|(_, key)| key == upper_key)
    }

    pub(crate) fn get_scoped_entry(
        &self,
        scope_sheet_key: Option<u64>,
        upper_key: &str,
    ) -> Option<&NamedEntry> {
        match scope_sheet_key {
            None => self.named_values.get(upper_key),
            Some(sk) => self.sheet_named_values.get(&(sk, upper_key.to_string())),
        }
    }

    pub(crate) fn insert_scoped_entry(
        &mut self,
        scope_sheet_key: Option<u64>,
        upper_key: String,
        entry: NamedEntry,
    ) {
        match scope_sheet_key {
            None => {
                self.named_values.insert(upper_key, entry);
            }
            Some(sk) => {
                self.sheet_named_values.insert((sk, upper_key), entry);
            }
        }
    }

    pub(crate) fn remove_scoped_entry(
        &mut self,
        scope_sheet_key: Option<u64>,
        upper_key: &str,
    ) -> Option<NamedEntry> {
        match scope_sheet_key {
            None => self.named_values.remove(upper_key),
            Some(sk) => self.sheet_named_values.remove(&(sk, upper_key.to_string())),
        }
    }

    pub(crate) fn sheet_index_by_key(&self, sheet_key: u64) -> Option<usize> {
        self.sheet_keys.iter().position(|&key| key == sheet_key)
    }

    pub(crate) fn resolve_sheet_index_ci(&self, sheet_name: &str) -> Option<usize> {
        self.index_of(sheet_name).or_else(|| {
            self.names
                .iter()
                .position(|n| n.eq_ignore_ascii_case(sheet_name))
        })
    }

    pub(crate) fn resolve_scoped_entry(
        &self,
        current_sheet: usize,
        name: &str,
    ) -> Option<(Option<usize>, Option<u64>, &NamedEntry)> {
        let key = name.to_uppercase();
        if let Some(&sk) = self.sheet_keys.get(current_sheet) {
            if let Some(entry) = self.sheet_named_values.get(&(sk, key.clone())) {
                return Some((Some(current_sheet), Some(sk), entry));
            }
        }
        self.named_values
            .get(&key)
            .map(|entry| (None, None, entry))
    }

    pub(crate) fn resolve_sheet_qualified_entry(
        &self,
        sheet_name: &str,
        name: &str,
    ) -> Result<Option<(Option<usize>, Option<u64>, &NamedEntry)>, ValueError> {
        let Some(sheet_idx) = self.resolve_sheet_index_ci(sheet_name) else {
            return Err(ValueError::InvalidRef);
        };
        let sk = self.sheet_keys[sheet_idx];
        let key = name.to_uppercase();
        if let Some(entry) = self.sheet_named_values.get(&(sk, key.clone())) {
            return Ok(Some((Some(sheet_idx), Some(sk), entry)));
        }
        if let Some(entry) = self.named_values.get(&key) {
            return Ok(Some((Some(sheet_idx), None, entry)));
        }
        Ok(None)
    }

    pub(crate) fn parse_named_formula_source(
        raw: &str,
        allow_invalid_ref: bool,
    ) -> Option<(String, Rc<Expr>)> {
        let trimmed = raw.trim();
        let body = trimmed.strip_prefix('=').unwrap_or(trimmed).trim();
        if body.is_empty() {
            return None;
        }
        let source = format!("={body}");
        let expr = parse_formula(&source)?;
        if !allow_invalid_ref
            && (matches!(expr, Expr::Error(ValueError::InvalidRef))
                || crate::shift::contains_invalid_ref(&expr))
        {
            return None;
        }
        Some((source, Rc::new(expr)))
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WorkbookError {
    ReservedName,
    InvalidName,
    ParseFailed,
    EvalFailed(ValueError),
    MutationDuringCustomCall,
    NameConflict,
    ProtectedWorkbook,
}

impl std::fmt::Display for WorkbookError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkbookError::ReservedName => write!(f, "name collides with a built-in function name"),
            WorkbookError::InvalidName => write!(f, "the defined name is invalid"),
            WorkbookError::ParseFailed => write!(f, "formula text failed to parse"),
            WorkbookError::EvalFailed(e) => write!(f, "formula evaluation surfaced {}", e),
            WorkbookError::MutationDuringCustomCall => write!(
                f,
                "workbook mutations are forbidden while a custom-formula callback is executing"
            ),
            WorkbookError::NameConflict => {
                write!(f, "the name is already in use")
            }
            WorkbookError::ProtectedWorkbook => write!(f, "{}", crate::protection::PROTECTED_ERROR),
        }
    }
}

impl std::error::Error for WorkbookError {}

pub(super) const MAX_TABLES: usize = 256;
pub(super) const GRID_MAX_COL: u32 = 16_383;
pub(super) const GRID_MAX_ROW: u32 = 1_048_575;
