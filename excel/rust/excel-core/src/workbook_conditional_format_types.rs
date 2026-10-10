//! Canonical conditional-format configuration values.

/// 对已保存规则的单次管理操作；一次操作只产生一条历史。
#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConditionalFormatRuleAction {
    Duplicate,
    Enable,
    Disable,
    MoveUp,
    MoveDown,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConditionalFormatRuleEntry {
    pub id: String,
    pub row_start: u32,
    pub row_end: u32,
    pub col_start: u32,
    pub col_end: u32,
    pub priority: i64,
    /// 持久化保留规则原文；已支持的数值规则由原生显示投影解码求值。
    /// 未实现的旧规则种类仍可往返保存，不能由宿主补一套计算。
    pub rule_json: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConditionalFormatConfigSnapshot {
    pub sheet: usize,
    pub revision: u64,
    pub rules: Vec<ConditionalFormatRuleEntry>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct SheetConditionalFormatConfig {
    pub(super) revision: u64,
    pub(super) rules: Vec<ConditionalFormatRuleEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConditionalFormatError {
    UnknownSheet,
    StaleRevision { expected: u64, actual: u64 },
    RevisionExhausted,
    InvalidRuleId,
    InvalidRuleRange,
    DuplicateRuleId,
    DuplicateSheetSnapshot,
    MutationDuringCustomCall,
}

impl std::fmt::Display for ConditionalFormatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownSheet => {
                write!(f, "conditional-format sheet index is outside the workbook")
            }
            Self::StaleRevision { expected, actual } => write!(
                f,
                "stale-conditional-format-revision: expected {actual}, got {expected}"
            ),
            Self::RevisionExhausted => write!(f, "conditional-format revision is exhausted"),
            Self::InvalidRuleId => write!(f, "conditional-format rule id must not be empty"),
            Self::InvalidRuleRange => write!(f, "conditional-format range must be normalized"),
            Self::DuplicateRuleId => write!(f, "conditional-format rule ids must be unique"),
            Self::DuplicateSheetSnapshot => {
                write!(f, "conditional-format snapshots contain a duplicate sheet")
            }
            Self::MutationDuringCustomCall => write!(
                f,
                "conditional-format mutations are forbidden during a custom-formula callback"
            ),
        }
    }
}

impl std::error::Error for ConditionalFormatError {}
