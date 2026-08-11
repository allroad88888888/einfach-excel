// Serde wire conversion for the workbook-owned print configuration.

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintAreaJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum PrintOrientationJSON {
    Portrait,
    Landscape,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum PrintScaleJSON {
    Percent {
        percent: f64,
    },
    Fit {
        #[serde(skip_serializing_if = "Option::is_none")]
        pages_wide: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pages_tall: Option<u32>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ManualPageBreakAxisJSON {
    Row,
    Column,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManualPageBreakJSON {
    axis: ManualPageBreakAxisJSON,
    index: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct HeaderFooterFieldsJSON {
    #[serde(skip_serializing_if = "Option::is_none")]
    left: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    center: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    right: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintConfigJSON {
    #[serde(skip_serializing_if = "Option::is_none")]
    print_area: Option<PrintAreaJSON>,
    #[serde(default)]
    manual_page_breaks: Vec<ManualPageBreakJSON>,
    scale: PrintScaleJSON,
    orientation: PrintOrientationJSON,
    #[serde(skip_serializing_if = "Option::is_none")]
    header: Option<HeaderFooterFieldsJSON>,
    #[serde(skip_serializing_if = "Option::is_none")]
    footer: Option<HeaderFooterFieldsJSON>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintConfigSnapshotJSON {
    sheet: u32,
    revision: u64,
    config: PrintConfigJSON,
}

impl PrintConfigJSON {
    fn into_config(self) -> Result<einfach_excel_core::PrintConfig, String> {
        let print_area = self
            .print_area
            .map(|area| {
                if area.row_end < area.row_start || area.col_end < area.col_start {
                    return Err("print area must be normalized".to_string());
                }
                Ok(CellRange::new(
                    CellAddress::new(area.row_start, area.col_start),
                    CellAddress::new(area.row_end, area.col_end),
                ))
            })
            .transpose()?;
        Ok(einfach_excel_core::PrintConfig {
            print_area,
            manual_page_breaks: self
                .manual_page_breaks
                .into_iter()
                .map(|page_break| einfach_excel_core::ManualPageBreak {
                    axis: match page_break.axis {
                        ManualPageBreakAxisJSON::Row => {
                            einfach_excel_core::ManualPageBreakAxis::Row
                        }
                        ManualPageBreakAxisJSON::Column => {
                            einfach_excel_core::ManualPageBreakAxis::Column
                        }
                    },
                    index: page_break.index,
                })
                .collect(),
            scale: match self.scale {
                PrintScaleJSON::Percent { percent } => {
                    einfach_excel_core::PrintScale::Percent { percent }
                }
                PrintScaleJSON::Fit {
                    pages_wide,
                    pages_tall,
                } => einfach_excel_core::PrintScale::Fit {
                    pages_wide,
                    pages_tall,
                },
            },
            orientation: match self.orientation {
                PrintOrientationJSON::Portrait => einfach_excel_core::PrintOrientation::Portrait,
                PrintOrientationJSON::Landscape => einfach_excel_core::PrintOrientation::Landscape,
            },
            header: self.header.map(Into::into),
            footer: self.footer.map(Into::into),
        })
    }

    fn from_config(config: &einfach_excel_core::PrintConfig) -> Self {
        Self {
            print_area: config.print_area.map(|area| PrintAreaJSON {
                row_start: area.start.row,
                row_end: area.end.row,
                col_start: area.start.col,
                col_end: area.end.col,
            }),
            manual_page_breaks: config
                .manual_page_breaks
                .iter()
                .map(|page_break| ManualPageBreakJSON {
                    axis: match page_break.axis {
                        einfach_excel_core::ManualPageBreakAxis::Row => {
                            ManualPageBreakAxisJSON::Row
                        }
                        einfach_excel_core::ManualPageBreakAxis::Column => {
                            ManualPageBreakAxisJSON::Column
                        }
                    },
                    index: page_break.index,
                })
                .collect(),
            scale: match &config.scale {
                einfach_excel_core::PrintScale::Percent { percent } => {
                    PrintScaleJSON::Percent { percent: *percent }
                }
                einfach_excel_core::PrintScale::Fit {
                    pages_wide,
                    pages_tall,
                } => PrintScaleJSON::Fit {
                    pages_wide: *pages_wide,
                    pages_tall: *pages_tall,
                },
            },
            orientation: match config.orientation {
                einfach_excel_core::PrintOrientation::Portrait => PrintOrientationJSON::Portrait,
                einfach_excel_core::PrintOrientation::Landscape => PrintOrientationJSON::Landscape,
            },
            header: config.header.as_ref().map(Into::into),
            footer: config.footer.as_ref().map(Into::into),
        }
    }
}

impl From<&einfach_excel_core::HeaderFooterFields> for HeaderFooterFieldsJSON {
    fn from(value: &einfach_excel_core::HeaderFooterFields) -> Self {
        Self {
            left: value.left.clone(),
            center: value.center.clone(),
            right: value.right.clone(),
        }
    }
}

impl From<HeaderFooterFieldsJSON> for einfach_excel_core::HeaderFooterFields {
    fn from(value: HeaderFooterFieldsJSON) -> Self {
        Self {
            left: value.left,
            center: value.center,
            right: value.right,
        }
    }
}

impl PrintConfigSnapshotJSON {
    fn from_snapshot(snapshot: &einfach_excel_core::PrintConfigSnapshot) -> Self {
        Self {
            sheet: snapshot.sheet as u32,
            revision: snapshot.revision,
            config: PrintConfigJSON::from_config(&snapshot.config),
        }
    }

    fn into_snapshot(self) -> Result<einfach_excel_core::PrintConfigSnapshot, String> {
        Ok(einfach_excel_core::PrintConfigSnapshot {
            sheet: self.sheet as usize,
            revision: self.revision,
            config: self.config.into_config()?,
        })
    }
}
