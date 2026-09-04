// 三类稀疏样式的持久化 wire；旧 v1 矩形层只在读入时迁移。

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CellStyleSnapshotJSON {
    addr: String,
    format: CellFormatJSON,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct IndexedStyleSnapshotJSON {
    index: u32,
    format: CellFormatJSON,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct IndexedRowStyleSnapshotJSON {
    index: u32,
    format: CellFormatJSON,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    height: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LegacyRangeFormatJSON {
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
    #[serde(rename = "cellStyles", alias = "cellFormats", default)]
    cell_styles: Vec<CellStyleSnapshotJSON>,
    #[serde(rename = "rowStyles", default)]
    row_styles: Vec<IndexedRowStyleSnapshotJSON>,
    #[serde(rename = "columnStyles", default)]
    column_styles: Vec<IndexedStyleSnapshotJSON>,
    #[serde(
        rename = "rangeFormats",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    legacy_range_formats: Vec<LegacyRangeFormatJSON>,
}

impl FormatRangeSnapshotJSON {
    fn from_snapshot(snapshot: &FormatRangeSnapshot, sheet: Option<u32>) -> Self {
        Self {
            sheet,
            start_row: snapshot.range.start.row,
            start_col: snapshot.range.start.col,
            end_row: snapshot.range.end.row,
            end_col: snapshot.range.end.col,
            cell_styles: snapshot
                .cell_styles
                .iter()
                .map(|(addr, style)| CellStyleSnapshotJSON {
                    addr: addr.to_string(),
                    format: CellFormatJSON::from_style(style),
                })
                .collect(),
            row_styles: snapshot
                .row_styles
                .iter()
                .map(|(index, style)| IndexedRowStyleSnapshotJSON {
                    index: *index,
                    format: CellFormatJSON::from_style(&style.format),
                    height: style.height,
                })
                .collect(),
            column_styles: indexed_styles_to_json(&snapshot.column_styles),
            legacy_range_formats: Vec::new(),
        }
    }

    fn into_snapshot(self) -> Result<FormatRangeSnapshot, JsValue> {
        let mut cell_styles = Vec::new();
        for layer in self.legacy_range_formats {
            let range = CellRange::new(
                CellAddress::new(layer.start_row, layer.start_col),
                CellAddress::new(layer.end_row, layer.end_col),
            )
            .normalize();
            let style = layer.format.into_style();
            cell_styles.extend(range.iter().map(|addr| (addr, style.clone())));
        }
        for cell in self.cell_styles {
            let addr = CellAddress::parse(&cell.addr).ok_or_else(|| {
                JsValue::from_str(&format!("invalid cell address: {}", cell.addr))
            })?;
            cell_styles.push((addr, cell.format.into_style()));
        }
        Ok(FormatRangeSnapshot {
            range: CellRange::new(
                CellAddress::new(self.start_row, self.start_col),
                CellAddress::new(self.end_row, self.end_col),
            )
            .normalize(),
            cell_styles,
            row_styles: self
                .row_styles
                .into_iter()
                .map(|entry| {
                    (
                        entry.index,
                        RowStyle {
                            format: entry.format.into_style(),
                            height: entry.height,
                        },
                    )
                })
                .collect(),
            column_styles: indexed_styles_from_json(self.column_styles),
        })
    }
}

fn indexed_styles_to_json(styles: &[(u32, CellStyle)]) -> Vec<IndexedStyleSnapshotJSON> {
    styles
        .iter()
        .map(|(index, style)| IndexedStyleSnapshotJSON {
            index: *index,
            format: CellFormatJSON::from_style(style),
        })
        .collect()
}

fn indexed_styles_from_json(styles: Vec<IndexedStyleSnapshotJSON>) -> Vec<(u32, CellStyle)> {
    styles
        .into_iter()
        .map(|entry| (entry.index, entry.format.into_style()))
        .collect()
}
