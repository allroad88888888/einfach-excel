use crate::number_format::NumberFormat;

/// Per-cell display + style information. Phase 6.
///
/// Format is independent of the atom dependency graph — changing a cell's
/// format never triggers a recompute. The view layer reads `format(addr)`
/// alongside `get_cell(addr)` when rendering.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CellFormat {
    pub number_format: NumberFormat,
    pub bold: bool,
    pub italic: bool,
    pub align: Align,
    pub font_size: Option<u32>,
    pub font_baseline: FontBaseline,
    /// HTML color string (`#rrggbb` / `red` / etc.); `None` = default.
    pub color: Option<String>,
    pub background: Option<String>,
    pub fill: Option<crate::CellFill>,
    /// Font family name (CSS-style). `None` = workbook default.
    pub font_family: Option<String>,
    pub underline: bool,
    pub strikethrough: bool,
    pub wrap_text: bool,
    /// Display-only scaling; stored font size stays unchanged. Wrapping takes precedence.
    pub shrink_to_fit: bool,
    /// Indent in Excel indent units (0..=15). Stored verbatim for round-trip.
    pub indent: u8,
    pub vertical_align: VerticalAlign,
    pub rotation: Rotation,
    pub borders: CellBorders,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum VerticalAlign {
    #[default]
    Default,
    Top,
    Center,
    Bottom,
    Justify,
    Distributed,
}

/// Text rotation in degrees `[-90, 90]`, or the special `Vertical` mode for
/// character-stacked layout. Stored verbatim for JS round-trip.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Rotation {
    #[default]
    None,
    Degrees(i16),
    Vertical,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BorderStyle {
    #[default]
    None,
    Thin,
    Medium,
    Thick,
    Dashed,
    Dotted,
    Double,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BorderSpec {
    pub style: BorderStyle,
    pub color: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CellBorders {
    pub top: Option<BorderSpec>,
    pub right: Option<BorderSpec>,
    pub bottom: Option<BorderSpec>,
    pub left: Option<BorderSpec>,
    pub diag_up: Option<BorderSpec>,
    pub diag_down: Option<BorderSpec>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Align {
    #[default]
    Default,
    Left,
    Center,
    Right,
    /// Excel `centerContinuous`: text of the anchor cell is centered across the
    /// following empty cells that share this alignment. Display-only, no merge.
    CenterAcross,
}

/// Glyph baseline is independent of alignment within the cell box.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FontBaseline {
    #[default]
    Normal,
    Superscript,
    Subscript,
}
