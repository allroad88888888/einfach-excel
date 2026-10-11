//! Table 的语义样式：仅保存预设和开关，按当前位置生成默认显示属性。
use crate::{CellAddress, CellStyle, TableEntry};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TableStylePreset {
    #[default]
    None,
    Blue,
    Green,
    Gray,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStyle {
    pub preset: TableStylePreset,
    pub banded_rows: bool,
    pub first_column: bool,
    #[serde(default)]
    pub banded_columns: bool,
    #[serde(default)]
    pub last_column: bool,
}

impl Default for TableStyle {
    fn default() -> Self {
        // 旧文件未保存样式时保留原外观，不擅自替旧表上色。
        Self {
            preset: TableStylePreset::None,
            banded_rows: true,
            first_column: false,
            banded_columns: false,
            last_column: false,
        }
    }
}

impl TableStyle {
    pub(crate) fn cell_style(self, table: &TableEntry, addr: CellAddress) -> CellStyle {
        let (header, stripe) = match self.preset {
            TableStylePreset::None => return CellStyle::default(),
            TableStylePreset::Blue => ("#1f4e78", "#d9e8f5"),
            TableStylePreset::Green => ("#276347", "#e2efda"),
            TableStylePreset::Gray => ("#4b5563", "#edf0f3"),
        };
        let range = table.range();
        let is_header = table.has_headers() && addr.row == range.start.row;
        let is_total = table.has_totals() && addr.row == range.end.row;
        let data_start = range.start.row + u32::from(table.has_headers());
        // 条纹锚定表的实际起点，不随视口、隐藏行列或手动格式重新编号。
        // 两个开关独立：命中任一条纹即可着色，表头与汇总仍优先。
        let band = !is_header && ((self.banded_rows && (addr.row - data_start) % 2 == 0)
            || (self.banded_columns && (addr.col - range.start.col) % 2 == 0));
        CellStyle {
            background: Some(Some(
                if is_header {
                    header
                } else if is_total || band {
                    stripe
                } else {
                    "#ffffff"
                }
                .into(),
            )),
            color: Some(Some(if is_header { "#ffffff" } else { "#1f2937" }.into())),
            bold: Some(is_header || is_total
                || (self.first_column && addr.col == range.start.col)
                || (self.last_column && addr.col == range.end.col)),
            ..Default::default()
        }
    }
}
