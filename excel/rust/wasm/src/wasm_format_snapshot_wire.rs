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
