//! 排名条件的参数校验与阈值缓存；依赖失效交给既有 Rust atom。
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use super::*;
use crate::cell_style::CellStyle;
use crate::sheet::RankThreshold;
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Direction {
    Top,
    Bottom,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RankRuleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    direction: Direction,
    count: u32,
    #[serde(default)]
    percent: bool,
    format: Highlight,
}

pub(crate) struct RankRule {
    count: u32,
    percent: bool,
    bottom: bool,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl RankRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: RankRuleJson = serde_json::from_str(json)
            .map_err(|_| "Use a top/bottom rule with a whole-number rank.")?;
        if rule.kind != "top-bottom" {
            return Err("Expected a top/bottom rule.");
        }
        let max = if rule.percent { 100 } else { 1000 };
        if (!rule.percent && rule.count == 0) || rule.count > max {
            return Err(if rule.percent {
                "Enter a percentage from 0 to 100."
            } else {
                "Enter a number of items from 1 to 1000."
            });
        }
        Ok(Self {
            count: rule.count,
            percent: rule.percent,
            bottom: matches!(rule.direction, Direction::Bottom),
            enabled: rule.enabled,
            style: rule.format.into_style()?,
        })
    }

    pub(super) fn matches(&self, number: f64, threshold: Option<f64>) -> bool {
        self.enabled
            && number.is_finite()
            && threshold.is_some_and(|limit| {
                if self.bottom {
                    number <= limit
                } else {
                    number >= limit
                }
            })
    }
}

impl Workbook {
    pub(super) fn conditional_rank_threshold(
        &self,
        sheet: usize,
        entry: &ConditionalFormatRuleEntry,
        rule: &RankRule,
    ) -> Option<f64> {
        let key = (self.sheet_keys[sheet], entry.id.clone());
        // 只保存派生 atom 身份；不复制工作簿数据，不自建修订号失效机制。
        let atom = {
            let mut cache = self.conditional_rank_atoms.borrow_mut();
            Rc::clone(cache.entry(key).or_insert_with(|| {
                Rc::new(self.sheets[sheet].create_rank_threshold(
                    CellRange::new(
                        CellAddress::new(entry.row_start, entry.col_start),
                        CellAddress::new(entry.row_end, entry.col_end),
                    ),
                    rule.count,
                    rule.percent,
                    rule.bottom,
                ))
            }))
        };
        atom.read()
    }

    pub(super) fn clear_conditional_rank_atoms(&self, sheet: usize) {
        let key = self.sheet_keys[sheet];
        self.conditional_rank_atoms
            .borrow_mut()
            .retain(|(owner, _), _| *owner != key);
    }
}

pub(super) type RankAtoms = std::cell::RefCell<HashMap<(u64, String), Rc<RankThreshold>>>;
