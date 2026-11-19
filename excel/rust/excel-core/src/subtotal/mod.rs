mod append_layout;
mod inspect;
mod layout;
mod layout_contract;
mod layout_groups;
#[cfg(test)]
mod layout_tests;
mod owned_output;
mod read_details;
mod structure_steps;

mod region;
mod region_shift;
mod removal_metadata;
pub use region::{SubtotalBounds, SubtotalRegion};
mod layout_identities;
mod plan;
mod request;
mod state;
mod transaction;
mod write_output;
pub use layout_contract::{SubtotalCalculation, SubtotalFunction, SubtotalPlacement};
pub use request::{
    SubtotalAction, SubtotalField, SubtotalList, SubtotalReport, SubtotalRequest, SubtotalSettings,
};
pub(crate) use transaction::SubtotalChange;
