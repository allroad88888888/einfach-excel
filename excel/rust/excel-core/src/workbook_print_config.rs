//! Workbook-owned print configuration snapshots.

use super::*;

#[derive(Clone, Debug, PartialEq)]
pub enum PrintOrientation {
    Portrait,
    Landscape,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PrintScale {
    Percent {
        percent: f64,
    },
    Fit {
        pages_wide: Option<u32>,
        pages_tall: Option<u32>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ManualPageBreakAxis {
    Row,
    Column,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManualPageBreak {
    pub axis: ManualPageBreakAxis,
    pub index: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HeaderFooterFields {
    pub left: Option<String>,
    pub center: Option<String>,
    pub right: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PrintConfig {
    pub print_area: Option<CellRange>,
    pub manual_page_breaks: Vec<ManualPageBreak>,
    pub scale: PrintScale,
    pub orientation: PrintOrientation,
    pub header: Option<HeaderFooterFields>,
    pub footer: Option<HeaderFooterFields>,
}

impl Default for PrintConfig {
    fn default() -> Self {
        Self {
            print_area: None,
            manual_page_breaks: Vec::new(),
            scale: PrintScale::Percent { percent: 100.0 },
            orientation: PrintOrientation::Portrait,
            header: None,
            footer: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PrintConfigSnapshot {
    pub sheet: usize,
    pub revision: u64,
    pub config: PrintConfig,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct SheetPrintConfig {
    revision: u64,
    config: PrintConfig,
}

impl Default for SheetPrintConfig {
    fn default() -> Self {
        Self {
            revision: 0,
            config: PrintConfig::default(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PrintConfigError {
    UnknownSheet,
    InvalidScale,
    InvalidPrintArea,
    DuplicateSheetSnapshot,
    MutationDuringCustomCall,
}

impl std::fmt::Display for PrintConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownSheet => write!(f, "sheet index is outside the workbook"),
            Self::InvalidScale => write!(f, "print scale is invalid"),
            Self::InvalidPrintArea => write!(f, "print area must be normalized"),
            Self::DuplicateSheetSnapshot => write!(f, "print snapshot has duplicate sheet entries"),
            Self::MutationDuringCustomCall => {
                write!(
                    f,
                    "print configuration mutations are forbidden during a custom-formula callback"
                )
            }
        }
    }
}

impl std::error::Error for PrintConfigError {}

impl Workbook {
    pub fn print_config(&self, sheet: usize) -> Result<PrintConfigSnapshot, PrintConfigError> {
        let stored = self
            .print_configs
            .get(sheet)
            .ok_or(PrintConfigError::UnknownSheet)?;
        Ok(PrintConfigSnapshot {
            sheet,
            revision: stored.revision,
            config: stored.config.clone(),
        })
    }

    pub fn set_print_config(
        &mut self,
        sheet: usize,
        config: PrintConfig,
    ) -> Result<PrintConfigSnapshot, PrintConfigError> {
        if self.is_inside_custom_call() {
            return Err(PrintConfigError::MutationDuringCustomCall);
        }
        validate_print_config(&config)?;
        let stored = self
            .print_configs
            .get_mut(sheet)
            .ok_or(PrintConfigError::UnknownSheet)?;
        if stored.config != config {
            stored.config = config;
            stored.revision = stored.revision.saturating_add(1);
        }
        Ok(PrintConfigSnapshot {
            sheet,
            revision: stored.revision,
            config: stored.config.clone(),
        })
    }

    pub fn snapshot_print_configs(&self) -> Vec<PrintConfigSnapshot> {
        self.print_configs
            .iter()
            .enumerate()
            .map(|(sheet, stored)| PrintConfigSnapshot {
                sheet,
                revision: stored.revision,
                config: stored.config.clone(),
            })
            .collect()
    }

    pub fn restore_print_configs(
        &mut self,
        snapshots: Vec<PrintConfigSnapshot>,
    ) -> Result<usize, PrintConfigError> {
        if self.is_inside_custom_call() {
            return Err(PrintConfigError::MutationDuringCustomCall);
        }
        let restored_count = snapshots.len();
        let restored = validate_print_config_snapshots(self.print_configs.len(), snapshots)?;
        self.print_configs = restored;
        Ok(restored_count)
    }
}

fn validate_print_config(config: &PrintConfig) -> Result<(), PrintConfigError> {
    if let PrintScale::Percent { percent } = &config.scale {
        if !percent.is_finite() || *percent <= 0.0 {
            return Err(PrintConfigError::InvalidScale);
        }
    }
    if let PrintScale::Fit {
        pages_wide,
        pages_tall,
    } = &config.scale
    {
        if pages_wide == &Some(0) || pages_tall == &Some(0) {
            return Err(PrintConfigError::InvalidScale);
        }
    }
    if let Some(area) = config.print_area {
        if area != area.normalize() {
            return Err(PrintConfigError::InvalidPrintArea);
        }
    }
    Ok(())
}

fn validate_print_config_snapshots(
    sheet_count: usize,
    snapshots: Vec<PrintConfigSnapshot>,
) -> Result<Vec<SheetPrintConfig>, PrintConfigError> {
    let mut restored = vec![None; sheet_count];
    for snapshot in snapshots {
        if snapshot.sheet >= sheet_count {
            return Err(PrintConfigError::UnknownSheet);
        }
        if restored[snapshot.sheet].is_some() {
            return Err(PrintConfigError::DuplicateSheetSnapshot);
        }
        validate_print_config(&snapshot.config)?;
        restored[snapshot.sheet] = Some(SheetPrintConfig {
            revision: snapshot.revision,
            config: snapshot.config,
        });
    }
    Ok(restored
        .into_iter()
        .map(|entry| entry.unwrap_or_default())
        .collect())
}
