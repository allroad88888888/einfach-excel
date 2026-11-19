//! Native worksheet consolidation (by position or category, static or linked with outlines).
mod aggregate;
mod history;
mod layout;
mod plan;

pub use aggregate::ConsolidateFunction;
pub(crate) use history::ConsolidateChange;
pub use plan::{
    ConsolidateOverwriteApproval, ConsolidatePreview, ConsolidateReport, ConsolidateRequest,
    ConsolidateSource, MAX_CONSOLIDATE_CELLS, MAX_CONSOLIDATE_SOURCES,
};
