#[derive(Clone, Debug, Serialize, Deserialize)]
struct CellFormatSnapshotJSON {
    addr: String,
    format: CellFormatJSON,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct RangeFormatLayerJSON {
    #[serde(rename = "startRow")]
    start_row: u32,
    #[serde(rename = "startCol")]
    start_col: u32,
    #[serde(rename = "endRow")]
    end_row: u32,
    #[serde(rename = "endCol")]
    end_col: u32,
    format: CellFormatJSON,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct FormatRangeSnapshotJSON {
    #[serde(default)]
    sheet: Option<u32>,
    #[serde(rename = "startRow")]
    start_row: u32,
    #[serde(rename = "startCol")]
    start_col: u32,
    #[serde(rename = "endRow")]
    end_row: u32,
    #[serde(rename = "endCol")]
    end_col: u32,
    #[serde(rename = "cellFormats")]
    cell_formats: Vec<CellFormatSnapshotJSON>,
    #[serde(rename = "rangeFormats")]
    range_formats: Vec<RangeFormatLayerJSON>,
}

impl FormatRangeSnapshotJSON {
    fn from_snapshot(snapshot: &FormatRangeSnapshot, sheet: Option<u32>) -> Self {
        FormatRangeSnapshotJSON {
            sheet,
            start_row: snapshot.range.start.row,
            start_col: snapshot.range.start.col,
            end_row: snapshot.range.end.row,
            end_col: snapshot.range.end.col,
            cell_formats: snapshot
                .cell_formats
                .iter()
                .map(|(addr, fmt)| CellFormatSnapshotJSON {
                    addr: addr.to_string(),
                    format: CellFormatJSON::from_format(fmt),
                })
                .collect(),
            range_formats: snapshot
                .range_formats
                .iter()
                .map(|layer| RangeFormatLayerJSON {
                    start_row: layer.range.start.row,
                    start_col: layer.range.start.col,
                    end_row: layer.range.end.row,
                    end_col: layer.range.end.col,
                    format: CellFormatJSON::from_format(&layer.fmt),
                })
                .collect(),
        }
    }

    fn into_snapshot(self) -> Result<FormatRangeSnapshot, JsValue> {
        let mut cell_formats = Vec::with_capacity(self.cell_formats.len());
        for cell in self.cell_formats {
            let addr = CellAddress::parse(&cell.addr).ok_or_else(|| {
                JsValue::from_str(&format!("invalid cell address: {}", cell.addr))
            })?;
            cell_formats.push((addr, cell.format.into_format()));
        }
        let range_formats = self
            .range_formats
            .into_iter()
            .map(|layer| RangeFormatSnapshotLayer {
                range: CellRange::new(
                    CellAddress::new(layer.start_row, layer.start_col),
                    CellAddress::new(layer.end_row, layer.end_col),
                )
                .normalize(),
                fmt: layer.format.into_format(),
            })
            .collect();
        Ok(FormatRangeSnapshot {
            range: CellRange::new(
                CellAddress::new(self.start_row, self.start_col),
                CellAddress::new(self.end_row, self.end_col),
            )
            .normalize(),
            cell_formats,
            range_formats,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ViewportRowHeightJSON {
    #[serde(rename = "rowIndex")]
    row_index: u32,
    #[serde(rename = "heightPx")]
    height_px: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ViewportColumnWidthJSON {
    #[serde(rename = "colIndex")]
    col_index: u32,
    #[serde(rename = "widthPx")]
    width_px: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ViewportSizeSnapshotJSON {
    #[serde(default)]
    sheet: Option<u32>,
    #[serde(rename = "startRow")]
    start_row: u32,
    #[serde(rename = "startCol")]
    start_col: u32,
    #[serde(rename = "endRow")]
    end_row: u32,
    #[serde(rename = "endCol")]
    end_col: u32,
    #[serde(rename = "rowHeights", default, skip_serializing_if = "Vec::is_empty")]
    row_heights: Vec<ViewportRowHeightJSON>,
    #[serde(rename = "colWidths", default, skip_serializing_if = "Vec::is_empty")]
    col_widths: Vec<ViewportColumnWidthJSON>,
}

impl ViewportSizeSnapshotJSON {
    fn from_sheet_range(sheet: &Sheet, range: CellRange, sheet_idx: Option<u32>) -> Self {
        let range = range.normalize();
        ViewportSizeSnapshotJSON {
            sheet: sheet_idx,
            start_row: range.start.row,
            start_col: range.start.col,
            end_row: range.end.row,
            end_col: range.end.col,
            row_heights: sheet
                .row_heights_in_range(range.start.row, range.end.row)
                .into_iter()
                .map(|(row_index, height_px)| ViewportRowHeightJSON {
                    row_index,
                    height_px,
                })
                .collect(),
            col_widths: sheet
                .col_widths_in_range(range.start.col, range.end.col)
                .into_iter()
                .map(|(col_index, width_px)| ViewportColumnWidthJSON {
                    col_index,
                    width_px,
                })
                .collect(),
        }
    }

    fn from_full_sheet(sheet: &Sheet, sheet_idx: u32) -> Self {
        ViewportSizeSnapshotJSON {
            sheet: Some(sheet_idx),
            start_row: 0,
            start_col: 0,
            end_row: u32::MAX,
            end_col: u32::MAX,
            row_heights: sheet
                .all_row_heights()
                .into_iter()
                .map(|(row_index, height_px)| ViewportRowHeightJSON {
                    row_index,
                    height_px,
                })
                .collect(),
            col_widths: sheet
                .all_col_widths()
                .into_iter()
                .map(|(col_index, width_px)| ViewportColumnWidthJSON {
                    col_index,
                    width_px,
                })
                .collect(),
        }
    }

    fn is_empty(&self) -> bool {
        self.row_heights.is_empty() && self.col_widths.is_empty()
    }

    fn into_size_facts(self) -> Result<(Vec<(u32, u32)>, Vec<(u32, u32)>), String> {
        let mut row_heights = Vec::with_capacity(self.row_heights.len());
        for row in self.row_heights {
            if row.height_px == 0 {
                return Err(format!("invalid row height at row {}", row.row_index));
            }
            if row.row_index < self.start_row || row.row_index > self.end_row {
                return Err(format!(
                    "row height outside snapshot range: {}",
                    row.row_index
                ));
            }
            row_heights.push((row.row_index, row.height_px));
        }

        let mut col_widths = Vec::with_capacity(self.col_widths.len());
        for col in self.col_widths {
            if col.width_px == 0 {
                return Err(format!("invalid column width at col {}", col.col_index));
            }
            if col.col_index < self.start_col || col.col_index > self.end_col {
                return Err(format!(
                    "column width outside snapshot range: {}",
                    col.col_index
                ));
            }
            col_widths.push((col.col_index, col.width_px));
        }

        Ok((row_heights, col_widths))
    }
}

impl NumberFormatJSON {
    fn into_number_format(self) -> NumberFormat {
        match self.kind.as_str() {
            "number" | "decimal" => NumberFormat::Decimal {
                digits: self.digits.unwrap_or(2),
                thousands: self.thousands.unwrap_or(false),
            },
            "percent" | "percentage" => NumberFormat::Percent {
                digits: self.digits.unwrap_or(0),
            },
            "currency" => NumberFormat::Currency {
                symbol: self.symbol.unwrap_or_else(|| "$".into()),
                digits: self.digits.unwrap_or(2),
            },
            "date" => NumberFormat::Date(self.pattern.unwrap_or_else(|| "yyyy-mm-dd".into())),
            "custom" => self
                .pattern
                .map(NumberFormat::Custom)
                .unwrap_or(NumberFormat::General),
            _ => NumberFormat::General,
        }
    }

    fn from_number_format(nf: &NumberFormat) -> Self {
        match nf {
            NumberFormat::General => NumberFormatJSON {
                kind: "general".into(),
                digits: None,
                symbol: None,
                pattern: None,
                thousands: None,
            },
            NumberFormat::Decimal { digits, thousands } => NumberFormatJSON {
                kind: "number".into(),
                digits: Some(*digits),
                symbol: None,
                pattern: None,
                thousands: Some(*thousands),
            },
            NumberFormat::Percent { digits } => NumberFormatJSON {
                kind: "percent".into(),
                digits: Some(*digits),
                symbol: None,
                pattern: None,
                thousands: None,
            },
            NumberFormat::Currency { symbol, digits } => NumberFormatJSON {
                kind: "currency".into(),
                digits: Some(*digits),
                symbol: Some(symbol.clone()),
                pattern: None,
                thousands: None,
            },
            NumberFormat::Date(p) => NumberFormatJSON {
                kind: "date".into(),
                digits: None,
                symbol: None,
                pattern: Some(p.clone()),
                thousands: None,
            },
            NumberFormat::Custom(p) => NumberFormatJSON {
                kind: "custom".into(),
                digits: None,
                symbol: None,
                pattern: Some(p.clone()),
                thousands: None,
            },
        }
    }
}
