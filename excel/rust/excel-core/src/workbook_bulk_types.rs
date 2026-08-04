//! Bulk-install result and re-entrancy-guard types.

use super::*;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BulkInstallStats {
    pub primitives_installed: usize,
    pub formulas_installed: usize,
    pub cross_sheet_parsed: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstallError {
    SheetOutOfRange(usize),
    MutationDuringCustomCall,
}

impl std::fmt::Display for InstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SheetOutOfRange(index) => {
                write!(f, "sheet index {index} is outside the workbook")
            }
            Self::MutationDuringCustomCall => write!(
                f,
                "bulk install is not allowed inside a custom-formula callback"
            ),
        }
    }
}

impl std::error::Error for InstallError {}

pub(crate) struct CustomCallScope<'a> {
    counter: &'a Cell<usize>,
}

impl<'a> CustomCallScope<'a> {
    pub(crate) fn enter(counter: &'a Cell<usize>) -> Self {
        counter.set(counter.get() + 1);
        Self { counter }
    }
}

impl Drop for CustomCallScope<'_> {
    fn drop(&mut self) {
        self.counter.set(self.counter.get().saturating_sub(1));
    }
}
